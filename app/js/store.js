// Data layer. Everything lives in plain files inside the data folder:
//   settings.json      preferences and the chosen AI engine (API keys are NOT here; the host encrypts them)
//   profile.json       personal details
//   photo.jpg          portrait
//   memory.md          career story, verified facts and known gaps (human readable, the AI reads it too)
//   applications/*.json one file per application + index.json
import { store as disk, secrets, app as hostApp } from './host.js';
import { uid, isoDate, clone } from './util.js';
import { normalizeLang } from './doclang.js';
import { PROVIDERS } from './ai/providers.js';

export const state = {
  info: { version: '', dev: false, dataDir: '', downloadsDir: '' },
  settings: null,
  profile: null,
  photo: '',
  memory: { story: '', facts: [], gaps: [] },
  apps: [],
  migrated: null,
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = (what) => { for (const fn of [...subs]) { try { fn(what); } catch (e) { console.error(e); } } };

export function defaultSettings() {
  return {
    version: 2,
    onboarded: false,
    theme: 'system',
    ai: { provider: '', models: {}, endpoints: { ollama: 'http://127.0.0.1:11434', custom: 'http://127.0.0.1:1234/v1' }, humanize: true },
    docs: { palette: 'navy', font: 'calibri', density: 'normal', enDash: false },
    memory: { autoSave: true },
    export: { lastDir: '' },
  };
}

export function defaultProfile() {
  return { fullName: '', headline: '', email: '', phone: '', street: '', postalCity: '', location: '', nationality: '', workPermit: '', birthDate: '', linkedin: '', website: '', languages: '' };
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') merge(base[k], v);
    else base[k] = v;
  }
  return base;
}

// ---------------------------------------------------------------------------------- start-up

export async function init() {
  state.info = await hostApp.info();
  const hasSettings = await disk.exists('settings.json');
  if (!hasSettings) {
    const legacy = await disk.readJson('profile.json', null);
    if (legacy && ('setupCompleted' in legacy || 'aiProvider' in legacy || 'title' in legacy)) {
      state.migrated = await migrateV1(legacy);
    }
  }
  state.settings = merge(defaultSettings(), await disk.readJson('settings.json', {}));
  state.profile = merge(defaultProfile(), await disk.readJson('profile.json', {}));
  const pb = await disk.readBinary('photo.jpg');
  state.photo = pb ? 'data:image/jpeg;base64,' + pb : '';
  await reloadMemory();
  await loadIndex();
}

export async function saveSettings() {
  await disk.writeJson('settings.json', state.settings);
  emit('settings');
}

export async function saveProfile() {
  await disk.writeJson('profile.json', state.profile);
  await saveMemory();
  emit('profile');
}

export async function setPhoto(dataUrl) {
  state.photo = dataUrl || '';
  if (dataUrl) await disk.writeBinary('photo.jpg', dataUrl.slice(dataUrl.indexOf(',') + 1));
  else await disk.remove('photo.jpg');
  emit('photo');
}

// ---------------------------------------------------------------------------------- memory.md

const SECTION = { profile: 'Profile', story: 'Career story', facts: 'Verified facts', gaps: 'Known gaps' };
const LEGACY_SECTION = {
  'personal & contact information': 'profile',
  'base cv & natural language career story': 'story',
  'verified career facts & q&a discoveries': 'facts',
};
let lastMemoryText = null;

function sectionKey(title) {
  const t = title.trim().toLowerCase();
  for (const [k, v] of Object.entries(SECTION)) if (t === v.toLowerCase()) return k;
  return LEGACY_SECTION[t] || null;
}

export function parseMemory(md) {
  const out = { story: '', facts: [], gaps: [] };
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const buckets = { profile: [], story: [], facts: [], gaps: [] };
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    const key = m ? sectionKey(m[1]) : null;
    if (key) { cur = key; continue; }
    if (cur) buckets[cur].push(line);
  }
  out.story = buckets.story.join('\n').trim();

  let group = { label: '', date: '' };
  let item = null;
  const flush = () => {
    if (!item) return;
    const f = parseFactItem(item.raw);
    if (f.fact || f.q || f.a) out.facts.push({ id: uid('f'), label: group.label, date: group.date, n: item.n, ...f });
    item = null;
  };
  for (const line of buckets.facts) {
    const hm = /^###\s+(.+?)\s*$/.exec(line);
    if (hm) {
      flush();
      let label = hm[1].replace(/^Added from Application:\s*/i, '').replace(/^Added on\s*/i, '');
      let date = '';
      const dm = /\(?(\d{4}-\d{2}-\d{2})\)?\s*$/.exec(label);
      if (dm) { date = dm[1]; label = label.slice(0, dm.index).trim(); }
      group = { label: label.replace(/[\s·-]+$/, ''), date };
      continue;
    }
    const im = /^\s*(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line);
    if (im && !/^\s{2,}/.test(line)) {
      flush();
      item = { raw: im[2], n: im[1] ? +im[1] : 0 };
      continue;
    }
    if (item && line.trim()) item.raw += '\n' + line.trim();
    else if (!item && line.trim() && !line.trim().startsWith('>')) item = { raw: line.trim(), n: 0 };
  }
  flush();

  for (const line of buckets.gaps) {
    const g = line.replace(/^\s*[-*]\s+/, '').trim();
    if (g && !g.startsWith('>')) out.gaps.push(g);
  }
  return out;
}

function parseFactItem(raw) {
  const parts = String(raw).split(/\*\*(Fact|Q|A|Context|Answer|Note|Additional Note):\*\*/i);
  const o = { fact: '', q: '', a: '' };
  if (parts.length === 1) { o.fact = raw.trim(); return o; }
  for (let i = 1; i < parts.length; i += 2) {
    const tag = parts[i].toLowerCase();
    const val = (parts[i + 1] || '').replace(/\s*\n\s*/g, ' ').trim();
    if (!val) continue;
    if (tag === 'q' || tag === 'context') o.q = val;
    else if (tag === 'a' || tag === 'answer') o.a = val;
    else o.fact = o.fact ? o.fact + ' ' + val : val;
  }
  return o;
}

export function serializeMemory() {
  const p = state.profile || {};
  const row = (k, v) => (v ? `- ${k}: ${v}\n` : '');
  let md = '# JobMech memory\n\n';
  md += '> JobMech reads this file for every application, so you never have to explain yourself twice.\n';
  md += '> You can edit it here or inside the app (Memory). Keep the "##" headings as they are.\n\n';
  md += `## ${SECTION.profile}\n`;
  md += row('Name', p.fullName) + row('Headline', p.headline) + row('Email', p.email) + row('Phone', p.phone)
    + row('Address', [p.street, p.postalCity].filter(Boolean).join(', ')) + row('Location', p.location)
    + row('Nationality', p.nationality) + row('Work permit', p.workPermit) + row('Date of birth', p.birthDate)
    + row('LinkedIn', p.linkedin) + row('Website', p.website) + row('Languages', p.languages);
  md += '\n';
  const story = (state.memory.story || '').trim()
    .replace(/^##(\s+(?:Profile|Career story|Verified facts|Known gaps)\s*)$/gim, '###$1');
  md += `## ${SECTION.story}\n${story}\n\n`;
  md += `## ${SECTION.facts}\n`;
  let lastKey = null;
  for (const f of state.memory.facts) {
    const key = (f.label || 'Notes') + '|' + (f.date || '');
    if (key !== lastKey) {
      md += `\n### ${f.label || 'Notes'}${f.date ? ' (' + f.date + ')' : ''}\n`;
      lastKey = key;
    }
    const one = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();
    if (f.q || f.a) {
      const bits = [];
      if (f.fact) bits.push(`**Fact:** ${one(f.fact)}`);
      if (f.q) bits.push(`**Q:** ${one(f.q)}`);
      if (f.a) bits.push(`**A:** ${one(f.a)}`);
      md += '- ' + bits.join('\n  ') + '\n';
    } else {
      md += `- ${one(f.fact)}\n`;
    }
  }
  md += `\n## ${SECTION.gaps}\n`;
  for (const g of state.memory.gaps) md += `- ${String(g).replace(/\s*\n\s*/g, ' ').trim()}\n`;
  return md;
}

export async function reloadMemory() {
  const md = await disk.read('memory.md');
  if (md == null) { state.memory = { story: '', facts: [], gaps: [] }; lastMemoryText = null; return false; }
  if (md === lastMemoryText) return false;
  state.memory = parseMemory(md);
  lastMemoryText = md;
  emit('memory');
  return true;
}

export async function saveMemory() {
  const md = serializeMemory();
  lastMemoryText = md;
  await disk.write('memory.md', md);
  emit('memory');
}

export async function saveRawMemory(md) {
  await disk.write('memory.md', md);
  lastMemoryText = null;
  await reloadMemory();
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** items: [{ fact, q, a }] - skips entries that are already stored. Returns how many were added. */
export function addFacts(label, items) {
  let added = 0;
  const date = isoDate();
  for (const it of items || []) {
    const fact = String(it.fact || '').trim();
    const q = String(it.q || '').trim();
    const a = String(it.a || '').trim();
    if (!fact && !a) continue;
    const key = norm(fact || a);
    if (state.memory.facts.some((f) => norm(f.fact || f.a) === key)) continue;
    state.memory.facts.push({ id: uid('f'), label, date, fact, q, a });
    added++;
  }
  return added;
}

export function addGaps(items) {
  let added = 0;
  for (const g of items || []) {
    const t = String(g || '').trim();
    if (!t) continue;
    if (state.memory.gaps.some((x) => norm(x) === norm(t))) continue;
    state.memory.gaps.push(t);
    added++;
  }
  return added;
}

/** The candidate's whole background as plain text for the AI. */
export function memoryForAi() {
  const p = state.profile;
  const lines = [];
  lines.push('PERSONAL DETAILS');
  const add = (k, v) => { if (v) lines.push(`${k}: ${v}`); };
  add('Name', p.fullName); add('Current headline', p.headline); add('Email', p.email); add('Phone', p.phone);
  add('Street address', p.street); add('Postal code and city', p.postalCity); add('Location', p.location);
  add('Nationality', p.nationality); add('Work permit / visa', p.workPermit); add('Date of birth', p.birthDate);
  add('LinkedIn', p.linkedin); add('Website', p.website); add('Languages', p.languages);
  lines.push('', 'CAREER STORY AND EARLIER DOCUMENTS (raw material; may contain old applications addressed to other employers)');
  lines.push(state.memory.story.trim() || '(empty)');
  if (state.memory.facts.length) {
    lines.push('', 'VERIFIED FACTS THE CANDIDATE CONFIRMED IN EARLIER APPLICATIONS');
    for (const f of state.memory.facts) {
      if (f.fact) lines.push('- ' + f.fact);
      else lines.push(`- Asked: "${f.q}" Candidate answered: "${f.a}"`);
    }
  }
  if (state.memory.gaps.length) {
    lines.push('', 'KNOWN GAPS (the candidate does NOT have these; never claim them and do not ask about them again)');
    for (const g of state.memory.gaps) lines.push('- ' + g);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------- applications

export const STATUSES = [
  { id: 'draft', label: 'Draft', dot: '' },
  { id: 'ready', label: 'Ready to send', dot: 'accent' },
  { id: 'applied', label: 'Applied', dot: 'info' },
  { id: 'interview', label: 'Interview', dot: 'warn' },
  { id: 'offer', label: 'Offer', dot: 'ok' },
  { id: 'rejected', label: 'Rejected', dot: 'bad' },
];
export const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

export function summarize(a) {
  return {
    id: a.id, title: a.title || 'Untitled application', company: a.company || '', location: a.location || '',
    country: a.country || 'XX', language: a.language || 'en', languageName: a.languageName || '',
    status: a.status || 'draft', createdAt: a.createdAt, updatedAt: a.updatedAt || a.createdAt,
    appliedAt: a.appliedAt || '', legacy: !!a.legacy, hasDocs: !!(a.cv && a.letter),
  };
}

async function writeIndex() {
  state.apps.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  await disk.writeJson('applications/index.json', state.apps);
}

async function loadIndex() {
  const files = (await disk.list('applications')).map((f) => f.name).filter((n) => /^app_.+\.json$/.test(n));
  const idx = await disk.readJson('applications/index.json', null);
  const ids = new Set(files.map((n) => n.replace(/\.json$/, '')));
  if (Array.isArray(idx) && idx.length === ids.size && idx.every((s) => ids.has(s.id))) {
    state.apps = idx;
  } else {
    const list = [];
    for (const n of files) {
      const a = await disk.readJson('applications/' + n, null);
      if (a && a.id) list.push(summarize(a));
    }
    state.apps = list;
    await writeIndex();
  }
  state.apps.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
}

export const getApp = (id) => disk.readJson(`applications/${id}.json`, null);

export async function saveApp(app, { touch = true } = {}) {
  if (touch) app.updatedAt = new Date().toISOString();
  await disk.writeJson(`applications/${app.id}.json`, app);
  const s = summarize(app);
  const i = state.apps.findIndex((x) => x.id === app.id);
  if (i >= 0) state.apps[i] = s; else state.apps.unshift(s);
  await writeIndex();
  emit('apps');
}

export async function removeApp(id) {
  await disk.remove(`applications/${id}.json`);
  state.apps = state.apps.filter((x) => x.id !== id);
  await writeIndex();
  emit('apps');
}

export function newApp() {
  const now = new Date().toISOString();
  return {
    id: uid('app'), v: 2, createdAt: now, updatedAt: now,
    title: '', company: '', location: '', country: 'XX', language: 'en', languageName: '',
    status: 'draft', appliedAt: '', notes: '', url: '',
    job: { text: '', analysis: null },
    answers: [], extraNotes: '',
    design: { palette: state.settings.docs.palette, font: state.settings.docs.font, density: state.settings.docs.density, photo: false, signature: true },
    cv: null, letter: null, labels: null, quality: null, history: [], exports: [],
  };
}

// The composer's unfinished work survives closing the window.
export const loadDraft = () => disk.readJson('draft.json', null);
export const saveDraft = (d) => disk.writeJson('draft.json', d);
export const clearDraft = () => disk.remove('draft.json');

// ---------------------------------------------------------------------------------- JobMech 1 -> 2

function splitLanguages(s) {
  return String(s || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.*?)\s*[(:\-]\s*([^()]+?)\)?$/.exec(x);
    return m ? { name: m[1].trim(), level: m[2].trim() } : { name: x, level: '' };
  });
}

function convertApp(o, profile) {
  const lang = normalizeLang(o.docLanguage);
  const name = String(o.name || '');
  const at = name.lastIndexOf(' @ ');
  const created = /^\d{4}-\d{2}-\d{2}$/.test(o.createdAt || '') ? o.createdAt + 'T12:00:00.000Z' : new Date().toISOString();
  const cv = o.cv || {};
  const cl = o.coverLetter || {};
  const answers = [];
  const log = String(o.gapAnswers || '');
  (o.gapQuestions || []).forEach((q, i) => {
    const m = new RegExp(`A${i + 1}:\\s*([\\s\\S]*?)(?=\\n\\nQ\\d+:|\\n\\nAdditional Notes:|$)`).exec(log);
    let a = m ? m[1].trim() : '';
    const skipped = /\[Skipped/i.test(a) || !a;
    a = a.replace(/\s*\[Skipped[^\]]*\]\s*/gi, '').trim();
    answers.push({ id: 'q' + (i + 1), q, why: '', a, state: skipped ? (a ? 'none' : 'skipped') : 'answered' });
  });
  const recipient = String(cl.recipientBlock || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return {
    id: o.id || uid('app'), v: 2, legacy: true, createdAt: created, updatedAt: created,
    title: (o.role || (at > 0 ? name.slice(0, at) : name) || 'Application').trim(),
    company: (o.company || (at > 0 ? name.slice(at + 3) : '')).trim(),
    location: '', country: o.countryCode || 'XX', language: lang.code, languageName: lang.code === 'other' ? lang.name : '',
    status: 'ready', appliedAt: '', notes: '', url: '',
    job: { text: o.jobPosting || '', analysis: null },
    answers, extraNotes: '',
    design: { palette: o.palette || 'navy', font: 'calibri', density: 'normal', photo: !!o.includePhoto, signature: true },
    cv: {
      headline: cv.headline || '', summary: cv.summary || '',
      experience: (cv.experience || []).map((e) => ({ role: e.role || '', company: e.company || '', location: e.location || '', period: e.period || '', bullets: (e.bullets || []).filter(Boolean) })),
      education: (cv.education || []).map((e) => ({ degree: e.degree || '', institution: e.institution || '', location: '', period: e.period || '', details: e.details ? [e.details] : [] })),
      skills: (cv.skills || []).length ? [{ label: '', items: (cv.skills || []).join(', ') }] : [],
      languages: splitLanguages(profile.languages),
      certifications: [], projects: [],
      extras: cv.additionalInfo ? [{ label: '', text: cv.additionalInfo }] : [],
    },
    letter: {
      recipient, subject: cl.subjectLine || '', salutation: cl.salutation || '',
      paragraphs: (cl.paragraphs || []).filter(Boolean), closing: String(cl.signOff || '').replace(/,\s*$/, ''), enclosures: '',
    },
    labels: null, quality: null, history: [], exports: [],
  };
}

async function migrateV1(old) {
  const report = { apps: 0, facts: 0, key: false, photo: false };
  // keep the originals (without the API key) before touching anything
  const scrubbed = Object.assign({}, old, { apiKey: '' });
  await disk.writeJson('backup-v1/profile.json', scrubbed);
  for (const f of ['memory.md', 'applications.json', 'photo.txt']) {
    const t = await disk.read(f);
    if (t != null) await disk.write('backup-v1/' + f, t);
  }

  // settings + API key (moves into the encrypted store)
  const s = defaultSettings();
  s.onboarded = !!old.setupCompleted;
  s.memory.autoSave = old.autoSaveMemory !== false;
  if (old.preferredPalette) s.docs.palette = old.preferredPalette;
  let prov = String(old.aiProvider || '').toLowerCase();
  if (prov === 'lmstudio') prov = 'custom';
  if (PROVIDERS[prov]) {
    s.ai.provider = prov;
    if (old.aiModel) s.ai.models[prov] = old.aiModel;
    if (old.customEndpoint && prov === 'ollama') s.ai.endpoints.ollama = String(old.customEndpoint).replace(/\/+$/, '');
    if (old.apiKey && PROVIDERS[prov].host) {
      await secrets.set(prov, old.apiKey, PROVIDERS[prov].host);
      report.key = true;
    }
  }
  await disk.writeJson('settings.json', s);

  // profile
  const p = defaultProfile();
  p.fullName = old.fullName || ''; p.headline = old.title || ''; p.email = old.email || ''; p.phone = old.phone || '';
  p.location = old.location || ''; p.linkedin = old.linkedin || ''; p.website = old.portfolio || '';
  p.languages = old.languages || ''; p.birthDate = old.birthDate || '';
  const nat = String(old.nationality || '');
  const cut = nat.indexOf('/');
  if (cut > 0) { p.nationality = nat.slice(0, cut).trim(); p.workPermit = nat.slice(cut + 1).trim(); } else p.nationality = nat.trim();
  await disk.writeJson('profile.json', p);
  state.profile = p;

  // photo: data URL in a text file -> real image file
  const photoTxt = await disk.read('photo.txt');
  if (photoTxt && photoTxt.includes('base64,')) {
    await disk.writeBinary('photo.jpg', photoTxt.slice(photoTxt.indexOf('base64,') + 7).trim());
    report.photo = true;
  }
  await disk.remove('photo.txt');

  // applications
  const oldApps = (await disk.readJson('applications.json', [])) || [];
  const converted = [];
  for (const o of oldApps) {
    try {
      const a = convertApp(o, p);
      await disk.writeJson(`applications/${a.id}.json`, a);
      converted.push(a);
    } catch (e) { console.error('Could not convert application', e); }
  }
  report.apps = converted.length;
  await disk.remove('applications.json');
  await disk.remove('.port');

  // memory: same content, new layout; orphan answers get their question back from the old applications
  const md = await disk.read('memory.md');
  const mem = parseMemory(md || '');
  for (const f of mem.facts) {
    if (!f.q && f.n > 0) {
      const src = oldApps.find((o) => String(o.name || '').trim() === String(f.label || '').trim());
      const q = src && Array.isArray(src.gapQuestions) ? src.gapQuestions[f.n - 1] : '';
      if (q) { f.q = q; f.a = f.fact; f.fact = ''; }
    }
    delete f.n;
  }
  state.memory = mem;
  report.facts = mem.facts.length;
  await disk.write('memory.md', serializeMemory());
  return report;
}
