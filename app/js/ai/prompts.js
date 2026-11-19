// The instructions given to the AI. Everything that makes the documents truthful, market-specific
// and human-sounding lives here, in plain language, so it can be tuned without touching code.
import { country, marketBrief } from '../countries.js';
import { langName, LABEL_KEYS, englishLabels } from '../doclang.js';
import { isoDate } from '../util.js';

export function languageDirective(app) {
  const ct = country(app.country);
  const code = app.language || 'en';
  if (code === 'en') {
    if (ct.english === 'us') return 'American English';
    if (ct.english === 'uk') return 'British English';
    return 'clear international English with British spelling';
  }
  if (code === 'de') {
    if (ct.code === 'CH') return 'German in Swiss standard spelling (always "ss", never "ß")';
    if (ct.code === 'AT') return 'German (Austrian standard)';
    return 'German';
  }
  if (code === 'pt') return ct.code === 'PT' ? 'European Portuguese' : 'Brazilian Portuguese';
  if (code === 'fr') return ct.code === 'CA' ? 'Canadian French' : 'French';
  if (code === 'other') return app.languageName || 'the language of the job posting';
  return langName(code);
}

const TRUTH = `GROUND RULES (they outrank every other instruction)
1. Truth. Use only facts found in the CANDIDATE MATERIAL and in the candidate's answers. Never invent or inflate employers, job titles, dates, degrees, grades, tools, numbers, language levels or responsibilities. When the posting asks for something the candidate does not have, do not claim it. You may point to the closest real experience and describe it honestly.
2. Known gaps are off limits. Anything listed under KNOWN GAPS, or answered with "I don't have this", must not appear as a skill, tool or experience.
3. Earlier applications inside the material were written for OTHER employers. Reuse their facts. Never reuse their targets: other company names, other cities, start dates or motivations aimed at someone else.
4. Numbers. Only numbers that appear in the material, with the candidate's own hedges kept ("about", "estimated", "over").
5. Never output placeholders such as [Company], [Address] or "XYZ". If something is unknown, leave the field empty.`;

const BANNED_BY_LANG = {
  en: 'passionate, proven track record, results-driven, dynamic, fast-paced, leverage, utilize, spearhead, orchestrate, synergy, seamless, cutting-edge, robust, delve, testament, tapestry, "I am excited to apply", "I am writing to express my interest", "I believe I would be a great fit", "hit the ground running", "team player", "think outside the box"',
  de: 'hochmotiviert, leidenschaftlich, dynamisch, "teamfähig und belastbar", "hiermit bewerbe ich mich", "mit großem Interesse habe ich", "über den Tellerrand", "ich brenne für" (and English buzzwords such as passionate, dynamic, leverage, utilize)',
  pt: '"apaixonado por", "proativo e dinâmico", "sólida experiência", "venho por meio desta", "perfil hands-on", "foco em resultados" (and equivalents such as passionate, leverage)',
  fr: 'passionné, dynamique et motivé, "force de proposition", "c\'est avec un vif intérêt", "vivement intéressé" (and equivalents such as passionate, leverage)',
  es: 'apasionado, proactivo, "me dirijo a ustedes", "sólida experiencia", "orientado a resultados" (and equivalents such as passionate, leverage)',
};

function styleBlock(lang) {
  const examples = BANNED_BY_LANG[lang] || 'passionate, proven track record, results-driven, dynamic, leverage, utilize, spearhead, seamless, "I am excited to apply", "team player", and their equivalents in the document language';
  return `VOICE: the text must read as written by the candidate, never by an AI
- No em dashes and no en dashes anywhere. Use commas, full stops, colons or parentheses.
- No stock phrases or buzzwords. Examples of what is banned: ${examples}.
- Every sentence must carry a fact about this candidate or this employer. Delete sentences that would fit any applicant.
- No lists of three for rhythm, no "not only ... but also", no rhetorical questions, no exclamation marks, no emojis, no markdown, no quotation marks around ordinary words.
- Plain verbs and concrete nouns before adjectives. Vary sentence length. Prefer the ordinary word: "used" over "utilized", "helped" over "facilitated", "led" over "spearheaded".
- Do not praise the employer in general terms. If you mention the employer, refer to something specific from the posting.`;
}

function header(app, kind = 'both') {
  const ct = country(app.country);
  return `You are JobMech's writer: an experienced recruiter and CV writer for the job market of ${ct.name}. You turn a candidate's raw material into application documents that a hiring manager in ${ct.name} reads as the work of a careful, competent person.

${TRUTH}

${styleBlock(app.language)}

MARKET CONVENTIONS
${marketBrief(ct, kind)}

LANGUAGE
Write every text value in ${languageDirective(app)}. Translate job titles, duties and descriptions into that language. Keep company names, product and tool names, and official names of degrees and certificates in their original form (add a short gloss in parentheses when a degree name would not be understood).

Return ONE JSON object and nothing else: no commentary, no markdown fences.`;
}

export function answersBlock(app) {
  const lines = [];
  const none = [];
  for (const a of app.answers || []) {
    if (a.state === 'answered' && String(a.a || '').trim()) lines.push(`Q: ${a.q}\nA: ${String(a.a).trim()}`);
    else if (a.state === 'none') none.push(a.q);
  }
  let out = lines.length ? lines.join('\n\n') : '(the candidate added nothing new)';
  if (none.length) out += '\n\nThe candidate answered "I don\'t have this" to the following. Treat each as a known gap:\n' + none.map((q) => '- ' + q).join('\n');
  if (String(app.extraNotes || '').trim()) out += '\n\nAdditional notes from the candidate for this application:\n' + String(app.extraNotes).trim();
  return out;
}

function analysisBlock(app) {
  const an = app.job && app.job.analysis;
  if (!an) return '(no analysis available)';
  const reqs = (an.requirements || []).map((r) => `- [${r.status}] ${r.text}${r.evidence ? ' | evidence: ' + r.evidence : ''}`).join('\n');
  const kws = (an.keywords || []).join(', ');
  return `Requirements and how the candidate matches them:\n${reqs || '(none)'}\n\nSearch terms a recruiter or screening software will look for: ${kws || '(none)'}`;
}

function jobLine(app) {
  const j = (app.job && app.job.analysis && app.job.analysis.job) || {};
  const bits = [`${app.title || j.title || 'the advertised position'} at ${app.company || j.company || 'the employer'}`];
  if (app.location || j.city) bits.push(`in ${app.location || j.city}`);
  if (j.reference) bits.push(`(reference ${j.reference})`);
  if (j.contract) bits.push(`| contract: ${j.contract}`);
  if (j.startDate) bits.push(`| start: ${j.startDate}`);
  return bits.join(' ');
}

// ------------------------------------------------------------------------------------ analysis

export function analysisPrompt({ memory, jobText }) {
  const system = `You are JobMech's job analyst: a senior recruiter who reads a job posting next to a candidate's background and reports, precisely and without flattery, how well they match and what is still unknown.

Return ONE JSON object and nothing else: no commentary, no markdown fences.`;
  const user = `TODAY: ${isoDate()}

CANDIDATE MATERIAL
"""
${memory}
"""

JOB POSTING
"""
${jobText}
"""

TASK
1. Read the posting. Identify the job title, the employer, the city and country of the workplace, the language the posting is written in, a named contact person if there is one, any reference number, the start date and the type of contract.
2. List the 6 to 10 requirements that matter most for being shortlisted: skills, tools, experience, education, languages and formal conditions such as enrolment, working hours or work permit. Judge each one from the candidate material only: "met", "partial" or "missing", with the evidence you relied on in a few words.
3. Write up to 5 questions for the candidate. Ask only what would change the application:
   - a requirement that is partial or missing where the candidate may simply not have mentioned relevant experience,
   - a missing number, scope or outcome for an example that is already strong,
   - a practical condition the posting sets (place of work, hours per week, start date, permit).
   Never ask about something the material already answers, or about anything listed under KNOWN GAPS. One topic per question. Be specific to this candidate: name the employer or project you are asking about. Each question must be answerable in two or three sentences. If nothing is worth asking, return an empty list.
4. Collect 10 to 18 keywords or short phrases from the posting that a recruiter or screening software would search for (tools, methods, role terms), in the posting's own language and spelling.

OUTPUT (JSON)
{
  "job": {
    "title": "job title as the posting gives it, without gender markers such as (m/w/d)",
    "company": "employer name",
    "city": "city of the workplace, or empty",
    "countryCode": "ISO 3166-1 alpha-2 code of the country where the job is located, for example DE",
    "language": "ISO 639-1 code of the language the posting is written in, for example de",
    "contactPerson": "full name of a named contact person, or empty",
    "contactSalutation": "how a letter should greet that person in the posting's language, for example 'Sehr geehrte Frau Müller,', or empty",
    "reference": "reference number or job ID, or empty",
    "startDate": "start date if stated, or empty",
    "contract": "for example working student, internship, full-time, or empty",
    "address": ["postal address lines of the employer, only if the posting states them"]
  },
  "requirements": [
    { "text": "the requirement in at most 12 words", "importance": "must or nice", "status": "met, partial or missing", "evidence": "at most 16 words taken from the candidate material, or empty" }
  ],
  "questions": [
    { "question": "the question", "why": "which requirement it helps with, at most 12 words" }
  ],
  "keywords": ["keyword"],
  "fit": "two honest sentences: how well the candidate fits and what the main risk is"
}
Write "requirements", "questions" and "fit" in English. Keep "title", "company", "contactSalutation" and "keywords" in the posting's own language.`;
  return { system, user };
}

// ------------------------------------------------------------------------------------ CV

function cvBudget(app) {
  const ct = country(app.country);
  const pages = ct.cvPages >= 2 ? 2 : 1;
  if (pages === 1) return 'The CV must fit on ONE page: at most 13 bullets in total, each at most 20 words, and a profile of at most 45 words.';
  return `The CV must fit on ${ct.cvPages > 2 ? 'two to three pages' : 'two pages at the very most, one page if the career is short'}: at most 20 bullets in total, each at most 24 words, and a profile of at most 55 words.`;
}

export function cvPrompt(app, memory, opts = {}) {
  const ct = country(app.country);
  const needLabels = app.language === 'other';
  const labelSpec = needLabels
    ? `,\n  "labels": { ${LABEL_KEYS.map((k) => `"${k}": "${englishLabels()[k].replace(/"/g, "'")}"`).join(', ')} }`
    : '';
  const labelTask = needLabels
    ? `\n9. "labels": translate each English label value into ${languageDirective(app)} the way a native CV in ${ct.name} would word it. Keep the keys unchanged.`
    : '';
  const jobText = opts.jobText != null ? opts.jobText : app.job.text;
  const user = `TODAY: ${isoDate()}
TARGET JOB: ${jobLine(app)}
DOCUMENT LANGUAGE: ${languageDirective(app)}
LENGTH: ${cvBudget(app)}

JOB POSTING
"""
${jobText}
"""

WHAT THE ANALYSIS FOUND
${analysisBlock(app)}

CANDIDATE MATERIAL
"""
${memory}
"""

THE CANDIDATE'S ANSWERS FOR THIS APPLICATION
${answersBlock(app)}

TASK: write the content of the CV for this job.
1. Experience and education in reverse chronological order (newest first). Keep every position the candidate has had, so the timeline shows no holes, but weight them: positions that support this application get 3 to 5 bullets and "relevance": "core"; positions unrelated to this job get "relevance": "other" and one bullet at most.
2. Bullets: put what matters for THIS posting first. Where the candidate's experience truly matches a requirement, use the posting's own term for it, because recruiters and screening software search for those words. Never add a term the material does not support.
3. "headline": a truthful description of who the candidate is professionally, in at most 8 words. Do not copy the title of the posting unless the candidate already holds it.
4. "summary": a profile following the market conventions above. It may name the target role. No adjectives about personality.
5. "skills": 3 to 5 groups with a short label each. Only skills the material shows, with the candidate's own qualifiers kept (for example "basic", "self-taught", "user level").
6. "languages" with levels exactly as the material states them. "certifications" and "projects" only when the material has them and they help this application.
7. "extras": facts a recruiter for this job needs and that have no other place, each with a short label: earliest start date, availability per week, work permit, willingness to relocate, driving licence. Only when stated by the candidate. "interests": only if the material mentions any, otherwise empty.
8. "facts" and "gaps" are for the candidate's private memory, written in English: "facts" restates each useful NEW answer above as one standalone sentence that will still make sense in a year without the question (name the employer, project, tool or number). "gaps" lists what the candidate said they do not have, as short noun phrases. Both are empty lists when the candidate added nothing new.${labelTask}

Dates: "YYYY-MM", or "YYYY" when the month is unknown. Use "present" for an ongoing position. A planned end may carry a short note in the document language in parentheses, for example "2027-12 (expected)".

OUTPUT (JSON)
{
  "headline": "",
  "summary": "",
  "experience": [
    { "role": "", "company": "", "location": "City, Country", "start": "YYYY-MM", "end": "YYYY-MM or present", "relevance": "core or other", "bullets": [""] }
  ],
  "education": [
    { "degree": "", "institution": "", "location": "", "start": "YYYY-MM", "end": "YYYY-MM or present", "details": [""] }
  ],
  "skills": [ { "label": "", "items": "comma-separated list" } ],
  "languages": [ { "name": "", "level": "" } ],
  "certifications": [ { "name": "", "issuer": "", "year": "" } ],
  "projects": [ { "name": "", "description": "" } ],
  "extras": [ { "label": "", "text": "" } ],
  "interests": "",
  "personal": { "location": "city and country of residence in the document language", "nationality": "nationality in the document language, or empty", "permit": "work permit or visa status in the document language, short and precise, or empty" },
  "facts": [""],
  "gaps": [""]${labelSpec}
}`;
  return { system: header(app, 'cv'), user };
}

// ------------------------------------------------------------------------------------ cover letter

export function compactCv(cv) {
  if (!cv) return '(none)';
  const lines = [];
  if (cv.headline) lines.push('Headline: ' + cv.headline);
  if (cv.summary) lines.push('Profile: ' + cv.summary);
  for (const e of cv.experience || []) {
    lines.push(`${e.role} | ${e.company} | ${e.start || e.period || ''}${e.end ? ' to ' + e.end : ''}`);
    for (const b of e.bullets || []) lines.push('  - ' + b);
  }
  for (const e of cv.education || []) lines.push(`${e.degree} | ${e.institution} | ${e.start || e.period || ''}${e.end ? ' to ' + e.end : ''}`);
  for (const s of cv.skills || []) lines.push(`${s.label ? s.label + ': ' : ''}${s.items}`);
  for (const x of cv.extras || []) lines.push(`${x.label ? x.label + ': ' : ''}${x.text}`);
  return lines.join('\n');
}

export function letterPrompt(app, memory, profile, opts = {}) {
  const ct = country(app.country);
  const j = (app.job.analysis && app.job.analysis.job) || {};
  const [lo, hi] = ct.letterWords;
  const contact = j.contactPerson
    ? `The posting names a contact person: ${j.contactPerson}. Greeting to use: ${j.contactSalutation || '(derive the correct formal greeting for this person)'}`
    : 'The posting names no contact person. Use the correct generic greeting for this market and language.';
  const address = (j.address || []).length ? j.address.join(' / ') : '(not stated in the posting: leave it out)';
  const jobText = opts.jobText != null ? opts.jobText : app.job.text;
  const user = `TODAY: ${isoDate()}
TARGET JOB: ${jobLine(app)}
DOCUMENT LANGUAGE: ${languageDirective(app)}
SENDER: ${profile.fullName || 'the candidate'}${profile.location ? ', ' + profile.location : ''}
${contact}
Employer's postal address: ${address}

THE CV THAT GOES WITH THIS LETTER (stay consistent with it; do not retell it)
"""
${compactCv(app.cv)}
"""

JOB POSTING
"""
${jobText}
"""

WHAT THE ANALYSIS FOUND
${analysisBlock(app)}

CANDIDATE MATERIAL
"""
${memory}
"""

THE CANDIDATE'S ANSWERS FOR THIS APPLICATION
${answersBlock(app)}

TASK: write the cover letter for this job.
- Length: ${lo} to ${hi} words in "paragraphs" altogether, in 3 to 4 paragraphs. It must fit on one page.
- Opening: the position, and within the first two sentences a concrete reason why this candidate and this role belong together. No formula, no restating of the job advert.
- Middle: the two or three pieces of evidence that matter most for THIS posting. For each one say what the situation was, what the candidate did and what came of it, and tie it to a requirement of the posting. Choose depth over coverage: the CV carries the rest.
- Practical points the employer needs, when the candidate has stated them: earliest start date, hours per week, enrolment status, work permit, relocation. One or two sober sentences.
- If an important requirement is not met, do not blur it with vague wording. Either leave it out or say in one plain sentence what the candidate brings instead.
- Close with one short, concrete sentence inviting a conversation.
- Do not begin more than two sentences in a row with "I" (or its equivalent).

OUTPUT (JSON)
{
  "recipient": ["employer name", "contact person or department, only if known", "street, only if stated in the posting", "postal code and city, only if stated in the posting"],
  "subject": "subject line following the market conventions, without any label such as 'Subject:' or 'Betreff:'",
  "salutation": "greeting line with the punctuation this market uses",
  "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "closing": "closing formula with the punctuation this market uses, without the name",
  "enclosures": "the customary enclosures line for this market in the document language (for example 'Anlagen: Lebenslauf' in Germany), or empty where it is not customary"
}`;
  return { system: header(app, 'letter'), user };
}

// ------------------------------------------------------------------------------------ humanizer / fact check

export function humanizePrompt(app, memory, fields, opts = {}) {
  const ct = country(app.country);
  const scope = opts.scope === 'cv' || opts.scope === 'letter' ? opts.scope : 'all';
  const briefKind = scope === 'cv' ? 'cv' : scope === 'letter' ? 'letter' : 'both';
  const cvRef = scope === 'letter' && app.cv
    ? `\nTHE CV THAT GOES WITH THIS LETTER (stay consistent with it)\n"""\n${compactCv(app.cv)}\n"""\n`
    : '';
  const system = `You are JobMech's final editor: a strict human copy editor. You make application documents sound like their author, and you check every claim against the candidate's own material.

Return ONE JSON object and nothing else: no commentary, no markdown fences.`;
  const user = `MARKET: ${ct.name}
DOCUMENT LANGUAGE: ${languageDirective(app)}
TARGET JOB: ${jobLine(app)}
${cvRef}
CANDIDATE MATERIAL (the only source of truth)
"""
${memory}
"""

THE CANDIDATE'S ANSWERS FOR THIS APPLICATION
${answersBlock(app)}

MARKET CONVENTIONS
${marketBrief(ct, briefKind)}

TEXT FIELDS TO REVIEW (JSON: field id -> text). Fields starting with "cv." belong to the CV, "letter." to the cover letter.
${JSON.stringify(fields)}

Go through every field and change it only when one of these applies:
(a) FACT: it states something the material does not support: an invented or altered number, tool, duty, title, date or language level, or a known gap presented as a skill. Rewrite it to what the material supports. If a CV bullet has no factual basis at all, return an empty string for it, which deletes it.
(b) VOICE: it sounds machine-written. Signs: buzzwords and stock phrases, self-praise without evidence, a sentence that would fit any applicant, lists of three for rhythm, "not only ... but also", stacked abstract nouns, sentences that announce instead of saying something ("I am writing to", "I would like to take this opportunity"), the same sentence opening several times in a row, em dashes or en dashes. Rewrite it plainly, as a person would say it to a colleague.
(c) MARKET: it breaks one of the conventions above (for example "I" in CV bullets where the market does not use it, a wrong greeting or closing formula).
(d) LANGUAGE: grammar, spelling or register mistakes, or text left in another language. Job titles and descriptions must be in the document language; names of companies, tools and official degrees stay as they are.

Keep the meaning, every supported fact and number, and the length (never more than 15% longer). Leave good text alone: a field you do not change must NOT appear in your answer.

OUTPUT (JSON)
{
  "edits": { "field id": "new text" },
  "notes": ["one short English sentence per change of substance, saying what was changed and why; at most ${scope === 'all' ? 8 : 5}"]
}`;
  return { system, user };
}

// ------------------------------------------------------------------------------------ refine on request

export function refinePrompt(app, memory, target, instruction, doc, opts = {}) {
  const what = target === 'cv' ? 'CV' : 'COVER LETTER';
  const jobText = opts.jobText != null ? opts.jobText : app.job.text;
  const user = `TARGET JOB: ${jobLine(app)}
DOCUMENT LANGUAGE: ${languageDirective(app)}

CURRENT ${what} (JSON)
${JSON.stringify(doc)}

JOB POSTING (context)
"""
${jobText}
"""

CANDIDATE MATERIAL
"""
${memory}
"""

THE CANDIDATE'S ANSWERS FOR THIS APPLICATION
${answersBlock(app)}

THE CANDIDATE ASKS FOR THIS CHANGE
"""
${instruction}
"""

Apply the request. Change only what it requires and keep everything else word for word. All ground rules still hold: if the request could only be met by inventing facts, do not invent; go as far as the material allows.

Return the complete updated ${what} as ONE JSON object with exactly the same keys and structure as the current one, plus a key "note": one English sentence saying what you changed, or why you could not.`;
  return { system: header(app, target), user };
}

// ------------------------------------------------------------------------------------ interview preparation

export function interviewPrompt(app, memory, language, opts = {}) {
  const ct = country(app.country);
  const cv = app.cv || {};
  const letter = app.letter || {};
  const part = opts.part === 'part1' || opts.part === 'part2' ? opts.part : 'all';
  const jobText = opts.jobText != null ? opts.jobText : ((app.job && app.job.text) || '(not available)');
  const system = `You are JobMech's interview coach: a hiring manager with many years of job interviews in ${ct.name} behind you. You prepare one candidate for one specific interview. You predict what this employer will ask and you show the candidate which of their own real experiences answer it.

${TRUTH}

Return ONE JSON object and nothing else: no commentary, no markdown fences.`;

  const commonContext = `TODAY: ${isoDate()}
TARGET JOB: ${jobLine(app)}
MARKET: ${ct.name}
WRITE IN: ${languageDirective({ country: app.country, language, languageName: app.languageName })}

JOB POSTING
"""
${jobText}
"""

${analysisBlock(app)}

CANDIDATE MATERIAL (the only source of truth)
"""
${memory}
"""

THE CANDIDATE'S ANSWERS FOR THIS APPLICATION
${answersBlock(app)}

WHAT THE EMPLOYER HAS ALREADY READ
CV profile: ${cv.summary || '(none)'}
Cover letter:
${(letter.paragraphs || []).join('\n') || '(none)'}`;

  const noteRules = `For each question give "why" (what the interviewer wants to find out, at most 14 words) and "points": 2 to 4 short notes the candidate can speak from. Every note must rest on a specific real experience, number or fact from the material, with the employer or project named. For a behavioural question give the situation, what the candidate did and the result, as far as the material tells it. Where the material holds no answer, say so plainly in a note and add what the candidate could honestly say, or what they should think through before the interview. Never write a note that claims something the material does not support, and never turn a known gap into a strength.

Notes are notes, not scripts: short phrases the candidate will say in their own words. No buzzwords, no self-praise without evidence, no em dashes or en dashes, no markdown.`;

  let taskBlock;
  if (part === 'part1') {
    taskBlock = `TASK (PART 1 OF 2)
The candidate has been invited to an interview for this job. Prepare the opening pitch and the first 6 most likely questions.
1. "pitch": how to answer "tell me about yourself" in about one minute, as 3 or 4 short notes in speaking order: who they are now, the experience that matters most for this job, why this employer.
2. "questions": 6 questions this employer is most likely to ask first, covering:
   - motivation: why this employer, why this role, why now;
   - role: the main tasks named in the posting;
   - experience: something the employer read in the CV or the letter and will want to hear more about;
   - gap: the main [missing] or [partial] requirements above.
${noteRules}

OUTPUT (JSON)
{
  "pitch": ["note"],
  "questions": [
    { "category": "motivation, role, experience or gap", "question": "the question as the interviewer would ask it", "why": "what they want to find out", "points": ["note"] }
  ]
}`;
  } else if (part === 'part2') {
    const existing = (opts.existingQuestions || []).length
      ? `\nQUESTIONS ALREADY PREPARED IN PART 1 (do not repeat these):\n${opts.existingQuestions.map((q) => '- ' + q).join('\n')}\n`
      : '';
    taskBlock = `TASK (PART 2 OF 2)${existing}
Finish preparing the candidate for this interview with the remaining questions, questions to ask, and key reminders.
1. "questions": 5 to 6 NEW questions not listed above, covering:
   - gap: any remaining [partial] or [missing] requirement not already asked;
   - practical: start date, hours, place of work, work permit, and salary expectation where that is usual in ${ct.name};
   - behavioural: two "tell me about a time when" questions typical for this kind of role.
${noteRules}
2. "ask": 4 or 5 questions the candidate could put to the interviewer. They must be specific to this posting and employer and must not be answered in the posting already.
3. "watch": 2 to 4 short tips for this interview: the weak spots to be ready for, a custom of job interviews in ${ct.name} worth knowing, something to check or bring.

OUTPUT (JSON)
{
  "questions": [
    { "category": "gap, practical or behavioural", "question": "the question as the interviewer would ask it", "why": "what they want to find out", "points": ["note"] }
  ],
  "ask": ["question for the interviewer"],
  "watch": ["tip"]
}`;
  } else {
    taskBlock = `TASK
The candidate has been invited to an interview for this job. Prepare them.
1. "pitch": how to answer "tell me about yourself" in about one minute, as 3 or 4 short notes in speaking order: who they are now, the experience that matters most for this job, why this employer.
2. "questions": the 10 to 12 questions this employer is most likely to ask, most likely first. Cover all of these:
   - motivation: why this employer, why this role, why now;
   - role: the main tasks named in the posting;
   - experience: something the employer read in the CV or the letter and will want to hear more about;
   - gap: every requirement marked [partial] or [missing] above. An interviewer probes exactly there;
   - practical: start date, hours, place of work, work permit, and salary expectation where that is usual in ${ct.name};
   - behavioural: two "tell me about a time when" questions typical for this kind of role.
${noteRules}
3. "ask": 4 or 5 questions the candidate could put to the interviewer. They must be specific to this posting and employer and must not be answered in the posting already.
4. "watch": 2 to 4 short tips for this interview: the weak spots to be ready for, a custom of job interviews in ${ct.name} worth knowing, something to check or bring.

OUTPUT (JSON)
{
  "pitch": ["note"],
  "questions": [
    { "category": "motivation, role, experience, gap, practical or behavioural", "question": "the question as the interviewer would ask it", "why": "what they want to find out", "points": ["note"] }
  ],
  "ask": ["question for the interviewer"],
  "watch": ["tip"]
}`;
  }

  return { system, user: `${commonContext}\n\n${taskBlock}` };
}

// ------------------------------------------------------------------------------------ lossless story distillation

/** Condenses one chunk of a very large candidate background into dense plain-text facts with zero fact loss. */
export function digestPrompt(chunk, index = 1, total = 1) {
  const system = `You condense a job candidate's raw notes and earlier documents into a dense, lossless factual summary. Never invent, alter, round or drop any real fact, employer, job title, date, degree, grade, tool, skill qualifier, language level, work permit, availability or number. Return plain text only (no markdown fences, no commentary).`;
  const user = `PART ${index} OF ${total} OF CANDIDATE MATERIAL
"""
${chunk}
"""

Condense this part into tight, scannable plain-text bullets:
1. Keep EVERY employer, role, location, exact date range (month and year), responsibility, outcome, degree, institution, grade, project, tool/software, certification, language + level, work permit/visa, availability and interest.
2. Keep EVERY number, percentage, count and hedge ("about", "roughly", "over") verbatim.
3. Remove duplicate statements, generic filler prose, and greetings/closings/flattery from old cover letters addressed to other employers (keep only factual claims about what the candidate actually did).
4. Write compact factual lines (e.g. "EMPLOYER | ROLE | YYYY-MM to YYYY-MM | CITY" followed by "- short factual bullet"). Stay under 45% of the input length where possible without losing a single fact.`;
  return { system, user };
}

// ------------------------------------------------------------------------------------ memory tidy-up

export function tidyPrompt(items) {
  const system = `You tidy a job seeker's private notes. Return ONE JSON object and nothing else.`;
  const user = `Below are questions a career assistant asked a candidate and the candidate's raw answers.

${JSON.stringify(items)}

For each item write "fact": one standalone English sentence stating what the answer establishes, with the employer, project, tool or number named, so that it still makes sense in a year without the question. Do not add anything the answer does not say. If the answer establishes nothing usable, return an empty string.
Separately collect "gaps": things the candidate says they have NOT done or do not have, as short noun phrases (for example "No experience with Jira, Azure DevOps or Trello").

OUTPUT (JSON)
{ "facts": [ { "id": "same id", "fact": "sentence or empty" } ], "gaps": ["phrase"] }`;
  return { system, user };
}
