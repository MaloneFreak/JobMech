// The writing pipeline: analyse the job -> write the CV -> write the letter -> edit (humanize + fact check).
// Every step validates what the AI returned, keeps inputs within the active model's token budget,
// and adapts automatically when a provider reports a tight token limit.
import { chat, chatJson, AiError, activeConfig, learnedLimitFor, noteLimit } from './client.js';
import { budgetFor, cleanJobText, cleanStoryText, compactMemory, estimateTokens, hashText, splitStoryChunks } from './context.js';
import { analysisPrompt, cvPrompt, letterPrompt, humanizePrompt, refinePrompt, tidyPrompt, interviewPrompt, digestPrompt, compactCv } from './prompts.js';
import { store as disk } from '../host.js';
import { state } from '../store.js';
import { country } from '../countries.js';
import { normalizeLang } from '../doclang.js';
import { sanitize, sanitizeDocs, textFields } from '../humanizer.js';
import { deepSet, deepGet, clone } from '../util.js';

const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const lines = (v) => arr(typeof v === 'string' ? v.split(/\n+/) : v).map(str).filter(Boolean);
const noPlaceholder = (s) => !/\[[^\]\n]{2,40}\]/.test(s);

// ---------------------------------------------------------------------------------- token budgeting & cached story digest

const DIGEST_FILE = 'story-digest.json';
let digestCache = { hash: '', text: '' };

export function clearDigestCache() { digestCache = { hash: '', text: '' }; }

/**
 * When a candidate's career story is very large relative to the active model's token budget
 * (e.g. multiple pasted CVs on Groq 8k), distills it once in lossless chunks and caches the
 * result keyed by story hash so every subsequent stage and application reuses it at zero cost.
 */
async function ensureDigest(cfg, budget, hooks = {}, force = false) {
  const rawStory = (state.memory && state.memory.story) || '';
  const cleaned = cleanStoryText(rawStory);
  if (!cleaned) return '';
  const storyTok = estimateTokens(cleaned);
  const threshold = force ? 900 : Math.max(2200, Math.floor(budget.maxInput * 0.52));
  if (storyTok <= threshold) return '';

  const h = hashText(rawStory);
  if (digestCache.hash === h && digestCache.text) return digestCache.text;
  try {
    const saved = await disk.readJson(DIGEST_FILE);
    if (saved && saved.hash === h && typeof saved.text === 'string' && saved.text.trim()) {
      digestCache = { hash: h, text: saved.text.trim() };
      return digestCache.text;
    }
  } catch { /* disk cache optional */ }

  const chunkCap = Math.max(1200, Math.min(2600, budget.maxInput - 500));
  const chunks = splitStoryChunks(cleaned, chunkCap);
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    if (hooks.onStatus) {
      hooks.onStatus(chunks.length > 1
        ? `Compacting large background (part ${i + 1} of ${chunks.length})`
        : 'Compacting large background');
    }
    const r = await chat({
      ...digestPrompt(chunks[i], i + 1, chunks.length),
      temperature: 0.1, effort: 'low', expectedOut: 950, task: 'digest',
      signal: hooks.signal, onStatus: hooks.onStatus,
    });
    if (r.text) parts.push(r.text.trim());
  }
  const digest = parts.filter(Boolean).join('\n\n').trim();
  if (digest && estimateTokens(digest) < storyTok * 0.92) {
    digestCache = { hash: h, text: digest };
    try { await disk.writeJson(DIGEST_FILE, { hash: h, text: digest, updatedAt: new Date().toISOString() }); } catch { /* ignore */ }
    return digest;
  }
  return '';
}

function memoryInput(task, { jobText = '', analysis = null, cv = null, maxTokens = 0, digest = '' } = {}) {
  return compactMemory(
    { profile: state.profile, story: state.memory.story, facts: state.memory.facts, gaps: state.memory.gaps },
    { task, jobText, analysis, cv, maxTokens, digest },
  );
}

/**
 * Runs one budgeted AI step. If the provider rejects the request as too large (HTTP 413 or
 * Requested > Limit), records the tighter limit, compacts further (including lossless story
 * distillation when helpful), and retries automatically.
 */
async function runBudgeted(task, fn, hooks = {}) {
  const scales = [1, 0.68, 0.48];
  for (let attempt = 0; attempt < scales.length; attempt++) {
    const cfg = activeConfig();
    const budget = budgetFor(cfg, learnedLimitFor(cfg), task);
    const digest = await ensureDigest(cfg, budget, hooks, attempt > 0);
    try {
      return await fn({ cfg, budget, scale: scales[attempt], digest, attempt });
    } catch (e) {
      if (e && e.kind === 'too_large' && attempt < scales.length - 1) {
        const nextLimit = e.tokenLimit > 0 ? e.tokenLimit : Math.floor(budget.maxTotal * 0.72);
        noteLimit(cfg, nextLimit);
        if (hooks.onStatus) hooks.onStatus('Compacting prompt to fit model token limit');
        continue;
      }
      throw e;
    }
  }
}

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
  const raw = await runBudgeted('analysis', ({ budget, scale, digest }) => {
    const avail = Math.max(1100, Math.floor((budget.maxInput - 650) * scale));
    const jobCap = Math.max(500, Math.min(2400, Math.floor(avail * 0.46)));
    const memCap = Math.max(600, avail - jobCap);
    const cleanJob = cleanJobText(jobText, jobCap);
    const mem = memoryInput('analysis', { jobText: cleanJob, maxTokens: memCap, digest });
    const p = analysisPrompt({ memory: mem, jobText: cleanJob });
    return chatJson({
      ...p, temperature: 0.2, effort: 'medium', expectedOut: budget.expectedOut, task: 'analysis',
      signal: opts.signal, onDelta: opts.onDelta, onStatus: opts.onStatus,
      validate: (o) => o.job && typeof o.job === 'object',
    });
  }, opts);
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
  const base = { signal, onDelta, onStatus };
  const analysis = app.job && app.job.analysis;
  snapshot(app, 'Before regenerating');

  onStage('cv', 'run');
  const rawCv = await runBudgeted('cv', ({ budget, scale, digest }) => {
    const avail = Math.max(1200, Math.floor((budget.maxInput - 1500) * scale));
    const jobCap = Math.max(450, Math.min(1800, Math.floor(avail * 0.34)));
    const memCap = Math.max(700, avail - jobCap);
    const jobText = cleanJobText((app.job && app.job.text) || '', jobCap);
    const mem = memoryInput('cv', { jobText, analysis, maxTokens: memCap, digest });
    return chatJson({
      ...cvPrompt(app, mem, { jobText }), ...base, temperature: 0.55, effort: 'medium', expectedOut: budget.expectedOut, task: 'cv',
      validate: (o) => Array.isArray(o.experience) || Array.isArray(o.education) || typeof o.summary === 'string',
    });
  }, base);
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
  const rawLetter = await runBudgeted('letter', ({ budget, scale, digest }) => {
    const cvTok = estimateTokens(compactCv(app.cv));
    const avail = Math.max(1000, Math.floor((budget.maxInput - 1350 - cvTok) * scale));
    const jobCap = Math.max(420, Math.min(1600, Math.floor(avail * 0.38)));
    const memCap = Math.max(550, avail - jobCap);
    const jobText = cleanJobText((app.job && app.job.text) || '', jobCap);
    const mem = memoryInput('letter', { jobText, analysis, cv: app.cv, maxTokens: memCap, digest });
    return chatJson({
      ...letterPrompt(app, mem, state.profile, { jobText }), ...base, temperature: 0.65, effort: 'medium', expectedOut: budget.expectedOut, task: 'letter',
      validate: (o) => Array.isArray(o.paragraphs) || typeof o.paragraphs === 'string' || typeof o.body === 'string',
    });
  }, base);
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

async function runHumanizePass(app, fields, scope, hooks = {}) {
  const task = scope === 'cv' ? 'edit-cv' : scope === 'letter' ? 'edit-letter' : 'edit';
  const analysis = app.job && app.job.analysis;
  const fieldsTok = estimateTokens(JSON.stringify(fields));
  const cvRefTok = scope === 'letter' && app.cv ? estimateTokens(compactCv(app.cv)) : 0;
  return runBudgeted(task, ({ budget, scale, digest }) => {
    const memCap = Math.max(600, Math.floor((budget.maxInput - 850 - fieldsTok - cvRefTok) * scale));
    const mem = memoryInput(task, {
      jobText: (app.job && app.job.text) || '', analysis,
      cv: scope === 'letter' ? app.cv : null,
      maxTokens: memCap, digest,
    });
    return chatJson({
      ...humanizePrompt(app, mem, fields, { scope }),
      signal: hooks.signal, onDelta: hooks.onDelta, onStatus: hooks.onStatus,
      temperature: 0.35, effort: 'medium', expectedOut: budget.expectedOut, task: 'edit',
      validate: (o) => o.edits && typeof o.edits === 'object',
    });
  }, hooks);
}

/** The editing pass: fact check + de-AI the wording. Splits into CV and letter passes on tight token budgets. */
export async function humanize(app, hooks = {}) {
  const fields = textFields(app);
  const cvFields = {};
  const letterFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('letter.')) letterFields[k] = v;
    else cvFields[k] = v;
  }
  const hasBoth = Object.keys(cvFields).length > 0 && Object.keys(letterFields).length > 0;
  const cfg = activeConfig();
  const combinedBudget = budgetFor(cfg, learnedLimitFor(cfg), 'edit');
  const fieldsTok = estimateTokens(JSON.stringify(fields));
  const storyTok = estimateTokens(cleanStoryText(state.memory.story));
  const shouldSplit = hasBoth && (combinedBudget.tight || fieldsTok + storyTok + 1100 > combinedBudget.maxInput);

  const runSplit = async () => {
    if (hooks.onStatus) hooks.onStatus('Editing CV (1 of 2)');
    const rCv = await runHumanizePass(app, cvFields, 'cv', hooks);
    if (hooks.onStatus) hooks.onStatus('Editing cover letter (2 of 2)');
    const rLt = await runHumanizePass(app, letterFields, 'letter', hooks);
    return {
      edits: Object.assign({}, rCv.edits, rLt.edits),
      notes: [...new Set([...arr(rCv.notes), ...arr(rLt.notes)].map(str).filter(Boolean))],
    };
  };

  let res;
  if (shouldSplit) {
    res = await runSplit();
  } else {
    try {
      res = await runHumanizePass(app, fields, 'all', hooks);
    } catch (e) {
      if (hasBoth && e && (e.kind === 'too_large' || (e.kind === 'format' && e.truncated))) {
        res = await runSplit();
      } else {
        throw e;
      }
    }
  }

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
  const doc = target === 'cv' ? app.cv : app.letter;
  const task = 'refine-' + target;
  const analysis = app.job && app.job.analysis;
  const docTok = estimateTokens(JSON.stringify(doc));
  const res = await runBudgeted(task, ({ budget, scale, digest }) => {
    const avail = Math.max(900, Math.floor((budget.maxInput - 1100 - docTok) * scale));
    const jobCap = Math.max(350, Math.min(1200, Math.floor(avail * 0.32)));
    const memCap = Math.max(550, avail - jobCap);
    const jobText = cleanJobText((app.job && app.job.text) || '', jobCap);
    const mem = memoryInput(task, { jobText, analysis, cv: target === 'letter' ? app.cv : null, maxTokens: memCap, digest });
    return chatJson({
      ...refinePrompt(app, mem, target, instruction, doc, { jobText }),
      signal: hooks.signal, onDelta: hooks.onDelta, onStatus: hooks.onStatus,
      temperature: 0.5, effort: 'medium', expectedOut: budget.expectedOut, task,
      validate: (o) => (target === 'cv' ? Array.isArray(o.experience) || Array.isArray(o.education) : o.paragraphs != null),
    });
  }, hooks);
  snapshot(app, target === 'cv' ? 'Before CV change' : 'Before letter change');
  if (target === 'cv') app.cv = normalizeCv(res, app);
  else app.letter = normalizeLetter(res, app);
  sanitizeDocs(app);
  return str(res.note);
}

// ---------------------------------------------------------------------------------- interview preparation

export const INTERVIEW_CATEGORIES = {
  motivation: 'Motivation', role: 'The role', experience: 'Your experience', gap: 'Weak spot', practical: 'Practical', behavioural: 'Behaviour',
};

export function normalizeInterview(raw, ctx = {}) {
  const s = (v) => sanitize(str(v), ctx);
  const notes = (v, max) => lines(v).map(s).filter(Boolean).slice(0, max);
  const cat = (v) => {
    const c = str(v).toLowerCase();
    if (/^behav/.test(c)) return 'behavioural';
    return INTERVIEW_CATEGORIES[c] ? c : 'experience';
  };
  return {
    pitch: notes(raw.pitch, 5),
    questions: arr(raw.questions).map((q) => (typeof q === 'string'
      ? { category: 'experience', question: s(q), why: '', points: [] }
      : { category: cat(q && q.category), question: s(q && q.question), why: s(q && q.why), points: notes(q && q.points, 5) }))
      .filter((q) => q.question).slice(0, 14),
    ask: notes(raw.ask, 6),
    watch: notes(raw.watch, 5),
  };
}

/** Predicts the interview for this application and stores the preparation on `app.interview`. */
export async function prepareInterview(app, language, hooks = {}) {
  const lang = language || app.language || 'en';
  const analysis = app.job && app.job.analysis;
  const cfg = activeConfig();
  const combinedBudget = budgetFor(cfg, learnedLimitFor(cfg), 'interview');

  const runPart = (part, existingQuestions = []) => {
    const task = part === 'all' ? 'interview' : `interview-${part}`;
    return runBudgeted(task, ({ budget, scale, digest }) => {
      const letterTok = estimateTokens(((app.letter && app.letter.paragraphs) || []).join('\n'));
      const avail = Math.max(950, Math.floor((budget.maxInput - 1350 - letterTok) * scale));
      const jobCap = Math.max(400, Math.min(1500, Math.floor(avail * 0.35)));
      const memCap = Math.max(550, avail - jobCap);
      const jobText = cleanJobText((app.job && app.job.text) || '', jobCap);
      const mem = memoryInput('interview', { jobText, analysis, maxTokens: memCap, digest });
      return chatJson({
        ...interviewPrompt(app, mem, lang, { jobText, part, existingQuestions }),
        signal: hooks.signal, onDelta: hooks.onDelta, onStatus: hooks.onStatus,
        temperature: 0.5, effort: 'medium', expectedOut: budget.expectedOut, task,
        validate: (o) => Array.isArray(o.questions) && o.questions.length > 0,
      });
    }, hooks);
  };

  const runSplit = async () => {
    if (hooks.onStatus) hooks.onStatus('Preparing interview (part 1 of 2)');
    const p1 = await runPart('part1');
    const seen = arr(p1.questions).map((q) => str(q && (typeof q === 'string' ? q : q.question))).filter(Boolean);
    if (hooks.onStatus) hooks.onStatus('Preparing interview (part 2 of 2)');
    const p2 = await runPart('part2', seen);
    return {
      pitch: arr(p1.pitch),
      questions: [...arr(p1.questions), ...arr(p2.questions)],
      ask: arr(p2.ask),
      watch: arr(p2.watch),
    };
  };

  let res;
  if (combinedBudget.tight) {
    res = await runSplit();
  } else {
    try {
      res = await runPart('all');
    } catch (e) {
      if (e && (e.kind === 'too_large' || (e.kind === 'format' && e.truncated))) res = await runSplit();
      else throw e;
    }
  }

  const prep = normalizeInterview(res, { country: app.country, lang });
  if (!prep.questions.length) throw new AiError('The AI returned no questions. Try again.', { kind: 'format' });
  prep.language = lang;
  prep.generatedAt = new Date().toISOString();
  app.interview = prep;
  return prep;
}

/** The preparation as plain text, for copying into notes or printing. */
export function interviewText(app) {
  const p = app.interview;
  if (!p) return '';
  const out = [`Interview preparation: ${app.title || 'Application'}${app.company ? ' at ' + app.company : ''}`, ''];
  const block = (title, items) => { if (items.length) out.push(title, ...items.map((t) => '- ' + t), ''); };
  block('TELL ME ABOUT YOURSELF', p.pitch);
  out.push('LIKELY QUESTIONS');
  p.questions.forEach((q, i) => {
    out.push(`${i + 1}. ${q.question}`);
    if (q.why) out.push(`   Why they ask: ${q.why}`);
    for (const pt of q.points) out.push('   - ' + pt);
  });
  out.push('');
  block('QUESTIONS YOU CAN ASK', p.ask);
  block('KEEP IN MIND', p.watch);
  return out.join('\n').trim() + '\n';
}

/** Turns raw question/answer pairs in memory into clean standalone facts and known gaps, in safe batches. */
export async function tidyMemory(hooks = {}) {
  const items = state.memory.facts.filter((f) => !f.fact && (f.q || f.a)).map((f) => ({ id: f.id, q: f.q, a: f.a }));
  if (!items.length) return { facts: 0, gaps: 0 };

  const batches = [];
  let cur = [];
  let curTok = 0;
  for (const it of items) {
    const t = estimateTokens(JSON.stringify(it));
    if (cur.length && (cur.length >= 15 || curTok + t > 2200)) {
      batches.push(cur);
      cur = [];
      curTok = 0;
    }
    cur.push(it);
    curTok += t;
  }
  if (cur.length) batches.push(cur);

  let n = 0;
  const gaps = [];
  for (let i = 0; i < batches.length; i++) {
    if (batches.length > 1 && hooks.onStatus) hooks.onStatus(`Tidying notes (${i + 1} of ${batches.length})`);
    const res = await chatJson({
      ...tidyPrompt(batches[i]), signal: hooks.signal, onStatus: hooks.onStatus,
      temperature: 0.2, effort: 'low', expectedOut: 900, task: 'tidy',
      validate: (o) => Array.isArray(o.facts),
    });
    for (const r of arr(res.facts)) {
      const f = state.memory.facts.find((x) => x.id === (r && r.id));
      const text = str(r && r.fact);
      if (f && text) { f.fact = text; n++; }
    }
    for (const g of arr(res.gaps).map(str).filter(Boolean)) gaps.push(g);
  }
  return { facts: n, gaps: [...new Set(gaps)] };
}
