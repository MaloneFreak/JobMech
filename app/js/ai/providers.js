// AI providers. Model catalogues change every few weeks, so apart from a short list of known
// Claude models nothing is hard-coded: the app asks each provider for its current models.
import { http } from '../host.js';

export const PROVIDERS = {
  openrouter: {
    id: 'openrouter', name: 'OpenRouter', kind: 'openai', key: true, tag: 'Free models',
    base: 'https://openrouter.ai/api/v1', host: 'openrouter.ai', keyUrl: 'https://openrouter.ai/keys',
    blurb: 'One key, hundreds of models, several of them free.',
    help: 'Free models are limited to roughly 20 requests a minute and 50 a day. One application uses about 4 requests.',
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', kind: 'gemini', key: true, tag: 'Free tier',
    base: 'https://generativelanguage.googleapis.com/v1beta', host: 'generativelanguage.googleapis.com', keyUrl: 'https://aistudio.google.com/apikey',
    blurb: 'Free tier through Google AI Studio. Fast and strong in many languages.',
  },
  groq: {
    id: 'groq', name: 'Groq', kind: 'openai', key: true, tag: 'Free tier',
    base: 'https://api.groq.com/openai/v1', host: 'api.groq.com', keyUrl: 'https://console.groq.com/keys',
    blurb: 'Open models served extremely fast, with a free tier.',
    help: 'Free-tier models enforce tight tokens-per-minute limits. JobMech automatically compacts long inputs and paces requests when needed.',
  },
  anthropic: {
    id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', key: true, tag: 'Paid',
    base: 'https://api.anthropic.com/v1', host: 'api.anthropic.com', keyUrl: 'https://console.anthropic.com/settings/keys',
    blurb: 'Excellent writing quality and careful with facts.',
    defaultModel: 'claude-opus-5-5',
    known: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recommended)' },
      { id: 'claude-fable-5-2', label: 'Claude Fable 5.2 (most capable, pricier)' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
    ],
  },
  openai: {
    id: 'openai', name: 'OpenAI', kind: 'openai', key: true, tag: 'Paid',
    base: 'https://api.openai.com/v1', host: 'api.openai.com', keyUrl: 'https://platform.openai.com/api-keys',
    blurb: 'GPT models.',
  },
  mistral: {
    id: 'mistral', name: 'Mistral', kind: 'openai', key: true, tag: 'Free tier',
    base: 'https://api.mistral.ai/v1', host: 'api.mistral.ai', keyUrl: 'https://console.mistral.ai/api-keys',
    blurb: 'European provider, good with European languages.',
  },
  ollama: {
    id: 'ollama', name: 'Ollama', kind: 'ollama', key: false, local: true, tag: 'On this PC',
    blurb: 'Runs on your own computer. Private, free, needs a capable machine.',
  },
  custom: {
    id: 'custom', name: 'Custom endpoint', kind: 'openai', key: 'optional', local: true, tag: 'Advanced',
    blurb: 'LM Studio or any OpenAI-compatible server address.',
  },
  mock: {
    id: 'mock', name: 'Offline test engine', kind: 'mock', key: false, dev: true, tag: 'Dev',
    blurb: 'Canned answers for testing the app without any network call.',
  },
};

export const provider = (id) => PROVIDERS[id] || null;

/** Base URL for a provider given the user's settings (local engines have editable addresses). */
export function baseUrl(id, settings) {
  const p = PROVIDERS[id];
  if (!p) return '';
  if (id === 'ollama') return String(settings.ai.endpoints.ollama || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  if (id === 'custom') return String(settings.ai.endpoints.custom || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');
  return p.base;
}

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function authHeaders(id) {
  const p = PROVIDERS[id];
  if (p.kind === 'anthropic') return { 'x-api-key': '{{secret}}', 'anthropic-version': '2026-10-21' };
  if (p.kind === 'gemini') return { 'x-goog-api-key': '{{secret}}' };
  return { Authorization: 'Bearer {{secret}}' };
}

const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcri|rerank|guard|speech|sora|veo|imagen|aqa|ocr|voxtral/i;

/** Asks the provider which models exist right now. Returns [{ id, label, free, ctx, json }]. */
export async function listModels(id, settings, hasKey) {
  const p = PROVIDERS[id];
  if (!p) return [];
  const base = baseUrl(id, settings);
  const secret = p.key && hasKey ? id : '';
  const get = async (url, headers = {}) => {
    const r = await http({ url, method: 'GET', headers, secret, timeoutMs: 20000 });
    if (r.status >= 400) throw new Error(describeHttpError(r.status, r.body, p.name));
    return JSON.parse(r.body || '{}');
  };

  if (p.kind === 'mock') return [{ id: 'mock-writer', label: 'Offline test writer' }];

  if (p.kind === 'ollama') {
    const j = await get(base + '/api/tags');
    return (j.models || []).map((m) => ({
      id: m.name,
      label: m.name + (m.details && m.details.parameter_size ? '  ·  ' + m.details.parameter_size : ''),
      size: m.size || 0,
    }));
  }

  if (p.kind === 'anthropic') {
    let live = [];
    if (hasKey) {
      try {
        const j = await get(base + '/models?limit=100', authHeaders(id));
        live = (j.data || []).map((m) => ({ id: m.id, label: m.display_name || m.id }));
      } catch { /* fall back to the known list */ }
    }
    const seen = new Set(p.known.map((k) => k.id));
    return [...p.known, ...live.filter((m) => !seen.has(m.id))];
  }

  if (p.kind === 'gemini') {
    const j = await get(base + '/models?pageSize=200', authHeaders(id));
    return (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && !NOT_CHAT.test(m.name))
      .map((m) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName || m.name, ctx: m.inputTokenLimit || 0 }))
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  }

  // OpenAI-compatible
  const headers = secret ? authHeaders(id) : {};
  const j = await get(base + '/models', headers);
  let list = (j.data || j.models || []).map((m) => {
    const mid = m.id || m.name;
    const free = id === 'openrouter' && m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0;
    return {
      id: mid,
      label: (m.name && m.name !== mid ? m.name : mid) + (free ? '  ·  free' : ''),
      free: !!free,
      ctx: m.context_length || m.context_window || 0,
      json: Array.isArray(m.supported_parameters) ? m.supported_parameters.includes('response_format') : null,
    };
  }).filter((m) => m.id && !NOT_CHAT.test(m.id));
  if (id === 'openrouter') list.sort((a, b) => (b.free - a.free) || a.label.localeCompare(b.label));
  else list.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  return list;
}

/** Turns a provider's HTTP error into one plain sentence. */
export function describeHttpError(status, body, name = 'The AI provider') {
  let msg = '';
  try {
    const j = JSON.parse(body);
    const e = j.error || j;
    msg = typeof e === 'string' ? e : (e.message || (e.error && e.error.message) || j.message || '');
    if (e.metadata && e.metadata.raw) msg += ' ' + String(e.metadata.raw).slice(0, 200);
  } catch { msg = String(body || '').slice(0, 300); }
  msg = String(msg).replace(/\s+/g, ' ').trim();
  const tail = msg ? ` (${msg.slice(0, 260)})` : '';
  if (status === 401 || status === 403) return `${name} rejected the API key. Check it in Settings.${tail}`;
  if (status === 402) return `${name} says the account has no credit left.${tail}`;
  if (status === 404) return `${name} does not know this model. Pick another one in Settings.${tail}`;
  if (status === 413) return `${name} rejected the request because it exceeded the model's token limit.${tail}`;
  if (status === 429) return `${name} is rate limiting requests right now. Wait a minute or pick another model.${tail}`;
  if (status >= 500) return `${name} is having trouble at the moment (error ${status}). Try again shortly.${tail}`;
  return `${name} returned an error ${status}.${tail}`;
}

/** Suggested local models, smallest first. `ram` is the memory (GB) a model needs to run acceptably. */
export const LOCAL_MODELS = [
  { id: 'gemma3:4b', name: 'Gemma 3 4B', size: '3.3 GB', ram: 8, note: 'Lightest sensible choice. Fine for English; simpler wording.' },
  { id: 'qwen3:8b', name: 'Qwen 3 8B', size: '5.2 GB', ram: 12, note: 'Follows instructions and JSON formats reliably.' },
  { id: 'gemma3:12b', name: 'Gemma 3 12B', size: '8.1 GB', ram: 16, note: 'Best balance. Strong in German, French, Portuguese and Spanish.' },
  { id: 'mistral-small3.2', name: 'Mistral Small 3.2 24B', size: '15 GB', ram: 32, note: 'Near cloud quality for European languages. Needs a strong GPU.' },
];

export function localAdvice(hw) {
  const ram = hw && hw.ramGb ? hw.ramGb : 0;
  const vram = hw && hw.gpus ? Math.max(0, ...hw.gpus.map((g) => g.vramGb || 0)) : 0;
  const dedicated = hw && hw.gpus ? hw.gpus.some((g) => /nvidia|geforce|rtx|gtx|radeon rx|arc/i.test(g.name || '')) : false;
  let pick = null;
  if (dedicated && vram >= 16) pick = 'mistral-small3.2';
  else if ((dedicated && vram >= 8) || ram >= 24) pick = 'gemma3:12b';
  else if (ram >= 12) pick = 'qwen3:8b';
  else if (ram >= 7.5) pick = 'gemma3:4b';
  const weak = !dedicated && ram < 15;
  return { ram, vram, dedicated, pick, weak };
}
