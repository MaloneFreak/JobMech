// The writing pipeline: analyse the job -> write the CV -> write the letter -> edit (humanize + fact check).
// Every step validates what the AI returned; nothing is ever made up locally when a step fails.
import { chatJson, AiError } from './client.js';
import { analysisPrompt, cvPrompt, letterPrompt, humanizePrompt, refinePrompt, tidyPrompt } from './prompts.js';
import { state, memoryForAi } from '../store.js';
import { country } from '../countries.js';
import { normalizeLang } from '../doclang.js';
import { sanitize, sanitizeDocs, textFields } from '../humanizer.js';
import { deepSet, deepGet, clone } from '../util.js';

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const lines = (v) => arr(typeof v === 'string' ? v.split(/\n+/) : v).map(str).filter(Boolean);
const noPlaceholder = (s) => !/\[[^\]\n]{2,40}\]/.test(s);

// ---------------------------------------------------------------------------------- analysis

export function normalizeAnalysis(raw) {
  const j = raw.job || {};
  const lang = normalizeLang(j.language);
  const code = str(j.countryCode).toUpperCase().slice(0, 2);
  const statusOf = (s) => (/^met/i.test(s) ? 'met' : /^part/i.test(s) ? 'partial' : 'missing');
  return {
    job: {
      title: str(j.title).replace(/\s*\((?:m\/w\/d|w\/m\/d|m\/f\/d|f\/m\/d|m\/f\/x|all genders|gn)\)\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim(),
      company: str(j.company),
      city: str(j.city),
      countryCode: country(code).code === code ? code : 'XX',
      language: lang.code,
      languageName: lang.code === 'other' ? lang.name : '',
      contactPerson: str(j.contactPerson),
      contactSalutation: str(j.contactSalutation),
      reference: str(j.reference),
      startDate: str(j.startDate),
      contract: str(j.contract),
      address: lines(j.address).filter(noPlaceholder).slice(0, 4),
    },
    requirements: arr(raw.requirements).map((r) => ({
      text: str(r && r.text), importance: /nice/i.test(str(r && r.importance)) ? 'nice' : 'must',
      status: statusOf(str(r && r.status)), evidence: str(r && r.evidence),
    })).filter((r) => r.text).slice(0, 12),
    questions: arr(raw.questions).map((q) => (typeof q === 'string' ? { question: q, why: '' } : { question: str(q && q.question), why: str(q && q.why) }))
      .filter((q) => q.question).slice(0, 6),
    keywords: [...new Set(arr(raw.keywords).map(str).filter(Boolean))].slice(0, 20),
    fit: str(raw.fit),
  };
}

export async function analyzeJob(jobText, opts = {}) {
  const p = analysisPrompt({ memory: memoryForAi(), jobText });
  const raw = await chatJson({
    ...p, temperature: 0.2, effort: 'medium', task: 'analysis', signal: opts.signal, onDelta: opts.onDelta, onStatus: opts.onStatus,
    validate: (o) => o.job && typeof o.job === 'object',
  });
  return normalizeAnalysis(raw);
}

// ---------------------------------------------------------------------------------- documents

function normDates(e) {
  const out = { start: str(e.start), end: str(e.end) };
  if (!out.start && e.period) out.period = str(e.period);
  return out;
}

export function normalizeCv(raw, app) {
  const ctx = { country: app.country, lang: app.language };
  const s = (v) => sanitize(str(v), ctx);
  const cv = {
    headline: s(raw.headline),
    summary: s(raw.summary),
    experience: arr(raw.experience).filter((e) => e && typeof e === 'object').map((e) => ({
      role: s(e.role), company: s(e.company), location: s(e.location), ...normDates(e),
      relevance: /other/i.test(str(e.relevance)) ? 'other' : 'core',
      bullets: lines(e.bullets).map(s).filter(Boolean).slice(0, 7),
    })).filter((e) => e.role || e.company),
    education: arr(raw.education).filter((e) => e && typeof e === 'object').map((e) => ({
      degree: s(e.degree), institution: s(e.institution), location: s(e.location), ...normDates(e),
      details: lines(e.details).map(s).filter(Boolean).slice(0, 4),
    })).filter((e) => e.degree || e.institution),
    skills: [],
    languages: arr(raw.languages).map((l) => {
      if (typeof l === 'string') {
        const m = /^(.*?)\s*[(:]\s*(.+?)\)?$/.exec(l);
        return m ? { name: s(m[1]), level: s(m[2]) } : { name: s(l), level: '' };
      }
      return { name: s(l && l.name), level: s(l && l.level) };
    }).filter((l) => l.name),
    certifications: arr(raw.certifications).map((c) => (typeof c === 'string' ? { name: s(c), issuer: '', year: '' } : { name: s(c && c.name), issuer: s(c && c.issuer), year: s(c && c.year) })).filter((c) => c.name),
    projects: arr(raw.projects).map((p) => (typeof p === 'string' ? { name: '', description: s(p) } : { name: s(p && p.name), description: s(p && p.description) })).filter((p) => p.name || p.description),
    extras: arr(raw.extras).map((x) => (typeof x === 'string' ? { label: '', text: s(x) } : { label: s(x && x.label), text: s(x && x.text) })).filter((x) => x.text),
    interests: Array.isArray(raw.interests) ? raw.interests.map(s).filter(Boolean).join(', ') : s(raw.interests),
    personal: {
      location: s(raw.personal && raw.personal.location),
      nationality: s(raw.personal && raw.personal.nationality),
      permit: s(raw.personal && raw.personal.permit),
    },
  };
  const sk = arr(raw.skills);
  if (sk.length && sk.every((x) => typeof x === 'string')) cv.skills = [{ label: '', items: sk.map(s).filter(Boolean).join(', ') }];
  else cv.skills = sk.filter((x) => x && typeof x === 'object').map((x) => ({ label: s(x.label), items: Array.isArray(x.items) ? x.items.map(s).filter(Boolean).join(', ') : s(x.items) })).filter((x) => x.items);
  return cv;
}

export function normalizeLetter(raw, app) {
  const ctx = { country: app.country, lang: app.language };
  const s = (v) => sanitize(str(v), ctx);
  const ct = country(app.country);
  let paragraphs = Array.isArray(raw.paragraphs) ? raw.paragraphs : String(raw.paragraphs || raw.body || '').split(/\n{2,}/);
  paragraphs = paragraphs.map(s).filter(Boolean);
  let salutation = s(raw.salutation);
  let closing = s(raw.closing || raw.signOff);
  if (app.language === 'de') {
    closing = closing.replace(/[,.]\s*$/, '');
    if (ct.code === 'CH') salutation = salutation.replace(/,\s*$/, '');
  }
  return {
    recipient: lines(raw.recipient).map(s).filter(noPlaceholder).slice(0, 5),
    subject: s(raw.subject).replace(/^(betreff|betr\.|subject|re|objet|asunto|oggetto|betreft|assunto)\s*:\s*/i, ''),
    salutation,
    paragraphs,
    closing,
    enclosures: s(raw.enclosures),
  };
}

function snapshot(app, label) {
  if (!app.cv && !app.letter) return;
  app.history = app.history || [];
  app.history.unshift({ at: new Date().toISOString(), label, cv: clone(app.cv), letter: clone(app.letter) });
  app.history = app.history.slice(0, 8);
}

/**
 * Writes both documents for an application. Mutates and returns `app`.
 * hooks: { signal, onStage(id, state, detail), onDelta(text), onStatus(message) }
 * stages: cv, letter, edit
 */
export async function generateDocuments(app, hooks = {}) {
  const { signal, onStage = () => {}, onDelta, onStatus } = hooks;
  const memory = memoryForAi();
  const base = { signal, onDelta, onStatus };
  snapshot(app, 'Before regenerating');

  onStage('cv', 'run');
  const rawCv = await chatJson({
    ...cvPrompt(app, memory), ...base, temperature: 0.55, effort: 'medium', task: 'cv',
    validate: (o) => Array.isArray(o.experience) || Array.isArray(o.education) || typeof o.summary === 'string',
  });
  app.cv = normalizeCv(rawCv, app);
  app.labels = app.language === 'other' && rawCv.labels && typeof rawCv.labels === 'object' ? rawCv.labels : null;
  app.pending = {
    facts: arr(rawCv.facts).map(str).filter(Boolean).slice(0, 8),
    gaps: arr(rawCv.gaps).map(str).filter(Boolean).slice(0, 8),
  };
  if (!app.cv.experience.length && !app.cv.education.length) {
    throw new AiError('The AI returned an empty CV. Your background may be missing: check Memory, then try again.', { kind: 'format' });
  }
  onStage('cv', 'done');

  onStage('letter', 'run');
  const rawLetter = await chatJson({
    ...letterPrompt(app, memory, state.profile), ...base, temperature: 0.65, effort: 'medium', task: 'letter',
    validate: (o) => Array.isArray(o.paragraphs) || typeof o.paragraphs === 'string' || typeof o.body === 'string',
  });
  app.letter = normalizeLetter(rawLetter, app);
  if (!app.letter.paragraphs.length) throw new AiError('The AI returned an empty cover letter. Try again.', { kind: 'format' });
  onStage('letter', 'done');

  app.editNotes = [];
  if (state.settings.ai.humanize) {
    onStage('edit', 'run');
    try {
      await humanize(app, base);
      onStage('edit', 'done');
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      // The drafts are complete; a failed polish must not cost the user the result.
      app.editNotes = ['The editing pass could not run (' + (e.message || 'error') + '). The draft is unedited: run "Humanize again" from the Review tab.'];
      onStage('edit', 'fail', e.message);
    }
  } else {
    onStage('edit', 'skip');
  }
  sanitizeDocs(app);
  app.legacy = false;
  app.generatedAt = new Date().toISOString();
  return app;
}

/** The editing pass: fact check + de-AI the wording. Only changed fields come back. */
export async function humanize(app, hooks = {}) {
  const memory = memoryForAi();
  const fields = textFields(app);
  const res = await chatJson({
    ...humanizePrompt(app, memory, fields), signal: hooks.signal, onDelta: hooks.onDelta, onStatus: hooks.onStatus,
    temperature: 0.35, effort: 'medium', task: 'edit', validate: (o) => o.edits && typeof o.edits === 'object',
  });
  let changed = 0;
  const ctx = { country: app.country, lang: app.language };
  const removals = [];
  for (const [path, value] of Object.entries(res.edits || {})) {
    if (!(path in fields) || typeof value !== 'string') continue;
    const next = sanitize(value, ctx);
    if (next === fields[path]) continue;
    const isBullet = /\.(bullets|details)\.\d+$/.test(path) || /^letter\.paragraphs\.\d+$/.test(path);
    if (!next) { if (isBullet) removals.push(path); continue; }      // only list items may be deleted
    deepSet(app, path, next);
    changed++;
  }
  // delete from the end so earlier indexes stay valid
  removals.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const path of removals) {
    const i = path.lastIndexOf('.');
    const list = deepGet(app, path.slice(0, i));
    if (Array.isArray(list) && list.length > 1) { list.splice(+path.slice(i + 1), 1); changed++; }
  }
  app.editNotes = arr(res.notes).map(str).filter(Boolean).slice(0, 8);
  app.editedFields = changed;
  sanitizeDocs(app);
  return changed;
}

/** Applies a free-text request ("shorter", "stress Power BI") to one document. */
export async function refine(app, target, instruction, hooks = {}) {
  const memory = memoryForAi();
  const doc = target === 'cv' ? app.cv : app.letter;
  const res = await chatJson({
    ...refinePrompt(app, memory, target, instruction, doc), signal: hooks.signal, onDelta: hooks.onDelta, onStatus: hooks.onStatus,
    temperature: 0.5, effort: 'medium', task: 'refine-' + target,
    validate: (o) => (target === 'cv' ? Array.isArray(o.experience) || Array.isArray(o.education) : o.paragraphs != null),
  });
  snapshot(app, target === 'cv' ? 'Before CV change' : 'Before letter change');
  if (target === 'cv') app.cv = normalizeCv(res, app);
  else app.letter = normalizeLetter(res, app);
  sanitizeDocs(app);
  return str(res.note);
}

/** Turns raw question/answer pairs in memory into clean standalone facts and known gaps. */
export async function tidyMemory(hooks = {}) {
  const items = state.memory.facts.filter((f) => !f.fact && (f.q || f.a)).map((f) => ({ id: f.id, q: f.q, a: f.a }));
  if (!items.length) return { facts: 0, gaps: 0 };
  const res = await chatJson({ ...tidyPrompt(items), signal: hooks.signal, onStatus: hooks.onStatus, temperature: 0.2, effort: 'low', task: 'tidy', validate: (o) => Array.isArray(o.facts) });
  let n = 0;
  for (const r of arr(res.facts)) {
    const f = state.memory.facts.find((x) => x.id === (r && r.id));
    const text = str(r && r.fact);
    if (f && text) { f.fact = text; n++; }
  }
  const gaps = arr(res.gaps).map(str).filter(Boolean);
  return { facts: n, gaps };
}
