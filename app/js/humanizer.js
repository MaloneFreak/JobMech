// Deterministic text hygiene and quality checks.
// The AI editor does the rewriting; this file guarantees the mechanical rules (no dashes, no
// markdown left-overs) and reports everything a careful reader should double-check.
import { country } from './countries.js';
import { words } from './util.js';

// ---------------------------------------------------------------------------------- sanitising

export function sanitize(input, ctx = {}) {
  let s = String(input == null ? '' : input);
  if (!s) return '';
  s = s.replace(/[​-‍﻿⁠]/g, '').replace(/[   ]/g, ' ');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1');
  s = s.replace(/^\s*(?:[-*•●▪‣]\s+)/, '');
  s = s.replace(/−/g, '-').replace(/‑/g, '-');
  // number ranges keep a plain hyphen: 2020–2024 -> 2020-2024
  s = s.replace(/(\d)\s*[‒–—―]\s*(\d)/g, '$1-$2');
  // dashes used as punctuation become commas
  s = s.replace(/\s*[‒–—―]\s*/g, ', ');
  s = s.replace(/\s+--\s+/g, ', ');
  s = s.replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/,\s*([.;:!?])/g, '$1').replace(/^[,\s]+/, '').replace(/([.!?])\s*,\s*/g, '$1 ');
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  if (ctx.country === 'CH' && ctx.lang === 'de') s = s.replace(/ß/g, 'ss');
  return s;
}

/** Applies sanitize() to every text field of the CV and letter, in place. */
export function sanitizeDocs(app) {
  const ctx = { country: app.country, lang: app.language };
  const walk = (node) => {
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = typeof node[i] === 'string' ? sanitize(node[i], ctx) : walk(node[i]); return node; }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (k === 'start' || k === 'end') continue;
        node[k] = typeof node[k] === 'string' ? sanitize(node[k], ctx) : walk(node[k]);
      }
    }
    return node;
  };
  if (app.cv) walk(app.cv);
  if (app.letter) walk(app.letter);
  return app;
}

// ---------------------------------------------------------------------------------- field access

/** Every reviewable text field as { path: text }. Paths match the data-edit attributes in the preview. */
export function textFields(app) {
  const f = {};
  const cv = app.cv || {};
  const put = (path, v) => { if (typeof v === 'string' && v.trim()) f[path] = v; };
  put('cv.headline', cv.headline);
  put('cv.summary', cv.summary);
  (cv.experience || []).forEach((e, i) => {
    put(`cv.experience.${i}.role`, e.role);
    (e.bullets || []).forEach((b, k) => put(`cv.experience.${i}.bullets.${k}`, b));
  });
  (cv.education || []).forEach((e, i) => {
    put(`cv.education.${i}.degree`, e.degree);
    (e.details || []).forEach((b, k) => put(`cv.education.${i}.details.${k}`, b));
  });
  (cv.skills || []).forEach((s, i) => { put(`cv.skills.${i}.label`, s.label); put(`cv.skills.${i}.items`, s.items); });
  (cv.projects || []).forEach((p, i) => put(`cv.projects.${i}.description`, p.description));
  (cv.extras || []).forEach((x, i) => { put(`cv.extras.${i}.label`, x.label); put(`cv.extras.${i}.text`, x.text); });
  put('cv.interests', cv.interests);
  const l = app.letter || {};
  put('letter.subject', l.subject);
  put('letter.salutation', l.salutation);
  (l.paragraphs || []).forEach((p, i) => put(`letter.paragraphs.${i}`, p));
  put('letter.closing', l.closing);
  return f;
}

// ---------------------------------------------------------------------------------- phrase lists

const B = (list) => list.map((x) => new RegExp(x, 'i'));
const BANNED = {
  en: B(['\\bdelv(e|es|ed|ing)\\b', '\\btapestry\\b', '\\btestament to\\b', '\\bspearhead\\w*', '\\borchestrat\\w+', '\\bleverag\\w+', '\\butili[sz]\\w+', '\\bsynerg\\w+',
    '\\bseamless(ly)?\\b', '\\bmeticulous(ly)?\\b', '\\bcutting[- ]edge\\b', '\\bstate[- ]of[- ]the[- ]art\\b', '\\bgame[- ]chang\\w+', '\\bpassionate\\b', '\\bpassion for\\b',
    '\\bthrilled\\b', '\\bexcited to\\b', '\\bproven track record\\b', '\\bresults?[- ](driven|oriented)\\b', '\\bdetail[- ]oriented\\b', '\\bfast[- ]paced\\b', '\\bdynamic\\b',
    '\\bteam player\\b', '\\bhit the ground running\\b', '\\boutside the box\\b', '\\bself[- ]starter\\b', '\\bmoreover\\b', '\\bfurthermore\\b', '\\bin conclusion\\b',
    '\\bit is worth noting\\b', '\\bI am writing to\\b', '\\b(perfect|great|ideal) fit\\b', '\\brobust\\b', '\\bholistic\\b', '\\bpivotal\\b', '\\bfoster(ed|ing)?\\b',
    '\\bin today\'s\\b', '\\bunwavering\\b', '\\bworld[- ]class\\b', '\\bbest[- ]in[- ]class\\b', '\\bnot only\\b', '\\bever[- ]evolving\\b', '\\bstrong work ethic\\b']),
  de: B(['\\bhochmotiviert\\w*', '\\bleidenschaft\\w*', '\\bdynamisch\\w*', '\\bteamfähig\\w*', '\\bbelastbar\\w*', '\\bhiermit bewerbe ich mich\\b', '\\bmit großem interesse\\b',
    '\\büber den tellerrand\\b', '\\bhands-on-mentalität\\b', '\\b(lösungs|ziel|ergebnis)orientiert\\w*', '\\bnahtlos\\w*', '\\bbegeistert\\w*', '\\bnicht nur\\b',
    '\\bdarüber hinaus\\b', '\\bausgeprägte\\w* kommunikationsfähigkeit\\w*', '\\bproaktiv\\w*', '\\bspannende\\w* herausforderung\\w*', '\\bidealer? kandidat\\w*']),
  pt: B(['\\bapaixonad[oa]\\b', '\\bproativ[oa]\\b', '\\bdinâmic[oa]\\b', '\\bsólida experiência\\b', '\\bvenho por meio dest[ae]\\b', '\\bhands-on\\b', '\\bfora da caixa\\b',
    '\\bfocad[oa] em resultados\\b', '\\bampla experiência\\b', '\\balavanc\\w+', '\\bnão apenas\\b', '\\balém disso\\b', '\\bcomprovada experiência\\b']),
  fr: B(['\\bpassionn[ée]e?\\b', '\\bdynamique\\b', '\\bforce de proposition\\b', '\\bvif intérêt\\b', '\\bnon seulement\\b', '\\bde plus,\\b', '\\bsolide expérience\\b', '\\bproactif\\w*', '\\bproactive\\b']),
  es: B(['\\bapasionad[oa]\\b', '\\bproactiv[oa]\\b', '\\bdinámic[oa]\\b', '\\bme dirijo a ustedes\\b', '\\borientad[oa] a resultados\\b', '\\bno solo\\b', '\\bamplia experiencia\\b', '\\bademás,\\b']),
  it: B(['\\bappassionat[oa]\\b', '\\bdinamic[oa]\\b', '\\bproattiv[oa]\\b', '\\borientat[oa] ai risultati\\b', '\\bnon solo\\b', '\\bcomprovata esperienza\\b']),
  nl: B(['\\bgepassioneerd\\w*', '\\bgedreven\\b', '\\bresultaatgericht\\w*', '\\bteamspeler\\b', '\\bproactie[fv]\\w*', '\\bniet alleen\\b', '\\bdynamisch\\w*']),
};

const FIRST_PERSON = {
  en: /\b(I|my|me|myself)\b/,
  de: /\b(ich|mein|meine|meinen|meinem|meiner|mir|mich)\b/i,
  pt: /\b(eu|meu|minha|meus|minhas)\b/i,
  fr: /\b(je|j'|mon|ma|mes)\b/i,
  es: /\b(yo|mi|mis)\b/i,
  it: /\b(io|mio|mia|miei|mie)\b/i,
  nl: /\b(ik|mijn)\b/i,
};

// ---------------------------------------------------------------------------------- number checks

const digitsOnly = (t) => t.replace(/[^\d]/g, '');

function numberSet(text) {
  const set = new Set();
  for (const m of String(text || '').matchAll(/\d[\d.,']*\d|\d/g)) {
    const d = digitsOnly(m[0]);
    if (d) set.add(d.replace(/^0+(?=\d)/, ''));
  }
  // years inside dates ("01.12.2026", "12/2027") count on their own
  for (const y of String(text || '').matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)) set.add(y[0]);
  return set;
}

function unverifiedNumbers(text, known) {
  const out = [];
  for (const m of String(text || '').matchAll(/\d[\d.,'/-]*\d|\d/g)) {
    const raw = m[0];
    // dates are written differently in every language: only their year has to be in the material
    const date = /^(?:\d{1,2}[./-]\d{1,2}[./-](\d{4})|\d{1,2}[./](\d{4})|(\d{4})-\d{1,2}(?:-\d{1,2})?)$/.exec(raw);
    if (date) {
      const year = date[1] || date[2] || date[3];
      if (!known.has(year)) out.push(raw);
      continue;
    }
    if (/[/-]/.test(raw)) {
      // ranges and fractions such as 15-20 or 2/3: check each part on its own
      for (const part of raw.split(/[/-]/)) {
        const pd = digitsOnly(part).replace(/^0+(?=\d)/, '');
        if (pd.length >= 2 && !known.has(pd)) out.push(part);
      }
      continue;
    }
    const d = digitsOnly(raw).replace(/^0+(?=\d)/, '');
    const after = text.slice(m.index + raw.length, m.index + raw.length + 2);
    const isPct = /^\s?%/.test(after);
    if (d.length < 2 && !isPct) continue;
    if (known.has(d)) continue;
    // "200+" style and split thousands ("1 000") are tolerated when a nearby form is known
    if ([...known].some((k) => k.length >= 3 && (k.startsWith(d) || d.startsWith(k)) && Math.abs(k.length - d.length) <= 1)) continue;
    out.push(raw + (isPct ? '%' : ''));
  }
  return out;
}

// ---------------------------------------------------------------------------------- assessment

const toolLike = (k) => /[A-Z]{2,}|[a-z][A-Z]|\d|[+#.]/.test(k);
const loose = (s) => String(s || '').toLowerCase().replace(/[\s\-_/]+/g, ' ');

/**
 * Looks at the finished documents and reports what a careful reader should check.
 * sources: the candidate's material + answers + the job text (what the AI was allowed to use).
 * layout: { cvPages, letterPages } from the renderer, when known.
 */
export function assess(app, sources, layout = {}) {
  const ct = country(app.country);
  const lang = app.language || 'en';
  const fields = textFields(app);
  const flags = [];
  const checks = [];
  const banned = BANNED[lang] || [];
  const known = numberSet(sources.all);
  const fp = FIRST_PERSON[lang];

  let dashes = 0;
  for (const [path, text] of Object.entries(fields)) {
    dashes += (text.match(/[‒-―]/g) || []).length;
    for (const re of banned) {
      const m = re.exec(text);
      if (m) flags.push({ path, kind: 'phrase', match: m[0], message: `Stock phrase: "${m[0]}"` });
    }
    const ph = /\[[^\]\n]{2,40}\]|\bXYZ\b|\bLorem ipsum\b/i.exec(text);
    if (ph) flags.push({ path, kind: 'placeholder', match: ph[0], message: `Placeholder left in the text: ${ph[0]}` });
    if (/!/.test(text) && !path.endsWith('salutation')) flags.push({ path, kind: 'tone', match: '!', message: 'Exclamation mark' });
    if (fp && /^cv\.experience\.\d+\.bullets/.test(path)) {
      const m = fp.exec(text);
      if (m) flags.push({ path, kind: 'pronoun', match: m[0], message: `CV bullets normally avoid "${m[0]}"` });
    }
    if (!/\.label$|\.salutation$|\.closing$/.test(path)) {
      for (const n of unverifiedNumbers(text, known)) flags.push({ path, kind: 'number', match: n, message: `"${n}" is not in your material. Check it.` });
    }
  }

  // dates of positions: the years must come from the material
  const cv = app.cv || {};
  const yearCheck = (list, base) => (list || []).forEach((e, i) => {
    for (const v of [e.start, e.end, e.period]) {
      for (const y of String(v || '').match(/\b(19|20)\d{2}\b/g) || []) {
        if (!known.has(y)) flags.push({ path: `${base}.${i}.role`, altPath: `${base}.${i}.degree`, kind: 'number', match: y, message: `The year ${y} is not in your material. Check the dates.` });
      }
    }
  });
  yearCheck(cv.experience, 'cv.experience');
  yearCheck(cv.education, 'cv.education');

  // tools the documents mention although the candidate's material never does
  const an = (app.job && app.job.analysis) || {};
  const docText = loose(Object.values(fields).join('\n'));
  const mine = loose(sources.candidate);
  const kws = (an.keywords || []).filter(Boolean);
  const coverage = kws.map((k) => ({ k, hit: docText.includes(loose(k)) }));
  for (const c of coverage) {
    if (c.hit && toolLike(c.k) && !mine.includes(loose(c.k))) {
      const path = Object.keys(fields).find((p) => loose(fields[p]).includes(loose(c.k)));
      flags.push({ path, kind: 'claim', match: c.k, message: `"${c.k}" is mentioned, but your material never names it. Make sure the sentence is true.` });
    }
  }

  const phraseFlags = flags.filter((f) => f.kind === 'phrase').length;
  const numFlags = flags.filter((f) => f.kind === 'number' || f.kind === 'claim').length;
  const letterWords = words((app.letter && app.letter.paragraphs || []).join(' '));
  const [lo, hi] = ct.letterWords;

  checks.push(dashes === 0
    ? { level: 'ok', title: 'No em or en dashes', detail: 'Checked across both documents.' }
    : { level: 'bad', title: `${dashes} dash character${dashes > 1 ? 's' : ''} found`, detail: 'Run the humanizer again to remove them.' });
  checks.push(phraseFlags === 0
    ? { level: 'ok', title: 'No stock phrases', detail: 'Nothing from the buzzword list.' }
    : { level: 'warn', title: `${phraseFlags} stock phrase${phraseFlags > 1 ? 's' : ''}`, detail: 'Listed below. Reword them or let the AI do it.' });
  checks.push(numFlags === 0
    ? { level: 'ok', title: 'Numbers and tools match your material', detail: 'Every figure was found in what you provided.' }
    : { level: 'warn', title: `${numFlags} detail${numFlags > 1 ? 's' : ''} to verify`, detail: 'Figures or tools that JobMech could not find in your material.' });
  if (flags.some((f) => f.kind === 'placeholder')) checks.push({ level: 'bad', title: 'Placeholder text left', detail: 'Replace the bracketed text before sending.' });

  if (layout.cvPages) {
    const max = ct.cvPages;
    checks.push(layout.cvPages <= max
      ? { level: 'ok', title: `CV: ${layout.cvPages} page${layout.cvPages > 1 ? 's' : ''}`, detail: `Fits the ${ct.name} norm (up to ${max}).` }
      : { level: 'warn', title: `CV: ${layout.cvPages} pages`, detail: `${ct.name} employers expect ${max} at most. Shorten it or choose compact spacing.` });
  }
  if (app.letter) {
    const pagesOk = !layout.letterPages || layout.letterPages <= 1;
    if (!pagesOk) checks.push({ level: 'warn', title: `Cover letter: ${layout.letterPages} pages`, detail: 'A cover letter should fit on one page. Ask the AI to shorten it.' });
    else if (letterWords > hi + 60) checks.push({ level: 'warn', title: `Cover letter: ${letterWords} words`, detail: `Longer than usual here (${lo}-${hi}).` });
    else if (letterWords < lo - 70) checks.push({ level: 'warn', title: `Cover letter: ${letterWords} words`, detail: `Shorter than usual here (${lo}-${hi}).` });
    else checks.push({ level: 'ok', title: `Cover letter: ${letterWords} words, one page`, detail: `Usual range here is ${lo}-${hi}.` });
  }

  const hits = coverage.filter((c) => c.hit).length;
  return { checks, flags, coverage, stats: { letterWords, keywordHits: hits, keywordTotal: coverage.length } };
}

/** Builds the source texts used by assess(). */
export function sourcesFor(app, memoryText) {
  const answers = (app.answers || []).map((a) => `${a.q}\n${a.a || ''}`).join('\n') + '\n' + (app.extraNotes || '');
  const candidate = memoryText + '\n' + answers;
  return { candidate, all: candidate + '\n' + ((app.job && app.job.text) || '') };
}
