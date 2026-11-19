// Token budgeting and fact-preserving context compaction for the AI pipeline.
// Cuts wasted tokens (UI chrome, duplicate pasted CVs, irrelevant profile PII, cross-stage
// repetition) while strictly keeping every verified fact, known gap, number, date and tool.

const EXPECTED_OUT = {
  analysis: 1050,
  cv: 1550,
  letter: 850,
  edit: 950,
  'edit-cv': 650,
  'edit-letter': 450,
  'refine-cv': 1550,
  'refine-letter': 850,
  interview: 2200,
  'interview-part1': 1150,
  'interview-part2': 1150,
  digest: 1100,
  tidy: 900,
};

const PROVIDER_CEIL = {
  groq: 8000,
  ollama: 14000,
  custom: 14000,
  mistral: 16000,
  gemini: 32000,
  openai: 32000,
  anthropic: 32000,
  mock: 32000,
};

/**
 * Conservative token estimator calibrated for BPE tokenizers on multilingual European text and JSON.
 * Slightly over-estimates (~5-10%) on purpose so tight providers such as Groq 8k TPM stay safe.
 */
export function estimateTokens(text) {
  const s = String(text || '');
  if (!s) return 0;
  const nonAscii = (s.match(/[^\x00-\x7F]/g) || []).length;
  const punct = (s.match(/[{}[\]":,;]/g) || []).length;
  return Math.ceil((s.length + nonAscii * 0.6 + punct * 0.4) / 3.4);
}

/** Deterministic 64-bit hex fingerprint (dual FNV-1a) for caching story digests. */
export function hashText(text) {
  const s = String(text || '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Returns { maxTotal, maxInput, expectedOut, tight } for the active provider/model and task.
 * When the server has revealed a real token limit (via headers or a 413/429 message), that limit wins.
 */
export function budgetFor(cfg, learnedLimit = 0, task = 'cv') {
  const id = (cfg && cfg.id) || '';
  const model = (cfg && cfg.model) || '';
  const expectedOut = EXPECTED_OUT[task] || 1100;
  let baseTotal = PROVIDER_CEIL[id] || 16000;
  if (id === 'openrouter') baseTotal = /:free\b/i.test(model) ? 12000 : 28000;
  const maxTotal = learnedLimit > 0
    ? Math.min(32000, Math.max(3500, Math.floor(learnedLimit * 0.94)))
    : baseTotal;
  const safety = Math.min(400, Math.max(200, Math.round(maxTotal * 0.04)));
  const maxInput = Math.max(1800, maxTotal - expectedOut - safety);
  return { maxTotal, maxInput, expectedOut, tight: maxTotal <= 12000 };
}

// ---------------------------------------------------------------------------------- text primitives

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function wordSet(s) {
  const out = new Set();
  for (const w of norm(s).split(' ')) if (w.length >= 3) out.add(w);
  return out;
}

/** Extracts factual anchors (numbers, dates, percentages, acronyms, §-refs) that must never be dropped silently. */
function factAnchors(s) {
  const out = new Set();
  const str = String(s || '');
  for (const m of str.matchAll(/§?\d+(?:[.,/:-]\d+)*%?/g)) out.add(m[0].toLowerCase());
  for (const m of str.matchAll(/\b[A-ZÄÖÜ]{2,}(?:\/[A-ZÄÖÜ0-9]+)?\b/g)) {
    if (!/^(CV|PDF|URL|FAQ|WWW|HTTP|HTTPS)$/.test(m[0])) out.add(m[0]);
  }
  return out;
}

function overlapRatio(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let hits = 0;
  for (const w of aSet) if (bSet.has(w)) hits++;
  return hits / Math.min(aSet.size, bSet.size);
}

function hasNewAnchor(anchors, seenAnchors) {
  for (const a of anchors) if (!seenAnchors.has(a)) return true;
  return false;
}

function normalizeWhitespace(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sliceToTokens(text, maxTokens) {
  const s = String(text || '').trim();
  if (!maxTokens || estimateTokens(s) <= maxTokens) return s;
  const maxChars = Math.max(120, Math.floor(maxTokens * 3.1));
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const nl = cut.lastIndexOf('\n');
  const dot = cut.lastIndexOf('. ');
  const idx = Math.max(nl, dot > maxChars * 0.65 ? dot + 1 : -1);
  return (idx > maxChars * 0.5 ? cut.slice(0, idx) : cut).trim();
}

// ---------------------------------------------------------------------------------- job posting cleanup

const JOB_CHROME_LINE = /^(?:apply(?:\s+now|\s+easily|\s+on\s+company\s+site)?|easy\s+apply|save(?:\s+job)?|saved|share(?:\s+job)?|print|report(?:\s+this\s+job)?|back\s+to\s+search|show\s+(?:more|less)|see\s+(?:more|less)|sign\s+in|log\s+in|register|create\s+job\s+alert|skip\s+to\s+(?:main\s+)?content|accept\s+all\s+cookies|cookie\s+(?:settings|policy)|privacy\s+policy|jetzt\s+bewerben|schnellbewerbung|merken|teilen|drucken|stelle\s+melden|zurück\s+zur\s+suche|mehr\s+anzeigen|weniger\s+anzeigen|datenschutz(?:hinweis)?|impressum|candidatar-se|salvar\s+vaga|compartilhar|postuler|enregistrer\s+l'offre|partager)$/i;

const JOB_HIGH = /\b(?:responsibilit|task|duties|what\s+you(?:'ll|\s+will)\s+do|your\s+role|requirement|qualification|what\s+you\s+bring|skills?|must\s+have|nice\s+to\s+have|profile|experience|education|language|salary|compensation|hours?|start\s+date|contract|working\s+student|intern|full[- ]?time|part[- ]?time|hybrid|remote|location|contact|reference|job\s+id|aufgaben|dein\s+profil|ihr\s+profil|anforderungen|voraussetzungen|qualifikationen|was\s+du\s+mitbringst|was\s+sie\s+mitbringen|werkstudent|praktikum|vollzeit|teilzeit|stunden|eintritt|ansprechpartner|kontakt|referenz|standort|requisitos|atividades|responsabilidades|qualificações|missions|profil\s+recherché|compétences)\b/i;

const JOB_BOILERPLATE = /\b(?:equal\s+(?:employment\s+)?opportunity|without\s+regard\s+to\s+race|protected\s+veteran|all\s+qualified\s+applicants|affirmative\s+action|disability\s+accommodation|cookie\s+(?:policy|notice|settings)|privacy\s+(?:notice|policy)|datenschutzerklärung|datenschutzhinweis|free\s+fruit|fresh\s+fruit|obstkorb|kicker|tischkicker|foosball|coffee\s+and\s+tea|company\s+bike|jobrad|urban\s+sports|corporate\s+benefits|wellpass|gym\s+membership)\b/i;

const JOB_CONTACT = /(?:@|tel\.?|phone|ansprechpartner|contact|referenz|ref\.?\s*[:#]|job\s*id|\b\d{4,5}\s+[A-ZÄÖÜ])/i;

/**
 * Removes scraped job-board UI chrome, repeated paragraphs, and pure EEO/privacy/perks boilerplate
 * from a posting. If `maxTokens` is given and the posting still exceeds it, keeps title/contact/
 * tasks/requirements in original order.
 */
export function cleanJobText(raw, maxTokens = 0) {
  let text = normalizeWhitespace(raw);
  if (!text) return '';

  // Strip standalone navigation/button lines and decorative rules.
  const lines = text.split('\n').filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^[-_=•*·~]{4,}$/.test(t)) return false;
    if (t.length <= 45 && JOB_CHROME_LINE.test(t)) return false;
    return true;
  });
  text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Deduplicate exact repeated blocks (common when job boards echo title/apply blocks).
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const seen = new Set();
  const uniq = [];
  for (const b of blocks) {
    const key = norm(b);
    if (!key || (key.length > 25 && seen.has(key))) continue;
    seen.add(key);
    uniq.push(b);
  }
  // Drop pure legal/EEO/privacy/generic-perks blocks unless they carry role, contract, or contact signal.
  const filtered = uniq.length > 2
    ? uniq.filter((b, i) => i === 0 || !JOB_BOILERPLATE.test(b) || JOB_HIGH.test(b) || JOB_CONTACT.test(b))
    : uniq;
  const kept = filtered.length ? filtered : uniq;
  const joined = kept.join('\n\n');
  if (!maxTokens || estimateTokens(joined) <= maxTokens) return joined;

  // Rank blocks: always keep block 0 (header/title/company/meta); prioritise tasks/requirements/contact.
  const scored = kept.map((b, i) => {
    const tok = estimateTokens(b);
    let score = 0;
    if (i === 0) score += 100;
    else if (i === 1 && tok < 120) score += 15;
    if (JOB_HIGH.test(b)) score += 10;
    if (JOB_CONTACT.test(b)) score += 9;
    if (/^\s*[-•*]\s/m.test(b)) score += 4;
    if (JOB_BOILERPLATE.test(b)) score -= 12;
    if (i > kept.length * 0.7 && !JOB_HIGH.test(b)) score -= 3;
    return { i, b, tok, score };
  });

  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  const picked = [];
  let used = 0;
  for (const item of scored) {
    if (used + item.tok <= maxTokens) {
      picked.push(item);
      used += item.tok;
    } else if (item.i === 0 && !picked.length) {
      picked.push({ ...item, b: sliceToTokens(item.b, maxTokens) });
      used = maxTokens;
      break;
    } else if (maxTokens - used >= 90 && item.score >= 8) {
      const cut = sliceToTokens(item.b, maxTokens - used);
      if (cut) { picked.push({ ...item, b: cut }); used = maxTokens; }
      break;
    }
  }
  picked.sort((a, b) => a.i - b.i);
  return picked.map((x) => x.b).join('\n\n');
}

// ---------------------------------------------------------------------------------- candidate story cleanup

const PAGE_MARKER = /^(?:page|seite|página|pagina)\s+\d+(?:\s*(?:of|von|de|\/)\s*\d+)?$/i;
const OLD_LETTER_NOISE = /^(?:sehr\s+geehrte|dear\s+(?:sir|madam|hiring|mr|ms|mrs)|prezad[oa]s?|madame,\s*monsieur|estimad[oa]s?|mit\s+freundlichen\s+grüßen|freundliche\s+grüsse|kind\s+regards|best\s+regards|yours\s+(?:sincerely|faithfully)|sincerely|atenciosamente|cordialmente|je\s+vous\s+prie\s+d'agréer|anlagen\s*:|enclosures\s*:)/i;

/**
 * Lossless cleanup + fact-safe deduplication of raw candidate story text.
 * Candidates often paste 2-3 older CVs or cover letters into memory.md; this strips repeated
 * lines/blocks ONLY when the later copy adds no new number, date, percentage or tool acronym.
 */
export function cleanStoryText(raw) {
  const text = normalizeWhitespace(raw);
  if (!text) return '';

  const rawLines = text.split('\n');
  const out = [];
  const seenExact = new Set();
  const seenBlocks = []; // { words: Set, anchors: Set, norm: string }

  for (const line of rawLines) {
    const t = line.trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (/^[-_=•*·~#]{4,}$/.test(t) && !/^#{1,3}\s+\S/.test(t)) continue;
    if (PAGE_MARKER.test(t)) continue;

    const k = norm(t);
    if (!k) continue;
    if (k.length >= 16 && seenExact.has(k)) continue;

    const words = wordSet(t);
    const anchors = factAnchors(t);

    // Near-duplicate check: only drop if >= 88% word overlap AND zero new factual anchors.
    let dup = false;
    if (words.size >= 5) {
      for (const prev of seenBlocks) {
        if (Math.abs(prev.words.size - words.size) > Math.max(4, words.size * 0.45)) continue;
        if (overlapRatio(words, prev.words) >= 0.88 && !hasNewAnchor(anchors, prev.anchors)) {
          dup = true;
          break;
        }
      }
    }
    if (dup) continue;

    seenExact.add(k);
    if (words.size >= 5) seenBlocks.push({ words, anchors });
    out.push(t);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Splits a long story into chunks of at most `maxChunkTokens` along natural heading/paragraph boundaries. */
export function splitStoryChunks(text, maxChunkTokens = 2600) {
  const clean = cleanStoryText(text);
  if (!clean) return [];
  if (estimateTokens(clean) <= maxChunkTokens) return [clean];

  const blocks = clean.split(/\n{2,}/).filter(Boolean);
  const chunks = [];
  let cur = [];
  let curTok = 0;

  const flush = () => {
    if (cur.length) { chunks.push(cur.join('\n\n')); cur = []; curTok = 0; }
  };

  for (const b of blocks) {
    const t = estimateTokens(b);
    if (t > maxChunkTokens) {
      flush();
      // Split an oversized single block line-by-line so nothing is truncated mid-fact.
      let lineBuf = [];
      let lineTok = 0;
      for (const ln of b.split('\n')) {
        const lt = estimateTokens(ln);
        if (lineBuf.length && lineTok + lt > maxChunkTokens) {
          chunks.push(lineBuf.join('\n'));
          lineBuf = [];
          lineTok = 0;
        }
        lineBuf.push(ln);
        lineTok += lt;
      }
      if (lineBuf.length) chunks.push(lineBuf.join('\n'));
      continue;
    }
    if (cur.length && curTok + t > maxChunkTokens) flush();
    cur.push(b);
    curTok += t;
  }
  flush();
  return chunks;
}

// ---------------------------------------------------------------------------------- task-aware memory compaction

const TIMELINE_LINE = /(?:\b(?:19|20)\d{2}\b|present|heute|aktuell|b\.?\s?sc|m\.?\s?sc|b\.?\s?a\.|m\.?\s?a\.|mba|ph\.?d|bachelor|master|diplom|abitur|ausbildung|universit|hochschule|gmbh|ag\b|inc\.|ltd\.|ltda|s\.a\.|c1|c2|b1|b2|a1|a2|native|muttersprache|fluent|permit|visa|aufenthg|available|verfügbar|start\s+date|stunden|hours)/i;

function jobTerms(jobText, analysis) {
  const terms = new Set();
  if (analysis) {
    for (const k of analysis.keywords || []) for (const w of norm(k).split(' ')) if (w.length >= 2) terms.add(w);
    for (const r of analysis.requirements || []) for (const w of norm(r.text).split(' ')) if (w.length >= 3) terms.add(w);
    if (analysis.job) {
      for (const w of norm([analysis.job.title, analysis.job.company, analysis.job.contract].join(' ')).split(' ')) {
        if (w.length >= 3) terms.add(w);
      }
    }
  }
  if (jobText) {
    for (const w of norm(jobText).split(' ')) if (w.length >= 4) terms.add(w);
  }
  return terms;
}

function cvLineIndex(cv) {
  const rows = [];
  if (!cv) return rows;
  const push = (s) => {
    const words = wordSet(s);
    if (words.size >= 4) rows.push({ words, anchors: factAnchors(s) });
  };
  push(cv.headline);
  push(cv.summary);
  for (const e of cv.experience || []) {
    push(`${e.role || ''} ${e.company || ''} ${e.start || ''} ${e.end || ''}`);
    for (const b of e.bullets || []) push(b);
  }
  for (const e of cv.education || []) {
    push(`${e.degree || ''} ${e.institution || ''} ${e.start || ''} ${e.end || ''}`);
    for (const d of e.details || []) push(d);
  }
  for (const s of cv.skills || []) push(`${s.label || ''} ${s.items || ''}`);
  for (const x of cv.extras || []) push(`${x.label || ''} ${x.text || ''}`);
  return rows;
}

/** Strips lines from story that are already stated in `cv` without adding any new number/tool. */
function stripCvDuplicates(story, cv) {
  const cvRows = cvLineIndex(cv);
  if (!cvRows.length) return story;
  const out = [];
  for (const line of story.split('\n')) {
    const t = line.trim();
    if (!t) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const words = wordSet(t);
    const anchors = factAnchors(t);
    let covered = false;
    if (words.size >= 4) {
      for (const row of cvRows) {
        if (overlapRatio(words, row.words) >= 0.82 && !hasNewAnchor(anchors, row.anchors)) {
          covered = true;
          break;
        }
      }
    }
    if (!covered) out.push(t);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Packs a cleaned story into `maxTokens`:
 * 1. Demotes greetings/closings from old cover letters addressed to other employers.
 * 2. Pins timeline/credential lines (dates, employers, degrees, languages, permits) so no position is lost.
 * 3. Fills remaining budget with highest job-relevance blocks in original reading order.
 */
function packStory(story, maxTokens, terms) {
  if (!story) return '(empty)';
  if (!maxTokens || estimateTokens(story) <= maxTokens) return story;

  // Drop pure greeting/closing lines from old cover letters first.
  const filtered = story.split('\n').filter((ln) => !OLD_LETTER_NOISE.test(ln.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (estimateTokens(filtered) <= maxTokens) return filtered;

  // Group into logical lines/units while preserving headings & bullet ownership.
  const units = filtered.split(/\n{2,}/).flatMap((blk) => {
    if (estimateTokens(blk) <= Math.max(180, maxTokens * 0.25)) return [blk];
    return blk.split('\n').filter(Boolean);
  });

  const scored = units.map((u, i) => {
    const tok = estimateTokens(u);
    const words = wordSet(u);
    const anchors = factAnchors(u);
    let hits = 0;
    for (const w of words) if (terms.has(w)) hits++;
    const pinned = TIMELINE_LINE.test(u) || /^#{1,3}\s/.test(u);
    let score = hits * 3 + Math.min(anchors.size, 4) * 2 + (pinned ? 6 : 0);
    if (u.length < 180 && /^[-•*]/.test(u.trim())) score += 2;
    return { i, u, tok, score, pinned };
  });

  // Always reserve space for pinned timeline items first (up to 65% of budget), then highest-scoring details.
  const picked = new Map();
  let used = 0;
  const tryTake = (item, limit) => {
    if (picked.has(item.i)) return false;
    if (used + item.tok <= limit) {
      picked.set(item.i, item.u);
      used += item.tok;
      return true;
    }
    return false;
  };

  const timelineCap = Math.floor(maxTokens * 0.65);
  for (const item of scored) {
    if (item.pinned) tryTake(item, timelineCap);
  }
  const byScore = [...scored].sort((a, b) => (b.score - a.score) || (a.i - b.i));
  for (const item of byScore) {
    if (!tryTake(item, maxTokens) && maxTokens - used >= 70 && !picked.has(item.i)) {
      const cut = sliceToTokens(item.u, maxTokens - used);
      if (cut) { picked.set(item.i, cut); used = maxTokens; break; }
    }
  }

  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, u]) => u).join('\n');
}

/**
 * Builds a compact, task-focused CANDIDATE MATERIAL block.
 * - Drops contact PII the AI never outputs (email, phone, street, birthDate, URLs) because render.js
 *   and docx.js inject them directly from profile.
 * - Preserves KNOWN GAPS and VERIFIED FACTS with top priority.
 * - Uses a cached distilled `digest` when provided for very large stories.
 * - Avoids duplicating CV content on cover-letter / letter-edit passes.
 */
export function compactMemory(src, opts = {}) {
  const { profile = {}, story = '', facts = [], gaps = [] } = src || {};
  const { task = 'cv', jobText = '', analysis = null, maxTokens = 0, digest = '', cv = null, includeContact = false } = opts;

  // 1. Personal details: only fields that affect AI writing/truthfulness.
  const profLines = ['PERSONAL DETAILS'];
  const add = (k, v) => { if (v && String(v).trim()) profLines.push(`${k}: ${String(v).trim()}`); };
  add('Name', profile.fullName);
  add('Current headline', profile.headline);
  add('Location', profile.location);
  add('Nationality', profile.nationality);
  add('Work permit / visa', profile.workPermit);
  add('Languages', profile.languages);
  if (includeContact) {
    add('Address', [profile.street, profile.postalCity].filter(Boolean).join(', '));
    add('Email', profile.email);
    add('Phone', profile.phone);
  }
  const profSection = profLines.join('\n');

  // 2. Known gaps: NEVER trimmed (Ground Rule #2).
  const gapsSection = gaps.length
    ? 'KNOWN GAPS (the candidate does NOT have these; never claim them and do not ask about them again)\n'
      + gaps.map((g) => '- ' + String(g).trim()).filter((g) => g.length > 2).join('\n')
    : '';

  // 3. Verified facts: kept in full unless truly massive.
  const factLines = [];
  for (const f of facts) {
    if (f && f.fact) factLines.push('- ' + String(f.fact).trim());
    else if (f && (f.q || f.a)) factLines.push(`- Asked: "${String(f.q || '').trim()}" Candidate answered: "${String(f.a || '').trim()}"`);
  }

  const fixedTok = estimateTokens(profSection) + estimateTokens(gapsSection) + 45;
  const terms = jobTerms(jobText, analysis);

  let factsSection = '';
  if (factLines.length) {
    const fullFacts = 'VERIFIED FACTS THE CANDIDATE CONFIRMED IN EARLIER APPLICATIONS\n' + factLines.join('\n');
    const factCap = maxTokens ? Math.max(350, Math.floor((maxTokens - fixedTok) * 0.45)) : 0;
    if (!factCap || estimateTokens(fullFacts) <= factCap) {
      factsSection = fullFacts;
    } else {
      // Keep the most recent facts + most job-relevant earlier facts.
      const ranked = factLines.map((ln, i) => {
        let hits = 0;
        for (const w of wordSet(ln)) if (terms.has(w)) hits++;
        const recency = i >= factLines.length - 8 ? 5 : 0;
        return { i, ln, tok: estimateTokens(ln), score: hits * 3 + recency };
      });
      ranked.sort((a, b) => (b.score - a.score) || (b.i - a.i));
      const kept = [];
      let used = 25;
      for (const r of ranked) {
        if (used + r.tok <= factCap) { kept.push(r); used += r.tok; }
      }
      kept.sort((a, b) => a.i - b.i);
      factsSection = 'VERIFIED FACTS THE CANDIDATE CONFIRMED IN EARLIER APPLICATIONS\n' + kept.map((k) => k.ln).join('\n');
    }
  }

  // 4. Career story: prefer digest when provided; clean/deduplicate; drop CV duplicates on letter passes.
  let baseStory = digest ? normalizeWhitespace(digest) : cleanStoryText(story);
  const isLetterPass = (task === 'letter' || task === 'edit-letter' || task === 'refine-letter') && cv;
  const storyHeader = digest
    ? 'CAREER BACKGROUND (distilled factual summary of the candidate\'s material)'
    : isLetterPass
      ? 'ADDITIONAL CAREER DETAILS (beyond the CV above; may contain old applications to other employers)'
      : 'CAREER STORY AND EARLIER DOCUMENTS (raw material; may contain old applications addressed to other employers)';

  const usedSoFar = fixedTok + estimateTokens(factsSection);
  const storyCap = maxTokens ? Math.max(450, maxTokens - usedSoFar) : 0;

  if (isLetterPass && baseStory) {
    const trimmedVsCv = stripCvDuplicates(baseStory, cv);
    // Use CV-deduped story whenever the raw story doesn't trivially fit or when it saves meaningful tokens.
    if (trimmedVsCv && (storyCap && estimateTokens(baseStory) > storyCap * 0.7 || estimateTokens(baseStory) - estimateTokens(trimmedVsCv) > 120)) {
      baseStory = trimmedVsCv;
    }
  }

  const finalStory = baseStory ? packStory(baseStory, storyCap, terms) : '(empty)';
  const parts = [profSection, `${storyHeader}\n${finalStory}`];
  if (factsSection) parts.push(factsSection);
  if (gapsSection) parts.push(gapsSection);
  return parts.join('\n\n');
}
