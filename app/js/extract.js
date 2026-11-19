// Reads the text of attached files (old CVs, cover letters, notes): PDF via Mozilla's pdf.js,
// Word .docx by unzipping it, plain text and Markdown directly. Nothing leaves the computer.
import { unzip } from './util.js';

export const ACCEPT = '.pdf,.docx,.md,.markdown,.txt';
const MAX = 20 * 1024 * 1024;

async function pdfText(buf) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      let out = '';
      let lastY = null;
      let lastEnd = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : 0;
        const x = it.transform ? it.transform[4] : 0;
        const hgt = it.height || 10;
        if (lastY != null && Math.abs(y - lastY) > hgt * 0.6 && out && !out.endsWith('\n')) out += '\n';
        else if (lastEnd != null && x - lastEnd > hgt * 0.25 && out && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
        out += it.str;
        if (it.hasEOL && !out.endsWith('\n')) out += '\n';
        if (it.str.trim()) { lastY = y; lastEnd = x + (it.width || 0); }
        if (it.hasEOL) lastEnd = null;
      }
      pages.push(out.trim());
      page.cleanup();
    }
  } finally {
    await doc.destroy().catch(() => {});
  }
  return { text: pages.join('\n\n'), pages: doc.numPages };
}

function wordXmlText(xml) {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const out = [];
  const para = (p) => {
    let s = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') s += c.textContent;
        else if (ln === 'tab') s += '\t';
        else if (ln === 'br' || ln === 'cr') s += '\n';
        else if (ln !== 'pPr' && ln !== 'rPr') walk(c);
      }
    };
    walk(p);
    return s.trim();
  };
  const block = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      const ln = c.localName;
      if (ln === 'p') { const t = para(c); if (t) out.push(t); }
      else if (ln === 'tbl') {
        for (const tr of c.childNodes) {
          if (tr.localName !== 'tr') continue;
          const cells = [];
          for (const tc of tr.childNodes) {
            if (tc.localName !== 'tc') continue;
            const before = out.length;
            block(tc);
            const cellText = out.splice(before).join(' / ');
            if (cellText) cells.push(cellText);
          }
          if (cells.length) out.push(cells.join('  |  '));
        }
      } else block(c);
    }
  };
  block(dom.documentElement);
  return out.join('\n');
}

async function docxText(buf) {
  const entries = unzip(new Uint8Array(buf));
  const names = [...entries.keys()];
  const read = async (n) => new TextDecoder().decode(await entries.get(n)());
  const parts = [];
  for (const n of names.filter((x) => /^word\/header\d*\.xml$/.test(x)).sort()) parts.push(wordXmlText(await read(n)));
  if (!entries.has('word/document.xml')) throw new Error('This does not look like a Word document.');
  parts.push(wordXmlText(await read('word/document.xml')));
  for (const n of names.filter((x) => /^word\/footer\d*\.xml$/.test(x)).sort()) parts.push(wordXmlText(await read(n)));
  return parts.filter((p) => p.trim()).join('\n\n');
}

/** extractText(File) -> { name, text, note }. Throws an Error with a plain-language message on failure. */
export async function extractText(file) {
  const name = file.name || 'file';
  const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (file.size > MAX) throw new Error(`${name} is larger than 20 MB.`);
  let text = '';
  let note = '';
  if (ext === '.pdf') {
    const r = await pdfText(await file.arrayBuffer());
    text = r.text;
    if (text.replace(/\s/g, '').length < 40 * r.pages) note = 'This PDF has little or no selectable text. If it is a scan, paste the text instead.';
  } else if (ext === '.docx') {
    text = await docxText(await file.arrayBuffer());
  } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    text = await file.text();
  } else if (ext === '.doc') {
    throw new Error(`${name} is an old Word format. Save it as .docx or PDF and attach it again.`);
  } else {
    throw new Error(`${name}: only PDF, Word (.docx), Markdown and text files can be read.`);
  }
  text = text.replace(/\r\n?/g, '\n').replace(/­/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error(`No text could be read from ${name}.`);
  return { name, text, note };
}

/** Crops and scales a portrait so it sits well in every layout (ratio 7:9, 630x810). */
export function normalizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 630, H = 810;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      const sr = img.width / img.height;
      const dr = W / H;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (sr > dr) { sw = img.height * dr; sx = (img.width - sw) / 2; }
      else { sh = img.width / dr; sy = (img.height - sh) * 0.22; }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be opened. Use a JPG or PNG file.')); };
    img.src = url;
  });
}
