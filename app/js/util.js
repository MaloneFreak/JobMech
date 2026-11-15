// Small shared helpers: ids, text, dates, base64 and a tiny ZIP reader/writer.

export const uid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

export function debounce(fn, ms = 300) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function deepGet(obj, path) {
  let o = obj;
  for (const k of String(path).split('.')) { if (o == null) return undefined; o = o[k]; }
  return o;
}

export function deepSet(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

export const words = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
export const isoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function relTime(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const shortDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** File-name safe ASCII: "João Gonçalves" -> "Joao_Goncalves", "Müller & Söhne" -> "Mueller_Soehne". */
export function fileSlug(s, max = 60) {
  const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', 'ø': 'o', 'Ø': 'O', 'å': 'a', 'Å': 'A', 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe' };
  let t = String(s || '').replace(/[äöüÄÖÜßøØåÅæÆœ]/g, (c) => map[c]);
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/\(m\/w\/d\)|\(m\/f\/d\)|\(w\/m\/d\)|\(f\/m\/d\)|\(m\/f\/x\)|\(all genders\)/gi, ' ');
  t = t.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (t.length > max) t = t.slice(0, max).replace(/_+[^_]*$/, '') || t.slice(0, max);
  return t || 'Document';
}

// ---- base64 -------------------------------------------------------------------------------
export function bytesToBase64(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export const utf8 = (s) => new TextEncoder().encode(s);

// ---- ZIP (used to write .docx and to read attached .docx files) ----------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function pipe(u8, stream) {
  const out = new Response(new Blob([u8]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** files: [{ name, data: Uint8Array | string, store?: boolean }] -> Uint8Array of a .zip */
export async function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const raw = typeof f.data === 'string' ? utf8(f.data) : f.data;
    const name = utf8(f.name);
    const useStore = f.store || raw.length < 64;
    const body = useStore ? raw : await pipe(raw, new CompressionStream('deflate-raw'));
    const crc = crc32(raw);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true);            // UTF-8 names
    head.setUint16(8, useStore ? 0 : 8, true);
    head.setUint16(10, 0, true);
    head.setUint16(12, 0x21, true);             // 1980-01-01, keeps output deterministic
    head.setUint32(14, crc, true);
    head.setUint32(18, body.length, true);
    head.setUint32(22, raw.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, useStore ? 0 : 8, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

/** Reads a .zip into a Map(name -> async () => Uint8Array). */
export function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid document archive.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.set(name, async () => {
      const ln = dv.getUint16(lho + 26, true);
      const lx = dv.getUint16(lho + 28, true);
      const start = lho + 30 + ln + lx;
      const data = u8.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return pipe(data, new DecompressionStream('deflate-raw'));
      throw new Error('Unsupported compression in archive.');
    });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}
