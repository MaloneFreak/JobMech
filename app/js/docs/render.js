// Turns an application's CV / cover letter data into real pages (A4 or US Letter).
// Layout is chosen by the job's country; wording by the document language; colours and font by the user.
// Pages are built by measuring: blocks flow into a sheet until it is full, then a new sheet starts.
import { country, family, paper } from '../countries.js';
import { labels, period, letterDateLine, shortDocDate, localeFor } from '../doclang.js';
import { palette, font, density } from '../palettes.js';
import { state } from '../store.js';

/**
 * Sheets are laid out at four times their real size and scaled back down for display and print.
 * On Windows at 100% display scaling the browser engine snaps letter widths to whole pixels, which
 * at 9-10 pt visibly loosens or tightens text and makes line breaks depend on the zoom level.
 * At 4x the snapping is negligible, so preview and PDF share one exact, print-quality layout.
 */
export const LAYOUT_SCALE = 4;

const ORDER = {
  dach: ['profile', 'experience', 'experienceOther', 'education', 'skills', 'certifications', 'projects', 'additional'],
  us: ['profile', 'experience', 'experienceOther', 'education', 'skills', 'certifications', 'projects', 'additional'],
  uk: ['profile', 'skills', 'experience', 'experienceOther', 'education', 'certifications', 'projects', 'additional'],
  latin: ['profile', 'experience', 'experienceOther', 'education', 'certifications', 'projects', 'additional'],
  nordic: ['profile', 'experience', 'experienceOther', 'education', 'skills', 'languages', 'certifications', 'projects', 'additional'],
  br: ['profile', 'experience', 'experienceOther', 'education', 'languages', 'certifications', 'skills', 'projects', 'additional'],
  intl: ['profile', 'experience', 'experienceOther', 'education', 'skills', 'languages', 'certifications', 'projects', 'additional'],
};

// ---------------------------------------------------------------------------------- tiny DOM helpers

function mk(tag, cls, text, edit) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null && text !== '') e.textContent = text;
  if (edit) e.dataset.edit = edit;
  return e;
}
const div = (cls, text, edit) => mk('div', cls, text, edit);
const span = (cls, text, edit) => mk('span', cls, text, edit);
function add(parent, ...kids) { for (const k of kids) if (k) parent.appendChild(k); return parent; }
const keepNext = (el) => { el.dataset.keep = 'next'; return el; };

const cleanUrl = (u) => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
const hrefOf = (v) => (/@/.test(v) && !/\//.test(v) ? 'mailto:' + v : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? 'https://' + v : '');

export function cityOf(p) {
  const pc = String(p.postalCity || '').replace(/^[\dA-Z]{0,3}[\s-]?\d{3,6}\s+/i, '').replace(/^\d+\s*/, '').trim();
  return pc || String(p.location || '').split(',')[0].trim();
}

function fmtBirth(v, app) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  if (!m) return String(v || '').trim();
  try { return new Intl.DateTimeFormat(localeFor(app), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(+m[1], +m[2] - 1, +m[3])); } catch { return v; }
}

function context(app, opts) {
  const ct = country(app.country);
  const design = app.design || {};
  const ed = opts.editable !== false;
  return {
    app, ct, fam: family(app.country), L: labels(app), p: state.profile, cv: app.cv || {}, letter: app.letter || {},
    photo: (opts.photo != null ? opts.photo : design.photo) && state.photo ? state.photo : '',
    dash: state.settings.docs.enDash ? ' – ' : ' - ',
    E: (path) => (ed ? path : null),
    design,
  };
}

// ---------------------------------------------------------------------------------- shared content

function contactItems(c, withAddress, short) {
  const p = c.p;
  const per = c.cv.personal || {};
  const out = [];
  if (withAddress && (p.street || p.postalCity)) out.push([p.street, p.postalCity].filter(Boolean).join(', '));
  else if (per.location || p.location) out.push(per.location || p.location);
  if (p.phone) out.push(p.phone);
  if (p.email) out.push(p.email);
  if (p.linkedin && !short) out.push(cleanUrl(p.linkedin));
  if (p.website && !short) out.push(cleanUrl(p.website));
  return out;
}

function personalItems(c) {
  const { ct, L, p } = c;
  const per = c.cv.personal || {};
  const out = [];
  if (ct.birth && p.birthDate) out.push([L.born, fmtBirth(p.birthDate, c.app)]);
  if (ct.nationality && (per.nationality || p.nationality)) out.push([L.nationality, per.nationality || p.nationality]);
  if (ct.permit && (per.permit || p.workPermit)) out.push([L.permit, per.permit || p.workPermit]);
  return out;
}

function linked(text) {
  const h = hrefOf(text);
  if (!h) return document.createTextNode(text);
  const a = mk('a', null, text);
  a.href = h;
  return a;
}

/** Items on one line, separated by a dot. Lines may break between items, never inside one. */
function joinInline(el, items, sep = '·') {
  items.forEach((it, i) => {
    const w = span('ci');
    w.appendChild(typeof it === 'string' ? linked(it) : it);
    if (i < items.length - 1) w.appendChild(span('sep', sep));
    el.appendChild(w);
    el.appendChild(document.createTextNode(' '));
  });
  return el;
}

/** Document content as neutral sections; each layout decides how a section looks. */
function sections(c) {
  const { cv, L, E, app } = c;
  const famKey = c.ct.family;
  const secs = {};
  const exp = (cv.experience || []).map((e, i) => ({ e, i }));
  const entry = (e, i, base, kind) => ({
    t: 'entry', kind,
    role: kind === 'exp' ? e.role : e.degree,
    org: [kind === 'exp' ? e.company : e.institution, e.location].filter(Boolean),
    per: period(e, app, c.dash),
    bullets: (kind === 'exp' ? e.bullets : e.details) || [],
    path: `${base}.${i}`, roleKey: kind === 'exp' ? 'role' : 'degree', orgKey: kind === 'exp' ? 'company' : 'institution',
    listKey: kind === 'exp' ? 'bullets' : 'details',
  });

  if (cv.summary) secs.profile = { title: L.profile, items: [{ t: 'para', text: cv.summary, edit: E('cv.summary') }] };
  const core = exp.filter((x) => x.e.relevance !== 'other');
  const other = exp.filter((x) => x.e.relevance === 'other');
  if (core.length) secs.experience = { title: L.experience, items: core.map((x) => entry(x.e, x.i, 'cv.experience', 'exp')) };
  if (other.length) {
    const tgt = core.length ? 'experienceOther' : 'experience';
    secs[tgt] = { title: core.length ? L.experienceOther : L.experience, items: other.map((x) => entry(x.e, x.i, 'cv.experience', 'exp')) };
  }
  if ((cv.education || []).length) secs.education = { title: L.education, items: cv.education.map((e, i) => entry(e, i, 'cv.education', 'edu')) };

  const langText = (cv.languages || []).map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(', ');
  const skillItems = (cv.skills || []).map((s, i) => ({ t: 'kv', k: s.label, v: s.items, kEdit: E(`cv.skills.${i}.label`), vEdit: E(`cv.skills.${i}.items`) }));
  const ownLangSection = ORDER[famKey].includes('languages') || famKey === 'latin';
  if (!ownLangSection && langText) skillItems.push({ t: 'kv', k: L.languages, v: langText, langs: true });
  if (skillItems.length) secs.skills = { title: L.skills, items: skillItems };
  if (ownLangSection && langText) secs.languages = { title: L.languages, items: [{ t: 'kv', k: '', v: langText, langs: true }] };

  if ((cv.certifications || []).length) {
    secs.certifications = { title: L.certifications, items: cv.certifications.map((x, i) => ({ t: 'cert', name: x.name, issuer: x.issuer, year: x.year, path: `cv.certifications.${i}` })) };
  }
  if ((cv.projects || []).length) {
    secs.projects = { title: L.projects, items: cv.projects.map((x, i) => ({ t: 'proj', name: x.name, description: x.description, path: `cv.projects.${i}` })) };
  }
  const addl = (cv.extras || []).map((x, i) => ({ t: 'kv', k: x.label, v: x.text, kEdit: E(`cv.extras.${i}.label`), vEdit: E(`cv.extras.${i}.text`) }));
  if (cv.interests && famKey !== 'latin') addl.push({ t: 'kv', k: L.interests, v: cv.interests, vEdit: E('cv.interests') });
  if (addl.length) secs.additional = { title: L.additional, items: addl };

  return ORDER[famKey].map((k) => secs[k]).filter(Boolean);
}

// ---------------------------------------------------------------------------------- block builders

function entryHead(c, it) {
  const { E } = c;
  const eh = div('d-eh');
  const l1 = div('l1');
  add(l1, span('d-role', it.role, E(`${it.path}.${it.roleKey}`)), it.per ? span('d-period', it.per, E(`${it.path}.period`)) : null);
  eh.appendChild(l1);
  if (it.org.length) {
    const l2 = div('l2 d-org');
    add(l2, span(null, it.org[0], E(`${it.path}.${it.orgKey}`)));
    if (it.org[1]) add(l2, document.createTextNode(', '), span(null, it.org[1], E(`${it.path}.location`)));
    eh.appendChild(l2);
  }
  return eh;
}

function kvLine(it) {
  const d = div('d-line');
  if (it.k) add(d, span('d-lbl', it.k, it.kEdit), document.createTextNode(': '));
  add(d, span(null, it.v, it.vEdit));
  return d;
}

function certLine(c, it) {
  const d = div('d-line');
  add(d, span('d-lbl', it.name, c.E(it.path + '.name')));
  const tail = [it.issuer, it.year].filter(Boolean);
  if (it.issuer) add(d, document.createTextNode(', '), span('d-org', it.issuer, c.E(it.path + '.issuer')));
  if (it.year) add(d, document.createTextNode(tail.length > 1 || it.issuer ? ' (' : ', '), span(null, it.year, c.E(it.path + '.year')), document.createTextNode(tail.length > 1 || it.issuer ? ')' : ''));
  return d;
}

function projLine(c, it) {
  const d = div('d-line');
  if (it.name) add(d, span('d-lbl', it.name, c.E(it.path + '.name')), document.createTextNode(it.description ? ': ' : ''));
  if (it.description) add(d, span(null, it.description, c.E(it.path + '.description')));
  return d;
}

/** Single-column flow used by the classic layout and by the main column of the sidebar layout. */
function flowBlocks(c, secs) {
  const out = [];
  for (const sec of secs) {
    out.push(keepNext(div('d-sec', sec.title)));
    for (const it of sec.items) {
      if (it.t === 'para') out.push(div('d-para', it.text, it.edit));
      else if (it.t === 'entry') {
        const eh = entryHead(c, it);
        if (it.bullets.length) keepNext(eh);
        out.push(eh);
        it.bullets.forEach((b, k) => out.push(div(it.kind === 'exp' ? 'd-bullet' : 'd-detail', b, c.E(`${it.path}.${it.listKey}.${k}`))));
      } else if (it.t === 'kv') out.push(kvLine(it));
      else if (it.t === 'cert') out.push(certLine(c, it));
      else if (it.t === 'proj') out.push(projLine(c, it));
    }
  }
  return out;
}

/** Two-column rows: used by the tabular layout (dates left) and the gutter layout (section names left). */
function rowBlocks(c, secs, mode) {
  const out = [];
  const row = (left, right, cls) => {
    const r = div('d-row' + (cls ? ' ' + cls : ''));
    const l = div('d-l');
    if (left) l.appendChild(left);
    const rr = div('d-r');
    if (right) rr.appendChild(right);
    add(r, l, rr);
    return r;
  };
  for (const sec of secs) {
    let firstOfSec = true;
    if (mode === 'tabular') out.push(keepNext(div('d-sec', sec.title)));
    const leftFor = (node) => {
      if (mode === 'gutter') { const n = firstOfSec ? div('d-sec', sec.title) : null; return n; }
      return node;
    };
    const cls = (base) => {
      let s = base || '';
      if (mode === 'gutter' && firstOfSec) s += ' secstart';
      return s.trim();
    };
    for (const it of sec.items) {
      if (it.t === 'para') {
        if (mode === 'tabular') out.push(div('d-para', it.text, it.edit));
        else out.push(row(leftFor(null), div('d-para', it.text, it.edit), cls('')));
      } else if (it.t === 'entry') {
        let right;
        let left = null;
        if (mode === 'tabular') {
          right = div();
          add(right, div('d-role', it.role, c.E(`${it.path}.${it.roleKey}`)));
          if (it.org.length) {
            const o = div('d-org');
            add(o, span(null, it.org[0], c.E(`${it.path}.${it.orgKey}`)));
            if (it.org[1]) add(o, document.createTextNode(', '), span(null, it.org[1], c.E(`${it.path}.location`)));
            right.appendChild(o);
          }
          left = it.per ? div('d-period', it.per, c.E(`${it.path}.period`)) : null;
        } else {
          right = entryHead(c, it);
        }
        const r = row(leftFor(left), right, cls('first'));
        if (it.bullets.length) keepNext(r);
        out.push(r);
        firstOfSec = false;
        it.bullets.forEach((b, k) => out.push(row(null, div(it.kind === 'exp' ? 'd-bullet' : 'd-detail', b, c.E(`${it.path}.${it.listKey}.${k}`)))));
        continue;
      } else if (it.t === 'kv') {
        if (mode === 'tabular') out.push(row(it.k ? div('d-lbl', it.k, it.kEdit) : null, div(null, it.v, it.vEdit), 'gap'));
        else out.push(row(leftFor(null), kvLine(it), cls('gap')));
      } else if (it.t === 'cert') {
        if (mode === 'tabular') {
          const right = div();
          add(right, span('d-lbl', it.name, c.E(it.path + '.name')));
          if (it.issuer) add(right, document.createTextNode(', '), span('d-org', it.issuer, c.E(it.path + '.issuer')));
          out.push(row(it.year ? div('d-period', it.year, c.E(it.path + '.year')) : null, right, 'gap'));
        } else out.push(row(leftFor(null), certLine(c, it), cls('gap')));
      } else if (it.t === 'proj') {
        out.push(row(leftFor(null), projLine(c, it), cls('gap')));
      }
      firstOfSec = false;
    }
  }
  return out;
}

function photoEl(c) {
  if (!c.photo) return null;
  const img = mk('img', 'd-photo');
  img.src = c.photo;
  img.alt = '';
  return img;
}

function metaLine(c) {
  const items = personalItems(c);
  if (!items.length) return null;
  return joinInline(div('d-meta'), items.map(([k, v]) => span(null, `${k}: ${v}`)));
}

function tailBlocks(c) {
  const out = [];
  const { ct, app, p } = c;
  if (ct.signature && c.design.signature !== false) {
    const s = div('d-sign');
    const town = cityOf(p);
    add(s, div(null, (town ? town + ', ' : '') + shortDocDate(app.letterDate, app)), div('nm', p.fullName));
    out.push(s);
  }
  if (ct.consent) out.push(div('d-consent', ct.consent[app.language] || ct.consent.en));
  return out;
}

function buildCv(c, variant) {
  const lay = c.fam.layout;
  const secs = sections(c);
  const { p, cv, L, E } = c;
  const name = div('d-name', p.fullName || 'Your name');
  const headline = cv.headline ? div('d-headline', cv.headline, E('cv.headline')) : null;

  if (lay === 'tabular') {
    const ph = photoEl(c);
    const head = div(ph ? 'd-head has-photo' : 'd-head');
    const main = div();
    add(main, div('d-doc', L.cv), name, headline, joinInline(div('d-contact'), contactItems(c, c.ct.address)), metaLine(c));
    add(head, main, ph);
    return { blocks: [head, ...rowBlocks(c, secs, 'tabular'), ...tailBlocks(c)] };
  }

  if (lay === 'gutter') {
    const ph = photoEl(c);
    const head = div(ph ? 'd-head has-photo' : 'd-head');
    const left = div();
    add(left, name, headline);
    const contact = div('d-contact');
    for (const it of contactItems(c, false)) add(contact, add(div(), linked(it)));
    const meta = personalItems(c);
    for (const [k, v] of meta) add(contact, div('d-meta', `${k}: ${v}`));
    add(head, left, contact, ph);
    return { blocks: [head, ...rowBlocks(c, secs, 'gutter'), ...tailBlocks(c)] };
  }

  if (lay === 'sidebar') {
    const side = [];
    add(side, null);
    const ph = photoEl(c);
    if (ph) side.push(ph);
    side.push(div('d-sec', L.contact));
    for (const it of contactItems(c, c.ct.address)) side.push(add(div('d-item'), linked(it)));
    for (const [k, v] of personalItems(c)) { const d = div('d-item'); add(d, span('k', k), document.createTextNode(v)); side.push(d); }
    if ((cv.languages || []).length) {
      side.push(div('d-sec', L.languages));
      cv.languages.forEach((l, i) => {
        const d = div('d-lang');
        add(d, span(null, l.name, E(`cv.languages.${i}.name`)), span('lv', l.level, E(`cv.languages.${i}.level`)));
        side.push(d);
      });
    }
    const skillsInMain = variant && variant.skillsInMain;
    if ((cv.skills || []).length && !skillsInMain) {
      side.push(div('d-sec', L.skills));
      cv.skills.forEach((s, i) => {
        const d = div('d-skillg');
        if (s.label) add(d, span('d-lbl', s.label, E(`cv.skills.${i}.label`)));
        add(d, span(null, s.items, E(`cv.skills.${i}.items`)));
        side.push(d);
      });
    }
    if (cv.interests) { side.push(div('d-sec', L.interests)); side.push(div('d-item', cv.interests, E('cv.interests'))); }
    const head = div('d-head');
    add(head, name, headline);
    let mainSecs = secs.filter((s) => s.title !== L.skills && s.title !== L.languages);
    if (skillsInMain) {
      const sk = secs.find((s) => s.title === L.skills);
      if (sk) mainSecs = [...mainSecs.filter((s) => s.title !== L.additional), sk, ...mainSecs.filter((s) => s.title === L.additional)];
    }
    return { blocks: [head, ...flowBlocks(c, mainSecs), ...tailBlocks(c)], side };
  }

  // classic
  const ph = photoEl(c);
  const head = div(ph ? 'd-head has-photo' : 'd-head');
  const target = ph ? div() : head;
  add(target, name);
  if (c.ct.family === 'br' && headline) {
    const o = div('d-headline');
    add(o, document.createTextNode(L.objective + ': '), span(null, cv.headline, E('cv.headline')));
    target.appendChild(o);
  } else if (headline) target.appendChild(headline);
  add(target, joinInline(div('d-contact'), contactItems(c, false)), metaLine(c));
  if (ph) add(head, target, ph);
  return { blocks: [head, ...flowBlocks(c, secs), ...tailBlocks(c)] };
}

function buildLetter(c) {
  const { p, letter: lt, L, E, app } = c;
  const fmt = c.fam.letter;
  const head = div('lt-head');
  add(head, div('lt-name', p.fullName || 'Your name'));
  const items = contactItems(c, true, true);
  if (fmt === 'fr') { const ct = div('lt-contact'); for (const it of items) add(ct, add(div(), linked(it))); head.appendChild(ct); }
  else head.appendChild(joinInline(div('lt-contact'), items));

  const rcpt = div('lt-rcpt');
  (lt.recipient || []).forEach((line, i) => rcpt.appendChild(div(null, line, E(`letter.recipient.${i}`))));
  const date = div('lt-date', letterDateLine(app.letterDate, app, cityOf(p)));
  const prefix = L.subject || (fmt === 'block' ? 'RE: ' : '');
  const subject = lt.subject ? div('lt-subject') : null;
  if (subject) add(subject, document.createTextNode(prefix), span(null, lt.subject, E('letter.subject')));
  const sal = lt.salutation ? div('lt-sal', lt.salutation, E('letter.salutation')) : null;
  const paras = (lt.paragraphs || []).map((t, i) => div('lt-p', t, E(`letter.paragraphs.${i}`)));
  const close = lt.closing ? keepNext(div('lt-close', lt.closing, E('letter.closing'))) : null;
  const sig = div('lt-sig', p.fullName || '');
  const encl = lt.enclosures ? div('lt-encl', lt.enclosures, E('letter.enclosures')) : null;
  if (paras.length) keepNext(paras[paras.length - 1]);

  let order;
  if (fmt === 'din') order = [head, rcpt, date, subject, sal, ...paras, close, sig, encl];
  else if (fmt === 'block') order = [head, date, rcpt, subject, sal, ...paras, close, sig, encl];
  else if (fmt === 'uk') order = [head, date, rcpt, sal, subject, ...paras, close, sig, encl];
  else if (fmt === 'fr') order = [head, rcpt, date, subject, sal, ...paras, close, sig, encl];
  else order = [head, date, rcpt, subject, sal, ...paras, close, sig, encl];
  return { blocks: order.filter(Boolean) };
}

// ---------------------------------------------------------------------------------- pages

function makeSheet(c, kind, k, built, index) {
  const pg = paper(c.app.country);
  const pal = palette(c.design.palette);
  const f = font(c.design.font);
  const el = div('sheet');
  el.style.zoom = String(LAYOUT_SCALE);
  el.style.width = pg.w + 'mm';
  el.style.height = pg.h + 'mm';
  el.style.setProperty('--p', pal.primary);
  el.style.setProperty('--s', pal.secondary);
  el.style.setProperty('--t', pal.tint);
  el.style.setProperty('--k', String(k));
  el.style.setProperty('--fs', String(f.scale));
  el.style.setProperty('--ff', f.css);
  el.style.setProperty('--fh', f.headCss || f.css);
  let body;
  if (kind === 'letter') {
    el.className = `sheet letter lt-${c.fam.letter}`;
    body = div('sheet-body');
    el.appendChild(body);
  } else if (c.fam.layout === 'sidebar') {
    el.className = 'sheet lay-sidebar';
    const side = div('d-side');
    if (index === 0) for (const s of built.side || []) side.appendChild(s);
    const mainc = div('d-mainc');
    body = div('sheet-body');
    mainc.appendChild(body);
    add(el, side, mainc);
    el._side = side;
  } else {
    el.className = `sheet lay-${c.fam.layout}` + (c.fam.header === 'center' ? ' hd-center' : '');
    body = div('sheet-body');
    el.appendChild(body);
  }
  return { el, body };
}

function paginate(stage, blocks, newPage) {
  const pages = [];
  let page = newPage(0);
  stage.appendChild(page.el);
  pages.push(page);
  for (const b of blocks) {
    page.body.appendChild(b);
    if (b.classList.contains('d-head') || b.classList.contains('lt-head')) tidySeparators(b);
    if (page.body.scrollHeight > page.body.clientHeight + 1 && page.body.childElementCount > 1) {
      const carry = [b];
      page.body.removeChild(b);
      while (page.body.childElementCount > 1 && page.body.lastElementChild.dataset.keep === 'next') {
        const k = page.body.lastElementChild;
        page.body.removeChild(k);
        carry.unshift(k);
      }
      page = newPage(pages.length);
      stage.appendChild(page.el);
      pages.push(page);
      for (const x of carry) page.body.appendChild(x);
    }
  }
  return pages;
}

const firstRect = (el) => el.getClientRects()[0] || el.getBoundingClientRect();
const lastRect = (el) => { const r = el.getClientRects(); return r.length ? r[r.length - 1] : el.getBoundingClientRect(); };

/**
 * Ensures long contact/meta items wrap instead of pushing photos out of the header, and hides
 * any separator dot left dangling at the end of a wrapped line.
 */
function tidySeparators(root) {
  for (const line of root.querySelectorAll('.d-contact, .d-meta, .lt-contact')) {
    const maxW = line.getBoundingClientRect().width;
    const items = [...line.children].filter((n) => n.classList.contains('ci'));
    if (maxW > 0) {
      for (const it of items) {
        it.classList.remove('wrap', 'wrap-anywhere');
        if (it.getBoundingClientRect().width > maxW + 1) {
          it.classList.add('wrap');
          if (it.getBoundingClientRect().width > maxW + 1) it.classList.add('wrap-anywhere');
        }
      }
    }
    items.forEach((it, i) => {
      const sep = it.querySelector('.sep');
      const next = items[i + 1];
      if (!sep || !next) return;
      sep.style.display = '';
      const sr = sep.getBoundingClientRect();
      const nr = firstRect(next);
      if (sr.height && nr.top > sr.top + sr.height * 0.5) {
        sep.style.display = 'none';
        const pr = lastRect(it);
        const nr2 = firstRect(next);
        if (pr.height && nr2.top <= pr.top + pr.height * 0.5) sep.style.display = '';
      }
    });
  }
}

function fillOf(page) {
  const last = page.body.lastElementChild;
  if (!last) return 0;
  const a = page.body.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  return a.height ? (b.bottom - a.top) / a.height : 0;
}

export function markFlags(root, flags) {
  for (const f of flags || []) {
    let el = f.path ? root.querySelector(`[data-edit="${f.path}"]`) : null;
    if (!el && f.altPath) el = root.querySelector(`[data-edit="${f.altPath}"]`);
    if (!el) continue;
    const node = el.firstChild;
    const idx = node && node.nodeType === 3 && f.match ? node.nodeValue.indexOf(f.match) : -1;
    if (idx < 0 || el.childNodes.length !== 1) { el.classList.add('flag'); el.title = f.message; continue; }
    const r = document.createRange();
    r.setStart(node, idx);
    r.setEnd(node, idx + f.match.length);
    const s = span('flag');
    s.title = f.message;
    try { r.surroundContents(s); } catch { el.classList.add('flag'); el.title = f.message; }
  }
}

/**
 * renderDoc(app, 'cv' | 'letter', { editable, flags, photo }) -> { pages: HTMLElement[], count, k, fitted }
 * The pages are detached, ready to be placed in the preview or in the print area.
 */
export function renderDoc(app, kind, opts = {}) {
  const stage = document.getElementById('stage');
  const c = context(app, opts);
  const base = density(c.design.density).k;
  const run = (k, variant) => {
    stage.replaceChildren();
    const built = kind === 'cv' ? buildCv(c, variant) : buildLetter(c);
    const pages = paginate(stage, built.blocks, (i) => makeSheet(c, kind, k, built, i));
    for (const p of pages) tidySeparators(p.el);
    return { pages, k, variant };
  };

  let variant = {};
  let res = run(base, variant);
  // a side column that overflows hands its skills to the main column
  if (kind === 'cv' && c.fam.layout === 'sidebar') {
    const side = res.pages[0].el._side;
    if (side && side.scrollHeight > side.clientHeight + 1) { variant = { skillsInMain: true }; res = run(base, variant); }
  }

  let fitted = false;
  const limit = kind === 'letter' ? 1 : c.ct.cvPages;
  const lastFill = fillOf(res.pages[res.pages.length - 1]);
  const worthTrying = res.pages.length > 1 && (res.pages.length > limit || lastFill < 0.3);
  if (worthTrying && opts.fit !== false) {
    const steps = kind === 'letter' ? [0.965, 0.93, 0.9, 0.87] : [0.97, 0.94, 0.91, 0.88];
    for (const s of steps) {
      const t = run(base * s, variant);
      if (t.pages.length < res.pages.length) { res = t; fitted = true; break; }
    }
    if (!fitted) res = run(base, variant);
  }

  const pages = res.pages.map((p) => p.el);
  stage.replaceChildren();
  if (opts.flags && opts.flags.length) for (const p of pages) markFlags(p, opts.flags);
  return { pages, count: pages.length, k: res.k, fitted };
}

export function paperOf(app) { return paper(app.country); }

// The Word export reuses the same content model, so both formats always say the same thing.
export const model = { context, sections, contactItems, personalItems, cleanUrl };
