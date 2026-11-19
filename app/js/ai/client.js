// One chat call, any provider. Streams text as it is written, learns live token limits from
// provider headers, paces requests politely on tight TPM tiers, and distinguishes transient
// rate limits from permanently oversized payloads so the pipeline can compact and retry.
import { http, secrets } from '../host.js';
import { PROVIDERS, baseUrl, describeHttpError, hostOf } from './providers.js';
import { estimateTokens } from './context.js';
import { state } from '../store.js';
import { sleep } from '../util.js';

export class AiError extends Error {
  constructor(message, { status = 0, kind = 'error', tokenLimit = 0, requestedTokens = 0, truncated = false } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.kind = kind;          // setup | auth | rate | too_large | format | refusal | error
    this.tokenLimit = tokenLimit;
    this.requestedTokens = requestedTokens;
    this.truncated = truncated;
  }
}

export function activeConfig() {
  const s = state.settings;
  const id = s.ai.provider;
  const p = PROVIDERS[id];
  if (!p) return { id: '', p: null, model: '', base: '' };
  return { id, p, model: (s.ai.models[id] || p.defaultModel || '').trim(), base: baseUrl(id, s) };
}

/** { ok, reason } - whether a generation can start right now. */
export async function readiness() {
  const cfg = activeConfig();
  if (!cfg.p) return { ok: false, reason: 'No AI engine is set up yet.' };
  if (!cfg.model) return { ok: false, reason: `Choose a model for ${cfg.p.name}.` };
  if (cfg.p.key === true) {
    const info = await secrets.info(cfg.id);
    if (!info.exists) return { ok: false, reason: `Add your ${cfg.p.name} API key.` };
  }
  return { ok: true, reason: '' };
}

// ---------------------------------------------------------------------------------- live rate-limit awareness

const rateState = new Map();
const rateKey = (cfg) => (cfg && cfg.id ? `${cfg.id}:${cfg.model || ''}` : '');

/** Parses duration headers/messages ("12", "45.3s", "500ms", "1m5.2s", or ISO timestamps) into seconds. */
export function parseDurationSec(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
  if (/^\d{4}-\d{2}-\d{2}T/i.test(s)) {
    const ts = Date.parse(s);
    return Number.isFinite(ts) ? Math.max(0, (ts - Date.now()) / 1000) : 0;
  }
  const low = s.toLowerCase();
  let total = 0;
  let matched = false;
  for (const m of low.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)(?![a-z])/g)) {
    matched = true;
    const n = parseFloat(m[1]);
    const u = m[2];
    if (u === 'ms') total += n / 1000;
    else if (u.startsWith('h')) total += n * 3600;
    else if (u.startsWith('m')) total += n * 60;
    else if (u.startsWith('s')) total += n;
  }
  return matched ? total : 0;
}

const intHeader = (h, name) => {
  if (!h || h[name] == null || h[name] === '') return null;
  const n = parseInt(String(h[name]), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Extracts rate-limit headers and error-body clues (Groq TPM messages, OpenAI context errors,
 * Retry-After) and separates permanently oversized requests from transient busy windows.
 */
export function parseRateInfo(headers, body, status = 0) {
  const h = headers || {};
  const text = String(body || '');
  let limitTokens = intHeader(h, 'x-ratelimit-limit-tokens') ?? intHeader(h, 'anthropic-ratelimit-tokens-limit') ?? 0;
  const remainingTokens = intHeader(h, 'x-ratelimit-remaining-tokens') ?? intHeader(h, 'anthropic-ratelimit-tokens-remaining');
  const resetTokensSec = parseDurationSec(h['x-ratelimit-reset-tokens'] || h['anthropic-ratelimit-tokens-reset']);
  const remainingReqs = intHeader(h, 'x-ratelimit-remaining-requests') ?? intHeader(h, 'anthropic-ratelimit-requests-remaining');
  const resetReqsSec = parseDurationSec(h['x-ratelimit-reset-requests'] || h['anthropic-ratelimit-requests-reset']);
  const retryAfterSec = parseDurationSec(h['retry-after']);

  const limMatch = /\bLimit\s+(\d+)\b/i.exec(text) || /maximum\s+context\s+length\s+is\s+(\d+)\s+tokens/i.exec(text);
  const reqMatch = /\bRequested\s+(\d+)\b/i.exec(text);
  const usedMatch = /\bUsed\s+(\d+)\b/i.exec(text);
  const waitMatch = /try\s+again\s+in\s+([0-9]+(?:\.[0-9]+)?\s*(?:ms|h|m|s)(?:\s*[0-9]+(?:\.[0-9]+)?\s*(?:ms|s))?)/i.exec(text);

  const bodyLimit = limMatch ? parseInt(limMatch[1], 10) : 0;
  if (bodyLimit > 0 && (!limitTokens || bodyLimit < limitTokens)) limitTokens = bodyLimit;
  const requestedTokens = reqMatch ? parseInt(reqMatch[1], 10) : 0;
  const usedTokens = usedMatch ? parseInt(usedMatch[1], 10) : 0;
  const bodyWaitSec = waitMatch ? parseDurationSec(waitMatch[1]) : 0;

  const transientTpm = usedTokens > 0 && requestedTokens > 0 && limitTokens > 0 && requestedTokens <= limitTokens;
  const bodyTooLarge = /(?:request\s+too\s+large|context_length_exceeded|maximum\s+context\s+length|prompt\s+is\s+too\s+long|too\s+many\s+tokens|input\s+is\s+too\s+long|reduce\s+the\s+length\s+of\s+the\s+messages)/i.test(text);
  const tooLarge = status === 413
    || (requestedTokens > 0 && limitTokens > 0 && requestedTokens > limitTokens)
    || ((status === 400 || status === 422 || status === 429) && bodyTooLarge && !transientTpm);

  return { limitTokens, remainingTokens, resetTokensSec, remainingReqs, resetReqsSec, retryAfterSec, bodyWaitSec, requestedTokens, usedTokens, tooLarge };
}

export function learnedLimitFor(cfg) {
  const st = rateState.get(rateKey(cfg));
  if (!st) return 0;
  if (st.hardLimit && st.limitTokens) return Math.min(st.hardLimit, st.limitTokens);
  return st.hardLimit || st.limitTokens || 0;
}

export function noteLimit(cfg, limit) {
  const k = rateKey(cfg);
  if (!k || !limit || limit <= 0) return;
  const prev = rateState.get(k) || {};
  const hardLimit = prev.hardLimit ? Math.min(prev.hardLimit, limit) : limit;
  const limitTokens = prev.limitTokens ? Math.min(prev.limitTokens, limit) : limit;
  rateState.set(k, { ...prev, hardLimit, limitTokens, updatedAt: Date.now() });
}

function recordRateHeaders(cfg, headers) {
  const k = rateKey(cfg);
  if (!k || !headers) return;
  const info = parseRateInfo(headers, '', 200);
  if (!info.limitTokens && info.remainingTokens == null && info.remainingReqs == null) return;
  const now = Date.now();
  const prev = rateState.get(k) || {};
  rateState.set(k, {
    ...prev,
    limitTokens: info.limitTokens || prev.limitTokens || 0,
    remainingTokens: info.remainingTokens != null ? info.remainingTokens : prev.remainingTokens,
    resetTokensAt: info.resetTokensSec > 0 ? now + info.resetTokensSec * 1000 : (prev.resetTokensAt || 0),
    remainingReqs: info.remainingReqs != null ? info.remainingReqs : prev.remainingReqs,
    resetReqsAt: info.resetReqsSec > 0 ? now + info.resetReqsSec * 1000 : (prev.resetReqsAt || 0),
    updatedAt: now,
  });
}

export function resetRateState() { rateState.clear(); }

function abortError() {
  const e = new Error('Cancelled');
  e.name = 'AbortError';
  return e;
}

/** Sleeps for `ms` while honouring `signal` immediately and optionally ticking each second. */
function sleepAbortable(ms, signal, onTick) {
  if (signal && signal.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const end = Date.now() + ms;
    let tickTimer = null;
    const cleanup = () => {
      clearTimeout(doneTimer);
      if (tickTimer) clearInterval(tickTimer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const doneTimer = setTimeout(() => { cleanup(); resolve(); }, ms);
    if (onTick) {
      onTick(Math.max(1, Math.ceil(ms / 1000)));
      if (ms >= 1500) {
        tickTimer = setInterval(() => {
          const left = Math.max(1, Math.ceil((end - Date.now()) / 1000));
          onTick(left);
        }, 1000);
      }
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function paceIfNeeded(cfg, o) {
  const st = rateState.get(rateKey(cfg));
  if (!st) return;
  const now = Date.now();
  let waitMs = 0;
  if (st.remainingTokens != null && st.resetTokensAt > now) {
    const need = estimateTokens(o.system) + estimateTokens(o.user) + (o.expectedOut || 900);
    const threshold = st.limitTokens ? Math.min(need, Math.floor(st.limitTokens * 0.9)) : need;
    if (st.remainingTokens < threshold) waitMs = Math.max(waitMs, st.resetTokensAt - now + 250);
  }
  if (st.remainingReqs === 0 && st.resetReqsAt > now) {
    waitMs = Math.max(waitMs, st.resetReqsAt - now + 250);
  }
  if (waitMs > 200 && waitMs <= 62000) {
    await sleepAbortable(waitMs, o.signal, (sec) => {
      if (o.onStatus) o.onStatus(`${cfg.p.name} token limit cooling down. Continuing in ${sec} s`);
    });
  }
}

// ---------------------------------------------------------------------------------- request & stream parsing

const supportsEffort = (m) => /^claude-(fable-5|mythos-5|opus-5|opus-4-[5-8]|sonnet-5|sonnet-4-6|haiku-5)/.test(m);
const supportsFallbacks = (m) => /^claude-(fable-5-[12]|opus-5|sonnet-5-5)/.test(m);

function buildRequest(cfg, o, lean) {
  const { p, id, model, base } = cfg;
  const headers = { 'Content-Type': 'application/json' };
  let url = '';
  let body = {};

  if (p.kind === 'anthropic') {
    url = base + '/messages';
    headers['x-api-key'] = '{{secret}}';
    headers['anthropic-version'] = '2026-10-21';
    body = { model, max_tokens: lean ? 16000 : 64000, stream: true, system: o.system, messages: [{ role: 'user', content: o.user }] };
    if (!lean && supportsEffort(model)) body.output_config = { effort: o.effort || 'medium' };
    if (!lean && supportsFallbacks(model)) {
      // If a safety classifier declines, the API re-runs the request on its default fallback model.
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
  } else if (p.kind === 'gemini') {
    url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    headers['x-goog-api-key'] = '{{secret}}';
    body = { systemInstruction: { parts: [{ text: o.system }] }, contents: [{ role: 'user', parts: [{ text: o.user }] }], generationConfig: {} };
    if (o.json && !lean) body.generationConfig.responseMimeType = 'application/json';
  } else if (p.kind === 'ollama') {
    url = base + '/api/chat';
    body = {
      model, stream: true,
      messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
      options: { temperature: o.temperature == null ? 0.5 : o.temperature, num_ctx: 16384 },
    };
    if (o.json && !lean) body.format = 'json';
  } else {
    url = base + '/chat/completions';
    headers.Accept = 'text/event-stream';
    if (o.hasKey) headers.Authorization = 'Bearer {{secret}}';
    if (id === 'openrouter') headers['X-Title'] = 'JobMech';
    body = { model, stream: true, messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }] };
    if (!lean) {
      if (o.temperature != null) body.temperature = o.temperature;
      if (o.json) body.response_format = { type: 'json_object' };
    }
  }
  return { url, headers, body: JSON.stringify(body), secret: o.hasKey ? id : '' };
}

/** Feeds raw stream text, calls back with complete lines. */
function lineSplitter(onLine) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  };
}

function makeParser(kind, sink) {
  const data = (line) => (line.startsWith('data:') ? line.slice(5).trim() : null);
  if (kind === 'ollama') {
    return lineSplitter((line) => {
      let j; try { j = JSON.parse(line); } catch { return; }
      if (j.error) { sink.error = String(j.error); return; }
      if (j.message && j.message.content) sink.add(j.message.content);
      else if (j.message && j.message.thinking) sink.thinking();
    });
  }
  if (kind === 'anthropic') {
    return lineSplitter((line) => {
      const d = data(line); if (!d) return;
      let j; try { j = JSON.parse(d); } catch { return; }
      if (j.type === 'content_block_delta' && j.delta) {
        if (j.delta.type === 'text_delta') sink.add(j.delta.text || '');
        else sink.thinking();
      } else if (j.type === 'content_block_start') sink.thinking();
      else if (j.type === 'message_delta' && j.delta && j.delta.stop_reason) sink.finish = j.delta.stop_reason;
      else if (j.type === 'error' && j.error) sink.error = j.error.message || 'The provider reported an error.';
    });
  }
  if (kind === 'gemini') {
    return lineSplitter((line) => {
      const d = data(line); if (!d) return;
      let j; try { j = JSON.parse(d); } catch { return; }
      if (j.error) { sink.error = j.error.message || 'The provider reported an error.'; return; }
      if (j.promptFeedback && j.promptFeedback.blockReason) sink.finish = 'refusal';
      const c = j.candidates && j.candidates[0];
      if (!c) return;
      for (const part of (c.content && c.content.parts) || []) {
        if (part.thought) sink.thinking();
        else if (part.text) sink.add(part.text);
      }
      if (c.finishReason) sink.finish = /SAFETY|PROHIBITED|BLOCK/i.test(c.finishReason) ? 'refusal' : (c.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'stop');
    });
  }
  return lineSplitter((line) => {
    const d = data(line); if (!d || d === '[DONE]') return;
    let j; try { j = JSON.parse(d); } catch { return; }
    if (j.error) { sink.error = (j.error.message || 'The provider reported an error.') + (j.error.metadata && j.error.metadata.raw ? ' ' + String(j.error.metadata.raw).slice(0, 160) : ''); return; }
    const c = j.choices && j.choices[0];
    if (!c) return;
    const dl = c.delta || c.message || {};
    if (typeof dl.content === 'string' && dl.content) sink.add(dl.content);
    else if (dl.reasoning || dl.reasoning_content) sink.thinking();
    if (c.finish_reason) sink.finish = c.finish_reason === 'length' ? 'max_tokens' : (c.finish_reason === 'content_filter' ? 'refusal' : 'stop');
  });
}

function bodyText(kind, raw) {
  // Some servers ignore "stream": the full answer then arrives as one JSON document.
  try {
    const j = JSON.parse(raw);
    if (kind === 'anthropic') return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (kind === 'ollama') return (j.message && j.message.content) || '';
    if (kind === 'gemini') return (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.filter((x) => !x.thought).map((x) => x.text || '').join('');
    return (((j.choices || [])[0] || {}).message || {}).content || '';
  } catch { return ''; }
}

/**
 * chat({ system, user, json, temperature, effort, expectedOut, task, signal, onDelta, onStatus }) -> { text, model, truncated }
 * onDelta(fullTextSoFar) is throttled; onStatus(message) reports waits and retries.
 */
export async function chat(o) {
  const cfg = activeConfig();
  if (!cfg.p) throw new AiError('No AI engine is set up yet. Open Settings to choose one.', { kind: 'setup' });
  if (!cfg.model) throw new AiError(`Choose a model for ${cfg.p.name} in Settings.`, { kind: 'setup' });

  if (cfg.p.kind === 'mock') {
    const { mockReply } = await import('./mock.js');
    return mockStream(mockReply(o), o);
  }

  let hasKey = false;
  if (cfg.p.key) {
    hasKey = (await secrets.info(cfg.id)).exists;
    if (!hasKey && cfg.p.key === true) throw new AiError(`Add your ${cfg.p.name} API key in Settings.`, { kind: 'setup' });
    if (hasKey && cfg.id === 'custom') {
      // the key is bound to the host it was saved for; a changed address needs the key saved again
      const info = await secrets.info('custom');
      if (info.host && info.host !== hostOf(cfg.base)) hasKey = false;
    }
  }

  await paceIfNeeded(cfg, o);

  let lean = false;
  let waits = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const req = buildRequest(cfg, Object.assign({}, o, { hasKey }), lean);
    let text = '';
    let lastEmit = 0;
    const sink = {
      error: '', finish: '',
      add(t) {
        text += t;
        const now = performance.now();
        if (o.onDelta && now - lastEmit > 90) { lastEmit = now; o.onDelta(text); }
      },
      thinking() { if (!text && o.onStatus) o.onStatus('thinking'); },
    };
    const parse = makeParser(cfg.p.kind, sink);
    // The raw stream is kept as well: a server that ignores "stream" sends one plain JSON document,
    // which the event parser skips and bodyText() below reads instead.
    let raw = '';
    const r = await http({ url: req.url, method: 'POST', headers: req.headers, body: req.body, secret: req.secret, stream: true, timeoutMs: 420000, signal: o.signal },
      (chunk) => { if (raw.length < 4000000) raw += chunk; parse(chunk); });
    parse('\n');

    recordRateHeaders(cfg, r.headers);

    if (r.status >= 400) {
      const info = parseRateInfo(r.headers, r.body, r.status);
      if (info.limitTokens > 0) noteLimit(cfg, info.limitTokens);
      if (info.tooLarge) {
        throw new AiError(describeHttpError(r.status, r.body, cfg.p.name), {
          status: r.status, kind: 'too_large', tokenLimit: info.limitTokens, requestedTokens: info.requestedTokens,
        });
      }
      if ((r.status === 400 || r.status === 422) && !lean) { lean = true; continue; }           // drop optional parameters once
      if ((r.status === 429 || r.status >= 500) && waits < 3) {
        waits++;
        const hint = info.retryAfterSec || info.bodyWaitSec || (r.status === 429 ? info.resetTokensSec : 0);
        const wait = Math.min(65, Math.max(0, hint)) || (waits === 1 ? 5 : waits === 2 ? 14 : 25);
        if (o.onStatus) o.onStatus(`${cfg.p.name} is busy. Trying again in ${Math.max(1, Math.round(wait))} s`);
        await sleepAbortable(wait * 1000, o.signal, wait >= 3
          ? (sec) => { if (o.onStatus) o.onStatus(`${cfg.p.name} is busy. Trying again in ${sec} s`); }
          : null);
        continue;
      }
      const kind = r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate' : 'error';
      throw new AiError(describeHttpError(r.status, r.body, cfg.p.name), { status: r.status, kind, tokenLimit: info.limitTokens });
    }

    if (!text) text = bodyText(cfg.p.kind, r.body || raw);
    if (sink.error && !text) {
      const info = parseRateInfo({}, sink.error, 429);
      if (info.tooLarge) {
        if (info.limitTokens > 0) noteLimit(cfg, info.limitTokens);
        throw new AiError(`${cfg.p.name}: ${sink.error}`, { kind: 'too_large', tokenLimit: info.limitTokens, requestedTokens: info.requestedTokens });
      }
      if (/rate|limit|overload|busy|capacity/i.test(sink.error) && waits < 3) {
        waits++;
        const wait = Math.min(65, Math.max(0, info.bodyWaitSec)) || 8;
        if (o.onStatus) o.onStatus(`${cfg.p.name} is busy. Trying again in ${Math.max(1, Math.round(wait))} s`);
        await sleepAbortable(wait * 1000, o.signal);
        continue;
      }
      throw new AiError(`${cfg.p.name}: ${sink.error}`);
    }
    if (sink.finish === 'refusal') throw new AiError('The AI declined to write this request. Try rephrasing the job text or use another model.', { kind: 'refusal' });
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
    if (!text) {
      if (attempt < 1) continue;
      throw new AiError(`${cfg.p.name} returned an empty answer. Try again or pick another model.`);
    }
    if (o.onDelta) o.onDelta(text);
    return { text, model: cfg.model, truncated: sink.finish === 'max_tokens' };
  }
  throw new AiError(`${cfg.p.name} did not answer after several attempts.`, { kind: 'rate' });
}

async function mockStream(full, o) {
  let shown = '';
  const step = Math.max(40, Math.ceil(full.length / 14));
  for (let i = 0; i < full.length; i += step) {
    if (o.signal && o.signal.aborted) throw abortError();
    shown = full.slice(0, i + step);
    if (o.onDelta) o.onDelta(shown);
    await sleep(45);
  }
  return { text: full, model: 'mock-writer', truncated: false };
}

// ---- JSON answers ------------------------------------------------------------------------------

function repairJson(s) {
  let out = '';
  let inStr = false;
  let escp = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escp) { out += ch; escp = false; continue; }
      if (ch === '\\') { out += ch; escp = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function parseJsonLoose(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const tries = [t];
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const cand of tries) {
    try { return JSON.parse(cand); } catch { /* next */ }
    try { return JSON.parse(repairJson(cand)); } catch { /* next */ }
  }
  return null;
}

/** Like chat(), but returns a parsed object. Asks once more when the answer is not valid JSON. */
export async function chatJson(o) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra = attempt === 0
      ? ''
      : last && last.truncated
        ? '\n\nIMPORTANT: your previous answer was cut off before the JSON closed. Keep wording slightly tighter and reply with ONE complete, valid JSON object only.'
        : '\n\nIMPORTANT: your previous answer could not be read. Reply with ONE valid JSON object only: no commentary, no markdown fences, every string properly quoted and closed.';
    const r = await chat(Object.assign({}, o, { json: true, user: o.user + extra, temperature: attempt === 0 ? o.temperature : 0.2 }));
    last = r;
    const obj = parseJsonLoose(r.text);
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && (!o.validate || o.validate(obj))) return obj;
    if (o.onStatus) o.onStatus('The answer was incomplete. Asking once more');
  }
  const truncated = !!(last && last.truncated);
  const why = truncated ? ' The answer was cut off, which usually means the model has a small output limit.' : '';
  throw new AiError('The AI answered in a format JobMech could not read.' + why + ' Try again, or choose a stronger model in Settings.', { kind: 'format', truncated });
}

export async function ping() {
  const r = await chat({ system: 'You are a connection test. Follow the instruction exactly.', user: 'Reply with the single word: OK', temperature: 0, effort: 'low', task: 'ping' });
  return r.text.trim().slice(0, 80);
}
