// Native Word (.docx) export. Built from the same content model as the preview, with real Word
// structures (tables for tabular layouts, numbered bullets, tab stops), so the file stays editable.
import { model, cityOf } from './render.js';
import { paper } from '../countries.js';
import { letterDateLine, shortDocDate, localeFor } from '../doclang.js';
import { palette, font, density } from '../palettes.js';
import { state } from '../store.js';
import { zip, base64ToBytes } from '../util.js';

const TW = (mm) => Math.round(mm * 56.6929);       // millimetres -> twips
const EMU = (mm) => Math.round(mm * 36000);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c) => String(c || '#000000').replace('#', '').toUpperCase();
const INK = '#1A1C20', INK2 = '#474B53', INK3 = '#6B7078', RULE = '#D5D8DE';

function writer(app, kind) {
  const d = app.design || {};
  const f = font(d.font);
  const pal = palette(d.palette);
  const base = (kind === 'letter' ? 10.8 : 10.2) * f.scale * density(d.density).k;
  const W = {
    base, body: f.body, head: f.head, P: pal.primary, S: pal.secondary, T: pal.tint,
    r(text, o = {}) {
      if (text == null || text === '') return '';
      const fnt = o.head ? W.head : W.body;
      const sz = Math.round((o.size || base) * 2);
      return `<w:r><w:rPr><w:rFonts w:ascii="${fnt}" w:hAnsi="${fnt}" w:eastAsia="${fnt}" w:cs="${fnt}"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.caps ? '<w:caps/>' : ''}`
        + `<w:color w:val="${hex(o.color || INK)}"/>${o.track ? `<w:spacing w:val="${o.track}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    },
    tab: () => '<w:r><w:tab/></w:r>',
    p(runs, o = {}) {
      const pp = [];
      if (o.keepNext) pp.push('<w:keepNext/>');
      if (o.keepLines) pp.push('<w:keepLines/>');
      if (o.num) pp.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
      if (o.border) pp.push(`<w:pBdr><w:bottom w:val="single" w:sz="${o.border.sz}" w:space="${o.border.space == null ? 3 : o.border.space}" w:color="${hex(o.border.color)}"/></w:pBdr>`);
      if (o.tabRight) pp.push(`<w:tabs><w:tab w:val="right" w:pos="${o.tabRight}"/></w:tabs>`);
      pp.push(`<w:spacing w:before="${Math.round(o.before || 0)}" w:after="${Math.round(o.after || 0)}" w:line="${o.line || 262}" w:lineRule="auto"/>`);
      if (o.indent != null || o.hanging) pp.push(`<w:ind w:left="${o.indent || 0}"${o.hanging ? ` w:hanging="${o.hanging}"` : ''}/>`);
      if (o.align) pp.push(`<w:jc w:val="${o.align}"/>`);
      return `<w:p><w:pPr>${pp.join('')}</w:pPr>${Array.isArray(runs) ? runs.join('') : (runs || '')}</w:p>`;
    },
    tbl(rows, widths) {
      const total = widths.reduce((a, b) => a + b, 0);
      return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>`
        + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
    },
    tr: (cells) => `<w:tr>${cells.join('')}</w:tr>`,
    tc(content, w, o = {}) {
      const pr = [`<w:tcW w:w="${w}" w:type="dxa"/>`];
      if (o.shade) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.shade)}"/>`);
      if (o.pad) pr.push(`<w:tcMar><w:top w:w="${o.pad[0]}" w:type="dxa"/><w:left w:w="${o.pad[3]}" w:type="dxa"/><w:bottom w:w="${o.pad[2]}" w:type="dxa"/><w:right w:w="${o.pad[1]}" w:type="dxa"/></w:tcMar>`);
      if (o.valign) pr.push(`<w:vAlign w:val="${o.valign}"/>`);
      return `<w:tc><w:tcPr>${pr.join('')}</w:tcPr>${content || W.p('')}</w:tc>`;
    },
  };
  return W;
}

function imageRun(wMm, hMm) {
  const cx = EMU(wMm), cy = EMU(hMm);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Photo"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="photo.jpg"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

async function photoInfo(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return { bytes: base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1)), ratio: img.naturalWidth / img.naturalHeight };
  } catch { return null; }
}

// ---------------------------------------------------------------------------------- CV bodies

function flowSection(W, c, sec, textW) {
  const out = [W.p(W.r(sec.title, { b: true, caps: true, color: W.P, size: W.base * 0.9, track: 20, head: true }), { before: 220, after: 80, border: { sz: 4, color: RULE }, keepNext: true })];
  for (const it of sec.items) out.push(...flowItem(W, it, textW));
  return out;
}

function flowItem(W, it, textW) {
  const out = [];
  if (it.t === 'para') out.push(W.p(W.r(it.text)));
  else if (it.t === 'entry') {
    out.push(W.p([W.r(it.role, { b: true, size: W.base * 1.03 }), it.per ? W.tab() + W.r(it.per, { b: true, color: W.S }) : ''], { tabRight: textW, before: 110, keepNext: true }));
    if (it.org.length) out.push(W.p(W.r(it.org.join(', '), { i: true, color: INK2 }), { keepNext: it.bullets.length > 0 }));
    for (const b of it.bullets) if (b) out.push(it.kind === 'exp' ? W.p(W.r(b), { num: true, before: 30 }) : W.p(W.r(b, { color: INK2 }), { before: 30 }));
  } else if (it.t === 'kv') out.push(W.p([it.k ? W.r(it.k + ': ', { b: true }) : '', W.r(it.v)], { before: 36 }));
  else if (it.t === 'cert') out.push(W.p([W.r(it.name, { b: true }), it.issuer ? W.r(', ' + it.issuer, { color: INK2 }) : '', it.year ? W.r(' (' + it.year + ')') : ''], { before: 36 }));
  else if (it.t === 'proj') out.push(W.p([it.name ? W.r(it.name + (it.description ? ': ' : ''), { b: true }) : '', W.r(it.description)], { before: 36 }));
  return out;
}

function rowsSection(W, sec, wL, wR, mode) {
  const rows = [];
  let first = true;
  const left = (node) => (mode === 'gutter' ? (first ? W.p(W.r(sec.title, { b: true, caps: true, color: W.P, size: W.base * 0.84, track: 18, head: true }), { before: 20 }) : '') : node);
  const gap = (n) => (rows.length ? n : 0);
  for (const it of sec.items) {
    if (it.t === 'para') rows.push(W.tr([W.tc(left(''), wL), W.tc(W.p(W.r(it.text)), wR)]));
    else if (it.t === 'entry') {
      let cell;
      if (mode === 'tabular') {
        cell = W.p(W.r(it.role, { b: true, size: W.base * 1.04 }), { before: gap(120) });
        if (it.org.length) cell += W.p(W.r(it.org.join(', '), { color: INK2 }));
      } else {
        cell = W.p([W.r(it.role, { b: true, size: W.base * 1.03 }), it.per ? W.tab() + W.r(it.per, { b: true, color: W.S }) : ''], { tabRight: wR, before: gap(120) });
        if (it.org.length) cell += W.p(W.r(it.org.join(', '), { color: INK2 }));
      }
      for (const b of it.bullets) if (b) cell += it.kind === 'exp' ? W.p(W.r(b), { num: true, before: 30 }) : W.p(W.r(b, { color: INK2 }), { before: 30 });
      const l = mode === 'tabular' ? W.p(W.r(it.per, { b: true, color: W.S, size: W.base * 0.95 }), { before: gap(120) }) : left('');
      rows.push(W.tr([W.tc(l, wL), W.tc(cell, wR)]));
    } else if (it.t === 'kv') {
      const l = mode === 'tabular' ? W.p(W.r(it.k, { b: true, color: INK2, size: W.base * 0.95 }), { before: gap(60) }) : left('');
      const rr = mode === 'tabular' ? W.p(W.r(it.v), { before: gap(60) }) : W.p([it.k ? W.r(it.k + ': ', { b: true }) : '', W.r(it.v)], { before: gap(40) });
      rows.push(W.tr([W.tc(l, wL), W.tc(rr, wR)]));
    } else if (it.t === 'cert') {
      const l = mode === 'tabular' ? W.p(W.r(it.year, { b: true, color: W.S, size: W.base * 0.95 }), { before: gap(60) }) : left('');
      const tail = mode === 'tabular' ? '' : (it.year ? W.r(' (' + it.year + ')') : '');
      rows.push(W.tr([W.tc(l, wL), W.tc(W.p([W.r(it.name, { b: true }), it.issuer ? W.r(', ' + it.issuer, { color: INK2 }) : '', tail], { before: gap(mode === 'tabular' ? 60 : 40) }), wR)]));
    } else if (it.t === 'proj') {
      rows.push(W.tr([W.tc(left(''), wL), W.tc(W.p([it.name ? W.r(it.name + (it.description ? ': ' : ''), { b: true }) : '', W.r(it.description)], { before: gap(40) }), wR)]));
    }
    first = false;
  }
  return W.tbl(rows, [wL, wR]);
}

function tail(W, c) {
  const out = [];
  if (c.ct.signature && c.design.signature !== false) {
    const town = cityOf(c.p);
    out.push(W.p(W.r((town ? town + ', ' : '') + shortDocDate(c.app.letterDate, c.app), { color: INK2 }), { before: 480 }));
    out.push(W.p(W.r(c.p.fullName, { b: true }), { before: 300 }));
  }
  if (c.ct.consent) out.push(W.p(W.r(c.ct.consent[c.app.language] || c.ct.consent.en, { i: true, color: INK3, size: W.base * 0.82 }), { before: 240 }));
  return out;
}

function cvBody(W, c, photo) {
  const lay = c.fam.layout;
  const secs = model.sections(c);
  const pg = paper(c.app.country);
  const { p, cv, L } = c;
  const name = p.fullName || 'Your name';
  const contact = model.contactItems(c, lay === 'tabular' || lay === 'sidebar' ? c.ct.address : false);
  const meta = model.personalItems(c).map(([k, v]) => `${k}: ${v}`);
  const out = [];
  let margins;

  if (lay === 'tabular') {
    margins = [15, 18, 13, 20];
    const textW = TW(pg.w - 38);
    const wL = TW(39), wR = textW - wL;
    const headText = W.p(W.r(L.cv, { b: true, caps: true, color: W.S, size: W.base * 0.82, track: 30, head: true }), { after: 40 })
      + W.p(W.r(name, { b: true, color: W.P, size: W.base * 2.3, head: true }), { line: 240 })
      + (cv.headline ? W.p(W.r(cv.headline, { b: true, color: W.S, size: W.base * 1.14 }), { before: 50 }) : '')
      + W.p(W.r(contact.join('  ·  '), { color: INK2, size: W.base * 0.95 }), { before: 110 })
      + (meta.length ? W.p(W.r(meta.join('  ·  '), { color: INK2, size: W.base * 0.92 }), { before: 20 }) : '');
    if (photo) {
      const pw = TW(35);
      out.push(W.tbl([W.tr([W.tc(headText, textW - pw), W.tc(W.p(imageRun(33, 33 / photo.ratio), { align: 'right' }), pw)])], [textW - pw, pw]));
    } else out.push(headText);
    out.push(W.p('', { border: { sz: 12, color: W.P, space: 1 }, line: 120, before: 40 }));
    for (const sec of secs) {
      out.push(W.p(W.r(sec.title, { b: true, caps: true, color: W.P, size: W.base * 0.9, track: 22, head: true }), { before: 240, after: 110, border: { sz: 4, color: RULE }, keepNext: true }));
      if (sec.items.length === 1 && sec.items[0].t === 'para') out.push(W.p(W.r(sec.items[0].text)));
      else out.push(rowsSection(W, sec, wL, wR, 'tabular'));
    }
  } else if (lay === 'gutter') {
    margins = [15, 18, 13, 18];
    const textW = TW(pg.w - 36);
    const wL = TW(40), wR = textW - wL;
    const left = W.p(W.r(name, { b: true, color: W.P, size: W.base * 2.3, head: true }), { line: 240 })
      + (cv.headline ? W.p(W.r(cv.headline, { b: true, color: W.S, size: W.base * 1.08 }), { before: 50 }) : '');
    const right = [...contact, ...meta].map((t) => W.p(W.r(t, { color: INK2, size: W.base * 0.93 }), { align: 'right' })).join('');
    const pw = photo ? TW(28) : 0;
    const wC = TW(62);
    const cells = [W.tc(left, textW - wC - pw, { valign: 'bottom' }), W.tc(right, wC, { valign: 'bottom' })];
    const widths = [textW - wC - pw, wC];
    if (photo) { cells.push(W.tc(W.p(imageRun(25, 25 / photo.ratio), { align: 'right' }), pw, { valign: 'bottom' })); widths.push(pw); }
    out.push(W.tbl([W.tr(cells)], widths));
    out.push(W.p('', { border: { sz: 6, color: INK, space: 1 }, line: 120, before: 60 }));
    for (const sec of secs) {
      out.push(W.p('', { line: 140, before: 60 }));
      out.push(rowsSection(W, sec, wL, wR, 'gutter'));
    }
  } else if (lay === 'sidebar') {
    margins = [12, 12, 12, 12];
    const textW = TW(pg.w - 24);
    const wS = TW(58), wM = textW - wS;
    const sideHead = (t) => W.p(W.r(t, { b: true, caps: true, color: W.P, size: W.base * 0.86, track: 20, head: true }), { before: 260, after: 70, border: { sz: 4, color: W.S } });
    let side = '';
    if (photo) side += W.p(imageRun(38, 38 / photo.ratio), { align: 'center', after: 60 });
    side += sideHead(L.contact) + contact.map((t) => W.p(W.r(t, { color: INK2, size: W.base * 0.93 }), { before: 50 })).join('');
    side += model.personalItems(c).map(([k, v]) => W.p([W.r(k + ': ', { color: INK3, size: W.base * 0.86 }), W.r(v, { color: INK2, size: W.base * 0.93 })], { before: 50 })).join('');
    if ((cv.languages || []).length) side += sideHead(L.languages) + cv.languages.map((l) => W.p([W.r(l.name, { size: W.base * 0.93 }), l.level ? W.r('  ' + l.level, { color: INK3, size: W.base * 0.93 }) : ''], { before: 50 })).join('');
    if ((cv.skills || []).length) side += sideHead(L.skills) + cv.skills.map((s) => (s.label ? W.p(W.r(s.label, { b: true, size: W.base * 0.93 }), { before: 80 }) : '') + W.p(W.r(s.items, { color: INK2, size: W.base * 0.93 }), { before: s.label ? 0 : 80 })).join('');
    if (cv.interests) side += sideHead(L.interests) + W.p(W.r(cv.interests, { color: INK2, size: W.base * 0.93 }), { before: 50 });
    let main = W.p(W.r(name, { b: true, color: W.P, size: W.base * 2.35, head: true }), { line: 240 })
      + (cv.headline ? W.p(W.r(cv.headline, { b: true, color: W.S, size: W.base * 1.16 }), { before: 50 }) : '');
    const mainSecs = secs.filter((s) => s.title !== L.skills && s.title !== L.languages);
    const innerW = wM - TW(8) - TW(3);
    for (const sec of mainSecs) main += flowSection(W, c, sec, innerW).join('');
    main += tail(W, c).join('');
    out.push(W.tbl([W.tr([
      W.tc(side, wS, { shade: W.T, pad: [TW(6), TW(5), TW(6), TW(6)] }),
      W.tc(main, wM, { pad: [TW(4), TW(3), TW(4), TW(8)] }),
    ])], [wS, wM]));
    out.push(W.p('', { line: 20 }));
    return { xml: out.join(''), margins };
  } else {
    margins = [14, 17, 13, 17];
    const textW = TW(pg.w - 34);
    const center = c.fam.header === 'center' ? 'center' : null;
    out.push(W.p(W.r(name, { b: true, color: W.P, size: W.base * (center ? 1.95 : 2.15), caps: !!center, track: center ? 24 : 0, head: true }), { align: center, line: 240 }));
    if (cv.headline) out.push(W.p(W.r((c.ct.family === 'br' ? L.objective + ': ' : '') + cv.headline, { b: true, color: W.S, size: W.base * 1.08 }), { align: center, before: 50 }));
    out.push(W.p(W.r(contact.join('  ·  '), { color: INK2, size: W.base * 0.95 }), { align: center, before: 90 }));
    if (meta.length) out.push(W.p(W.r(meta.join('  ·  '), { color: INK3, size: W.base * 0.92 }), { align: center, before: 20 }));
    out.push(W.p('', { border: { sz: 10, color: W.P, space: 1 }, line: 120, before: 40 }));
    for (const sec of secs) out.push(...flowSection(W, c, sec, textW));
  }
  out.push(...tail(W, c));
  return { xml: out.join(''), margins };
}

// ---------------------------------------------------------------------------------- letter body

function letterBody(W, c) {
  const { p, letter: lt, L, app } = c;
  const fmt = c.fam.letter;
  const margins = fmt === 'din' ? [17, 20, 14, 25] : fmt === 'fr' ? [17, 21, 15, 22] : [17, 21, 15, 21];
  const items = model.contactItems(c, true, true);
  const center = fmt === 'block' ? 'center' : null;
  const head = [];
  head.push(W.p(W.r(p.fullName || 'Your name', { b: true, color: W.P, size: W.base * (fmt === 'fr' ? 1.25 : 1.5), caps: fmt === 'block', head: true }), { align: center, line: 240 }));
  if (fmt === 'fr') for (const it of items) head.push(W.p(W.r(it, { color: INK2, size: W.base * 0.88 })));
  else {
    head.push(W.p(W.r(items.join('  ·  '), { color: INK2, size: W.base * 0.88 }), { align: center, before: 60 }));
    head.push(W.p('', { border: { sz: 10, color: W.P, space: 1 }, line: 120, before: 40 }));
  }
  const rightInd = fmt === 'fr' ? TW((paper(app.country).w - 43) * 0.56) : 0;
  const rcpt = (lt.recipient || []).map((line, i) => W.p(W.r(line), { before: i === 0 ? (fmt === 'din' ? 520 : 300) : 0, indent: rightInd, line: 250 }));
  const date = W.p(W.r(letterDateLine(app.letterDate, app, cityOf(p)), { color: INK2 }), { before: fmt === 'din' ? 240 : 420, align: fmt === 'din' ? 'right' : null, indent: rightInd });
  const prefix = L.subject || (fmt === 'block' ? 'RE: ' : '');
  const subject = lt.subject ? W.p(W.r(prefix + lt.subject, { b: true, size: W.base * 1.04 }), { before: 380 }) : '';
  const sal = lt.salutation ? W.p(W.r(lt.salutation), { before: 340 }) : '';
  const paras = (lt.paragraphs || []).map((t) => W.p(W.r(t), { before: 190, line: 276 }));
  const close = lt.closing ? W.p(W.r(lt.closing), { before: 340, keepNext: true }) : '';
  const sig = W.p(W.r(p.fullName || '', { b: true }), { before: 520, indent: fmt === 'fr' ? rightInd : 0 });
  const encl = lt.enclosures ? W.p(W.r(lt.enclosures, { color: INK3, size: W.base * 0.88 }), { before: 400 }) : '';
  let order;
  if (fmt === 'din' || fmt === 'fr') order = [...head, ...rcpt, date, subject, sal, ...paras, close, sig, encl];
  else if (fmt === 'uk') order = [...head, date, ...rcpt, sal, subject, ...paras, close, sig, encl];
  else order = [...head, date, ...rcpt, subject, sal, ...paras, close, sig, encl];
  return { xml: order.join(''), margins };
}

// ---------------------------------------------------------------------------------- package

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export async function buildDocx(app, kind) {
  const c = model.context(app, { editable: false });
  const W = writer(app, kind);
  const usePhoto = kind === 'cv' && c.photo;
  const photo = usePhoto ? await photoInfo(c.photo) : null;
  const body = kind === 'cv' ? cvBody(W, c, photo) : letterBody(W, c);
  const pg = paper(app.country);
  const [mt, mr, mb, ml] = body.margins.map(TW);
  const docXml = `${XML}<w:document ${NS}><w:body>${body.xml}<w:sectPr><w:pgSz w:w="${TW(pg.w)}" w:h="${TW(pg.h)}"/><w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="${mb}" w:left="${ml}" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const sz = Math.round(W.base * 2);
  const styles = `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${W.body}" w:hAnsi="${W.body}" w:eastAsia="${W.body}" w:cs="${W.body}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="${localeFor(app)}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>`
    + `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="262" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  const numbering = `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>`
    + `<w:pPr><w:ind w:left="255" w:hanging="190"/></w:pPr><w:rPr><w:rFonts w:ascii="${W.body}" w:hAnsi="${W.body}" w:hint="default"/><w:color w:val="${hex(W.S)}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const settings = `${XML}<w:settings ${NS}><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    + (photo ? '<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.jpg"/>' : '')
    + '</Relationships>';
  const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>`
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const title = `${state.profile.fullName || 'Candidate'} - ${kind === 'cv' ? c.L.cv : c.L.coverLetter}`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(state.profile.fullName || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const root = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';

  const files = [
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: root },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: docXml },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/numbering.xml', data: numbering },
    { name: 'word/settings.xml', data: settings },
    { name: 'word/_rels/document.xml.rels', data: rels },
  ];
  if (photo) files.push({ name: 'word/media/photo.jpg', data: photo.bytes, store: true });
  return zip(files);
}
