// Country standards: how a CV and a cover letter are expected to look and read in each job market.
// "family" selects the page layout and letter format; the remaining fields fine-tune it.
//
// photo:  expected -> included by default | optional -> off by default, allowed | omit -> off, discouraged
// english: which English to use when the documents are written in English for that market

export const FAMILIES = {
  dach:   { layout: 'tabular', letter: 'din',   label: 'Tabular CV (Lebenslauf)' },
  us:     { layout: 'classic', header: 'center', letter: 'block', label: 'North American resume' },
  uk:     { layout: 'classic', header: 'left',   letter: 'uk',    label: 'British-style CV' },
  latin:  { layout: 'sidebar', letter: 'fr',    label: 'Continental CV with side column' },
  nordic: { layout: 'gutter',  letter: 'plain', label: 'Dutch / Nordic minimal CV' },
  br:     { layout: 'classic', header: 'left',   letter: 'plain', label: 'Brazilian currículo' },
  intl:   { layout: 'gutter',  letter: 'plain', label: 'International CV' },
};

const BRIEFS = {
  dach: {
    head: 'German-speaking market conventions:',
    cv: `- The CV is a factual, tabular "Lebenslauf": reverse-chronological, no self-praise, no adjectives without evidence. Bullets are short, usually verbless or participle phrases ("Rechnungen in SAP geprüft", "Checked invoices in SAP"), not full sentences, and never use "I".
- Gaps in the timeline are noticed: keep every period that the candidate provided, with month and year.
- A short profile at the top is optional; if used, keep it to 2-3 plain lines.`,
    letter: `- The cover letter ("Anschreiben") fits on ONE page: 3 to 4 paragraphs, about 220-320 words. It is formal and concrete: why this employer, what the candidate has actually done that matches the posting, practical details (earliest start date, availability, work permit if relevant), and a polite request for an interview. No flattery, no superlatives.
- Subject line: "Bewerbung als <job title>" (in German) or "Application as <job title>" (in English), plus the reference number if the posting has one. Never write the word "Betreff".
- Salutation: a named contact if the posting gives one ("Sehr geehrte Frau Müller," / "Dear Ms Müller,"), otherwise "Sehr geehrte Damen und Herren," / "Dear Sir or Madam,". In German the salutation ends with a comma and the first paragraph then starts with a lower-case letter, unless its first word is a noun or a name.
- Closing: "Mit freundlichen Grüßen" (German) or "Kind regards" (English).`,
  },
  us: {
    head: 'North American resume conventions:',
    cv: `- It is called a "resume". Never mention age, date of birth, marital status, nationality, religion or a photo.
- One page for under ~10 years of experience; two at most.
- Bullets start with a strong past-tense action verb (present tense for the current job), contain no pronouns ("I", "my") and show a concrete result or scale wherever the candidate's material supports it. Do not invent numbers.
- Use American spelling and Month YYYY dates. Spell out degree names the American way where a clear equivalent exists, otherwise keep the original and add a short gloss.
- Skills are grouped by category on single lines.`,
    letter: `- Use American spelling and Month YYYY dates. Never mention age, date of birth, marital status, nationality, religion or a photo.
- The cover letter is 3-4 short paragraphs (250-350 words), confident and specific: the role, two or three pieces of evidence matched to the posting, and a direct close. Salutation "Dear Ms. Smith," or "Dear Hiring Manager,". Closing "Sincerely,".`,
  },
  uk: {
    head: 'British / Commonwealth CV conventions:',
    cv: `- It is called a "CV". Maximum two pages. No photo, date of birth, marital status or nationality.
- Starts with a short "Personal profile" (3-4 lines, third person implied, no "I"), then key skills, career history in reverse order, education and qualifications.
- Bullets describe responsibilities and achievements in past tense, concrete and modest. Use British spelling (organise, programme, analyse).`,
    letter: `- Use British spelling (organise, programme, analyse). No date of birth, marital status or nationality.
- The cover letter is one page, 3-4 paragraphs. "Dear Mr/Ms Surname," closes with "Yours sincerely,"; "Dear Hiring Manager," or "Dear Sir or Madam," closes with "Yours faithfully,".`,
  },
  latin: {
    head: 'Continental (France, Belgium, Southern Europe) CV conventions:',
    cv: `- The CV fits on one page for junior and mid-level profiles, two at most. It opens with the target job title and a 2-3 line profile ("accroche").
- Experience entries are concise: role, employer, city, dates, then 2-4 short result-oriented bullets (noun phrases or infinitives, no "I").
- Languages with CEFR levels and IT skills are expected; interests are common and should be specific, not generic.`,
    letter: `- The cover letter is formal and structured in three movements: the company and the role ("you"), the candidate's matching experience ("me"), what they would do together ("us"), then a courteous request for an interview. One page.`,
  },
  nordic: {
    head: 'Dutch and Nordic conventions:',
    cv: `- Direct, modest and factual tone. Understatement is preferred to self-promotion; avoid big adjectives and anything that sounds like marketing.
- CV of one to two pages, reverse-chronological, with short bullets about what the candidate actually did and with whom. Team contribution matters as much as individual achievement.`,
    letter: `- Direct, modest and factual tone. Understatement is preferred to self-promotion; avoid big adjectives and anything that sounds like marketing.
- The cover letter is short (max. about 250 words), personal and to the point: motivation for this employer, relevant experience, practical details. Informal-polite register.`,
  },
  br: {
    head: 'Brazilian "currículo" conventions:',
    cv: `- One to two pages. No photo, no document numbers (CPF, RG), no marital status. City and state are enough as address.
- Starts with "Objetivo" (the target role, one line) and a short "Resumo profissional" (3-4 lines).
- Experience in reverse order: cargo, empresa, cidade, período, then short bullets with responsibilities and results, without "eu".`,
    letter: `- The cover letter is short, cordial and objective (3 paragraphs). "Prezado(a) Sr.(a) Sobrenome," or "Prezados(as)," and "Atenciosamente,".`,
  },
  intl: {
    head: 'International conventions:',
    cv: `- Clear, neutral English (or the language of the posting). Reverse-chronological CV of up to two pages with concrete bullets, no pronouns.
- State work authorisation or visa status plainly when the candidate has provided it, because international employers need it.`,
    letter: `- Clear, neutral English (or the language of the posting). State work authorisation or visa status plainly when relevant and provided.
- One-page cover letter: motivation, two or three pieces of matching evidence, practical details, polite close.`,
  },
};

function composeBrief(family, kind, o) {
  const b = BRIEFS[family] || BRIEFS.intl;
  const parts = [b.head];
  if (kind === 'cv') {
    parts.push(b.cv);
    if (o.noteBoth) parts.push(o.noteBoth);
    if (o.noteCv) parts.push(o.noteCv);
  } else if (kind === 'letter') {
    parts.push(b.letter);
    if (o.noteBoth) parts.push(o.noteBoth);
    if (o.noteLetter) parts.push(o.noteLetter);
  } else {
    parts.push(b.cv, b.letter);
    if (o.noteBoth) parts.push(o.noteBoth);
    if (o.noteCv) parts.push(o.noteCv);
    if (o.noteLetter) parts.push(o.noteLetter);
  }
  return parts.join('\n');
}

function c(code, name, family, o = {}) {
  const ct = Object.assign({
    code, name, family,
    paper: 'A4',
    photo: 'optional',
    birth: false,          // show date of birth when the profile has one
    nationality: false,    // show nationality
    permit: true,          // show work permit / visa status when the profile has one
    address: false,        // show the full postal address rather than only the city
    signature: false,      // place, date and name at the end of the CV
    english: 'intl',
    cvPages: 2,
    letterWords: [220, 340],
    rules: [],
    noteBoth: '',
    noteCv: '',
    noteLetter: '',
    brief: '',
  }, o);
  if (!ct.brief) ct.brief = composeBrief(family, 'both', ct);
  return ct;
}

export const COUNTRIES = [
  c('DE', 'Germany', 'dach', {
    photo: 'expected', birth: true, nationality: true, address: true, signature: true,
    rules: [
      'Tabular CV ("Lebenslauf"): dates in a left column, newest position first',
      'Portrait photo at the top right (customary in Germany, not legally required)',
      'Date of birth, nationality and work permit are commonly listed',
      'Ends with place, date and your name',
      'Cover letter in DIN 5008 layout: address block, date on the right, bold subject line, one page',
    ],
  }),
  c('AT', 'Austria', 'dach', {
    photo: 'expected', birth: true, nationality: true, address: true, signature: true,
    rules: [
      'Tabular CV ("Lebenslauf"), newest position first',
      'Portrait photo at the top right is customary',
      'Date of birth and nationality are commonly listed',
      'Formal one-page cover letter with address block and bold subject line',
    ],
    noteLetter: '- Austria: academic titles are used in salutations when known ("Sehr geehrte Frau Mag. Huber,").',
  }),
  c('CH', 'Switzerland', 'dach', {
    photo: 'expected', birth: true, nationality: true, address: true, signature: false,
    rules: [
      'Tabular CV, precise and complete, newest position first',
      'Portrait photo expected',
      'Nationality and residence permit (e.g. B, C, L) are expected',
      'Language levels (CEFR) matter in every language region',
      'Swiss letter style: no comma after the salutation, "Freundliche Grüsse" to close',
    ],
    noteBoth: '- Switzerland: when writing in German, never use the letter "ß" (write "ss": "Grüsse", "gross"). State the residence permit type if the candidate has provided it.',
    noteLetter: '- Switzerland letter: the salutation has NO comma ("Sehr geehrte Frau Müller") and the next line starts with a capital letter. Closing: "Freundliche Grüsse".',
  }),
  c('NL', 'Netherlands', 'nordic', {
    rules: [
      'Clean one to two page CV, newest position first',
      'Photo is optional; many Dutch employers are fine without one',
      'Direct and modest tone, no exaggeration',
      'Short motivation letter (about 250 words)',
    ],
    noteLetter: '- Netherlands: "Geachte heer/mevrouw Surname," (formal) or "Beste Firstname," (informal companies); closing "Met vriendelijke groet,". In English: "Dear Mr/Ms Surname," and "Kind regards,".',
  }),
  c('BE', 'Belgium', 'latin', {
    rules: [
      'One to two page CV; language skills (Dutch, French, English) are decisive',
      'Photo is optional',
      'Formal one-page cover letter in the language of the posting',
    ],
    noteBoth: '- Belgium: write in the language of the posting (Dutch, French or English) and list language levels prominently.',
  }),
  c('LU', 'Luxembourg', 'latin', {
    rules: ['One to two page CV; multilingual skills listed with levels', 'Photo is optional', 'Formal one-page cover letter'],
    noteBoth: '- Luxembourg: language skills (French, German, Luxembourgish, English) with levels are essential.',
  }),
  c('FR', 'France', 'latin', {
    photo: 'optional', cvPages: 1,
    rules: [
      'One-page CV with the target job title and a short profile at the top',
      'Photo is common but optional',
      'Side column for contact details, skills, languages and interests',
      '"Lettre de motivation": sender top left, recipient right, "Objet :" line, formal closing formula',
    ],
    noteLetter: `- France: subject line "Objet : Candidature au poste de <title>". Salutation "Madame, Monsieur," (or "Madame Dupont,"). End with a formal closing sentence such as "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées." as the final paragraph, and leave the short closing field empty.`,
  }),
  c('ES', 'Spain', 'latin', {
    photo: 'optional',
    rules: [
      'One to two page CV; a photo is still common',
      'Side column for contact details, skills and languages',
      '"Carta de presentación": formal, one page, salutation followed by a colon',
    ],
    noteLetter: '- Spain: salutation "Estimado/a Sr./Sra. Apellido:" or "Estimados/as señores/as:" (with a colon). Closing "Atentamente," or "Un cordial saludo,".',
  }),
  c('IT', 'Italy', 'latin', {
    photo: 'optional', birth: true, nationality: true,
    rules: [
      'One to two page CV; a photo is common',
      'Date of birth and nationality are often listed',
      'Ends with the GDPR data-processing consent line',
      '"Lettera di presentazione": formal, one page',
    ],
    noteLetter: '- Italy: salutation "Gentile Dott./Dott.ssa Cognome," or "Spettabile <Azienda>,". Closing "Cordiali saluti,".',
    consent: { it: 'Autorizzo il trattamento dei miei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003.', en: 'I authorise the processing of my personal data in accordance with EU Regulation 2016/679 (GDPR).' },
  }),
  c('PT', 'Portugal', 'latin', {
    rules: ['One to two page CV; photo optional', 'Side column for contact details, skills and languages', 'Formal one-page "carta de apresentação"'],
    noteBoth: '- Portugal: use European Portuguese spelling and vocabulary.',
    noteLetter: '- Portugal letter: salutation "Exmo.(a) Senhor(a)," or "Caro(a) Dr.(a) Apelido,". Closing "Com os melhores cumprimentos,".',
  }),
  c('PL', 'Poland', 'latin', {
    photo: 'optional',
    rules: ['One to two page CV; a photo is common', 'Ends with the mandatory GDPR (RODO) consent clause', 'Short formal cover letter'],
    noteLetter: '- Poland: "Szanowni Państwo," as generic salutation; closing "Z poważaniem,".',
    consent: { pl: 'Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb niezbędnych do realizacji procesu rekrutacji zgodnie z Rozporządzeniem (UE) 2016/679 (RODO).', en: 'I consent to the processing of my personal data for the purposes of this recruitment process in accordance with Regulation (EU) 2016/679 (GDPR).' },
  }),
  c('SE', 'Sweden', 'nordic', {
    rules: ['One to two page CV, newest position first', 'Photo optional', 'Short, personal letter ("personligt brev"), informal-polite tone'],
    noteLetter: '- Sweden: salutation "Hej Firstname," is normal; closing "Med vänliga hälsningar,". In English: "Dear Firstname," / "Kind regards,".',
  }),
  c('DK', 'Denmark', 'nordic', {
    rules: ['One to two page CV; a small photo is common but optional', 'Short, motivated letter focused on what you will contribute'],
    noteLetter: '- Denmark: salutation "Kære Firstname," ; closing "Med venlig hilsen,". The letter should look forward (what the candidate will do in the role) more than backward.',
  }),
  c('NO', 'Norway', 'nordic', {
    rules: ['One to two page CV, newest position first', 'Photo optional', 'Short letter; references are often named at the end'],
    noteLetter: '- Norway: salutation "Hei Firstname," ; closing "Med vennlig hilsen,".',
  }),
  c('FI', 'Finland', 'nordic', {
    rules: ['One to two page CV; photo optional', 'Short, concrete letter'],
    noteLetter: '- Finland: salutation "Hei," or "Hyvä Firstname Lastname," ; closing "Ystävällisin terveisin,".',
  }),
  c('GB', 'United Kingdom', 'uk', {
    photo: 'omit', permit: false, english: 'uk',
    rules: [
      'Two-page "CV" opening with a personal profile',
      'No photo, date of birth or nationality (equality law practice)',
      'British spelling and Month YYYY dates',
      'Letter ends "Yours sincerely" (named contact) or "Yours faithfully"',
    ],
  }),
  c('IE', 'Ireland', 'uk', {
    photo: 'omit', permit: false, english: 'uk',
    rules: ['Two-page CV opening with a personal profile', 'No photo or personal data beyond contact details', 'British/Irish spelling'],
  }),
  c('US', 'United States', 'us', {
    paper: 'Letter', photo: 'omit', permit: false, english: 'us', cvPages: 1, letterWords: [230, 350],
    rules: [
      'It is a "resume": one page for early and mid career, centered header',
      'No photo, age, nationality or marital status (anti-discrimination practice)',
      'Bullets start with action verbs and show results; no "I"',
      'US Letter paper, American spelling, Month YYYY dates',
    ],
  }),
  c('CA', 'Canada', 'us', {
    paper: 'Letter', photo: 'omit', permit: false, english: 'us', cvPages: 2,
    rules: ['North American resume, one to two pages', 'No photo, age or nationality', 'US Letter paper; Canadian spelling in English, French in Québec postings'],
    noteBoth: '- Canada: use Canadian spelling (colour, centre, but organize). For Québec postings in French, write in French.',
  }),
  c('AU', 'Australia', 'uk', {
    photo: 'omit', permit: false, english: 'uk', cvPages: 3,
    rules: ['Two to three page resume/CV with a career profile', 'No photo or personal data', 'Referees or "available on request" at the end', 'Australian/British spelling'],
    noteCv: '- Australia: the document may be called "resume"; two to three pages are normal. Mention work rights only if the candidate provided them.',
    noteLetter: '- Australia letter: mention work rights only if the candidate provided them. Closing "Kind regards," is common.',
  }),
  c('NZ', 'New Zealand', 'uk', {
    photo: 'omit', permit: false, english: 'uk', cvPages: 3,
    rules: ['Two to three page CV with a personal statement', 'No photo or personal data', 'Referees at the end'],
    noteBoth: '- New Zealand: plain, friendly and modest tone.',
    noteLetter: '- New Zealand letter: closing "Kind regards,".',
  }),
  c('BR', 'Brazil', 'br', {
    photo: 'omit', permit: false,
    rules: ['Currículo de uma a duas páginas, com "Objetivo" no topo', 'Sem foto e sem números de documentos', 'Carta de apresentação curta e cordial'],
  }),
  c('JP', 'Japan', 'intl', {
    photo: 'expected', birth: true, nationality: true,
    rules: ['International-format CV for foreign and English-speaking employers', 'Portrait photo expected', 'Visa status and Japanese level (JLPT) stated clearly', 'Local Japanese forms (rirekisho) are not produced'],
    noteBoth: '- Japan (international employers): polite, humble and precise register; mention Japanese language level and visa status if provided.',
  }),
  c('SG', 'Singapore', 'intl', {
    nationality: true, english: 'uk',
    rules: ['Two-page CV, newest position first', 'Photo not required', 'Nationality and work pass status are commonly stated'],
    noteBoth: '- Singapore: British spelling; state work pass / residency status if provided.',
  }),
  c('AE', 'United Arab Emirates', 'intl', {
    photo: 'expected', birth: true, nationality: true, english: 'uk',
    rules: ['Two-page CV; a photo is common', 'Nationality, visa status and date of birth are commonly stated'],
    noteBoth: '- UAE / Gulf: formal register; nationality, visa status and availability are expected facts.',
  }),
  c('XX', 'Other / international', 'intl', {
    rules: ['Neutral international CV, up to two pages', 'No photo by default', 'One-page cover letter'],
  }),
];

const BY_CODE = new Map(COUNTRIES.map((x) => [x.code, x]));
export const country = (code) => BY_CODE.get(String(code || '').toUpperCase()) || BY_CODE.get('XX');
export const family = (code) => FAMILIES[country(code).family];

/** Returns only the conventions relevant to `kind` ('cv' | 'letter' | 'both'), cutting prompt noise. */
export function marketBrief(codeOrCountry, kind = 'both') {
  const ct = typeof codeOrCountry === 'string' ? country(codeOrCountry) : (codeOrCountry || country('XX'));
  if (kind === 'cv' || kind === 'letter') return composeBrief(ct.family, kind, ct);
  return ct.brief;
}

export const PAPER = {
  A4: { w: 210, h: 297, wIn: 8.2677, hIn: 11.6929, label: 'A4' },
  Letter: { w: 215.9, h: 279.4, wIn: 8.5, hIn: 11, label: 'US Letter' },
};
export const paper = (code) => PAPER[country(code).paper] || PAPER.A4;

export function photoDefault(code, hasPhoto) {
  return hasPhoto && country(code).photo === 'expected';
}

export const PHOTO_TEXT = {
  expected: 'A photo is customary here',
  optional: 'A photo is optional here',
  omit: 'Photos are not used here',
};
