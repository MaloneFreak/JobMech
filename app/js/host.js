// Bridge to the native host (JobMech.exe). Every capability outside the page goes through here:
// files, API keys, network, dialogs and PDF printing.

const wv = window.chrome && window.chrome.webview;
export const hosted = !!wv;

let seq = 0;
const pending = new Map();
const listeners = new Map();

if (wv) {
  wv.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.ev) {
      const fns = listeners.get(m.ev);
      if (fns) for (const fn of [...fns]) { try { fn(m.d); } catch (err) { console.error(err); } }
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.r); else p.reject(new Error(m.e || 'Host error'));
  });
}

export function call(method, params = {}) {
  if (!wv) return Promise.reject(new Error('JobMech must be opened through JobMech.exe.'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    wv.postMessage({ id, m: method, p: params });
  });
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

// ---- storage inside the data folder -------------------------------------------------------
export const store = {
  async read(path) { const r = await call('store.read', { path }); return r.exists ? r.text : null; },
  async readJson(path, fallback = null) {
    const t = await store.read(path);
    if (t == null || !t.trim()) return fallback;
    try { return JSON.parse(t); } catch { return fallback; }
  },
  write(path, text) { return call('store.write', { path, text }); },
  writeJson(path, value) { return call('store.write', { path, text: JSON.stringify(value, null, 1) }); },
  async readBinary(path) { const r = await call('store.readBinary', { path }); return r.exists ? r.base64 : null; },
  writeBinary(path, base64) { return call('store.writeBinary', { path, base64 }); },
  remove(path) { return call('store.delete', { path }); },
  list(path) { return call('store.list', { path }); },
  exists(path) { return call('store.exists', { path }); },
};

export const secrets = {
  set(name, value, host) { return call('secrets.set', { name, value, host }); },
  info(name) { return call('secrets.info', { name }); },
  remove(name) { return call('secrets.delete', { name }); },
};

// ---- network: streamed text arrives through onChunk, the promise resolves at the end -----
let httpSeq = 0;
export async function http({ url, method = 'GET', headers = {}, body = null, secret = '', stream = false, timeoutMs = 240000, signal = null }, onChunk = null) {
  const reqId = 'r' + (++httpSeq) + '_' + Date.now().toString(36);
  let off = null;
  if (stream && onChunk) off = on('http.chunk', (d) => { if (d.reqId === reqId) onChunk(d.text); });
  const abort = () => { call('http.abort', { reqId }).catch(() => {}); };
  if (signal) {
    if (signal.aborted) { if (off) off(); const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; }
    signal.addEventListener('abort', abort, { once: true });
  }
  try {
    const r = await call('http.request', { reqId, url, method, headers, body, secret, stream, timeoutMs });
    if (r.aborted) { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; }
    return r;
  } finally {
    if (off) off();
    if (signal) signal.removeEventListener('abort', abort);
  }
}

export const dialog = {
  save(opts) { return call('dialog.save', opts); },
  open(opts) { return call('dialog.open', opts); },
  folder(opts) { return call('dialog.folder', opts); },
};

// ---- the data folder as a whole: one backup file out, a backup file or another data folder in
export const data = {
  exportBackup(path) { return call('data.export', { path }); },
  importFrom(path) { return call('data.import', { path }); },
};

export const fs = {
  write(path, base64) { return call('fs.write', { path, base64 }); },
  exists(path) { return call('fs.exists', { path }); },
  reveal(path) { return call('fs.reveal', { path }); },
  open(path) { return call('fs.open', { path }); },
};

export const app = {
  info: () => call('app.info'),
  quit: () => call('app.quit'),
  openExternal: (url) => call('shell.open', { url }),
  theme: (dark, bg, fg) => call('window.theme', { dark, bg, fg }),
  hardware: () => call('sys.hardware'),
  printPdf: (path, widthIn, heightIn, scale = 1) => call('pdf.print', { path, widthIn, heightIn, scale }),
  log: (level, text) => call('log.write', { level, text: String(text).slice(0, 4000) }).catch(() => {}),
  ollamaLaunch: () => call('ollama.launch'),
  ollamaInstall: () => call('ollama.install'),
};
