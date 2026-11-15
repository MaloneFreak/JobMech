// One chat call, any provider. Streams text as it is written, retries politely on rate limits,
// and never invents an answer: when the AI cannot be reached the caller gets a clear error.
import { http, secrets } from '../host.js';
import { PROVIDERS, baseUrl, describeHttpError, hostOf } from './providers.js';
import { state } from '../store.js';
import { sleep } from '../util.js';

export class AiError extends Error {
  constructor(message, { status = 0, kind = 'error' } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.kind = kind;          // setup | auth | rate | format | refusal | error
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
 * chat({ system, user, json, temperature, effort, task, signal, onDelta, onStatus }) -> { text, model }
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

  let lean = false;
  let waits = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
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

    if (r.status >= 400) {
      const retryAfter = Math.min(40, Math.max(0, parseFloat((r.headers && r.headers['retry-after']) || '0') || 0));
      if ((r.status === 400 || r.status === 422) && !lean) { lean = true; continue; }           // drop optional parameters once
      if ((r.status === 429 || r.status >= 500) && waits < 2) {
        waits++;
        const wait = retryAfter || (waits === 1 ? 5 : 14);
        if (o.onStatus) o.onStatus(`${cfg.p.name} is busy. Trying again in ${Math.round(wait)} s`);
        await sleep(wait * 1000);
        if (o.signal && o.signal.aborted) { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; }
        continue;
      }
      const kind = r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate' : 'error';
      throw new AiError(describeHttpError(r.status, r.body, cfg.p.name), { status: r.status, kind });
    }

    if (!text) text = bodyText(cfg.p.kind, r.body || raw);
    if (sink.error && !text) {
      if (/rate|limit|overload|busy|capacity/i.test(sink.error) && waits < 2) {
        waits++;
        if (o.onStatus) o.onStatus(`${cfg.p.name} is busy. Trying again in 8 s`);
        await sleep(8000);
        continue;
      }
      throw new AiError(`${cfg.p.name}: ${sink.error}`);
    }
    if (sink.finish === 'refusal') throw new AiError('The AI declined to write this request. Try rephrasing the job text or use another model.', { kind: 'refusal' });
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
    if (o.signal && o.signal.aborted) { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; }
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
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
    const extra = attempt === 0 ? '' : '\n\nIMPORTANT: your previous answer could not be read. Reply with ONE valid JSON object only: no commentary, no markdown fences, every string properly quoted and closed.';
    const r = await chat(Object.assign({}, o, { json: true, user: o.user + extra, temperature: attempt === 0 ? o.temperature : 0.2 }));
    last = r;
    const obj = parseJsonLoose(r.text);
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && (!o.validate || o.validate(obj))) return obj;
    if (o.onStatus) o.onStatus('The answer was incomplete. Asking once more');
  }
  const why = last && last.truncated ? ' The answer was cut off, which usually means the model has a small output limit.' : '';
  throw new AiError('The AI answered in a format JobMech could not read.' + why + ' Try again, or choose a stronger model in Settings.', { kind: 'format' });
}

export async function ping() {
  const r = await chat({ system: 'You are a connection test. Follow the instruction exactly.', user: 'Reply with the single word: OK', temperature: 0, effort: 'low', task: 'ping' });
  return r.text.trim().slice(0, 80);
}
