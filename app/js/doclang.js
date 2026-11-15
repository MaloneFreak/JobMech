// Document languages: section headings, labels and date formats for the generated documents.
// The country decides the layout; this file decides the words printed on it.
import { country } from './countries.js';

export const LANGS = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'de', name: 'German', locale: 'de-DE' },
  { code: 'pt', name: 'Portuguese', locale: 'pt-BR' },
  { code: 'fr', name: 'French', locale: 'fr-FR' },
  { code: 'es', name: 'Spanish', locale: 'es-ES' },
  { code: 'it', name: 'Italian', locale: 'it-IT' },
  { code: 'nl', name: 'Dutch', locale: 'nl-NL' },
];

const NAME_TO_CODE = {
  english: 'en', englisch: 'en', inglês: 'en', ingles: 'en', anglais: 'en',
  german: 'de', deutsch: 'de', alemão: 'de', alemao: 'de', allemand: 'de',
  portuguese: 'pt', português: 'pt', portugues: 'pt', portugiesisch: 'pt',
  french: 'fr', français: 'fr', francais: 'fr', französisch: 'fr',
  spanish: 'es', español: 'es', espanol: 'es', spanisch: 'es',
  italian: 'it', italiano: 'it', italienisch: 'it',
  dutch: 'nl', nederlands: 'nl', niederländisch: 'nl',
};

/** Accepts "de", "de-CH", "German", "Deutsch" ... -> { code, name } ('other' keeps the given name). */
export function normalizeLang(v) {
  const raw = String(v || '').trim();
  const low = raw.toLowerCase();
  const short = low.slice(0, 2);
  if (LANGS.some((l) => l.code === low)) return { code: low, name: langName(low) };
  if (/^[a-z]{2}[-_]/.test(low) && LANGS.some((l) => l.code === short)) return { code: short, name: langName(short) };
  if (NAME_TO_CODE[low]) return { code: NAME_TO_CODE[low], name: langName(NAME_TO_CODE[low]) };
  if (!raw) return { code: 'en', name: 'English' };
  return { code: 'other', name: raw.charAt(0).toUpperCase() + raw.slice(1) };
}

export const langName = (code) => (LANGS.find((l) => l.code === code) || { name: 'English' }).name;

const L = {
  en: {
    cv: 'Curriculum Vitae', profile: 'Profile', experience: 'Professional Experience', experienceOther: 'Additional Experience',
    education: 'Education', skills: 'Skills', languages: 'Languages', certifications: 'Certifications', projects: 'Projects',
    additional: 'Additional Information', interests: 'Interests', personal: 'Personal Details', contact: 'Contact',
    references: 'References', refsOnRequest: 'References available on request.', objective: 'Objective',
    born: 'Date of birth', nationality: 'Nationality', permit: 'Work permit', address: 'Address', phone: 'Phone', email: 'Email',
    linkedin: 'LinkedIn', web: 'Website', present: 'Present', enclosures: 'Enclosures', subject: '', closing: 'Kind regards',
    salutation: 'Dear Hiring Team,', coverLetter: 'Cover Letter', page: 'Page',
  },
  de: {
    cv: 'Lebenslauf', profile: 'Profil', experience: 'Berufserfahrung', experienceOther: 'Weitere Berufserfahrung',
    education: 'Ausbildung', skills: 'Kenntnisse', languages: 'Sprachen', certifications: 'Zertifikate', projects: 'Projekte',
    additional: 'Weitere Angaben', interests: 'Interessen', personal: 'Persönliche Daten', contact: 'Kontakt',
    references: 'Referenzen', refsOnRequest: 'Referenzen auf Anfrage.', objective: 'Berufsziel',
    born: 'Geburtsdatum', nationality: 'Staatsangehörigkeit', permit: 'Aufenthaltstitel', address: 'Anschrift', phone: 'Telefon', email: 'E-Mail',
    linkedin: 'LinkedIn', web: 'Website', present: 'heute', enclosures: 'Anlagen', subject: '', closing: 'Mit freundlichen Grüßen',
    salutation: 'Sehr geehrte Damen und Herren,', coverLetter: 'Anschreiben', page: 'Seite',
  },
  pt: {
    cv: 'Currículo', profile: 'Resumo profissional', experience: 'Experiência profissional', experienceOther: 'Outras experiências',
    education: 'Formação acadêmica', skills: 'Competências', languages: 'Idiomas', certifications: 'Cursos e certificações', projects: 'Projetos',
    additional: 'Informações adicionais', interests: 'Interesses', personal: 'Dados pessoais', contact: 'Contato',
    references: 'Referências', refsOnRequest: 'Referências disponíveis mediante solicitação.', objective: 'Objetivo',
    born: 'Data de nascimento', nationality: 'Nacionalidade', permit: 'Autorização de trabalho', address: 'Endereço', phone: 'Telefone', email: 'E-mail',
    linkedin: 'LinkedIn', web: 'Site', present: 'atual', enclosures: 'Anexos', subject: '', closing: 'Atenciosamente',
    salutation: 'Prezados(as),', coverLetter: 'Carta de apresentação', page: 'Página',
  },
  fr: {
    cv: 'Curriculum Vitae', profile: 'Profil', experience: 'Expériences professionnelles', experienceOther: 'Autres expériences',
    education: 'Formation', skills: 'Compétences', languages: 'Langues', certifications: 'Certifications', projects: 'Projets',
    additional: 'Informations complémentaires', interests: "Centres d'intérêt", personal: 'Informations personnelles', contact: 'Contact',
    references: 'Références', refsOnRequest: 'Références disponibles sur demande.', objective: 'Objectif',
    born: 'Date de naissance', nationality: 'Nationalité', permit: 'Titre de séjour', address: 'Adresse', phone: 'Téléphone', email: 'E-mail',
    linkedin: 'LinkedIn', web: 'Site web', present: "aujourd'hui", enclosures: 'Pièces jointes', subject: 'Objet : ', closing: '',
    salutation: 'Madame, Monsieur,', coverLetter: 'Lettre de motivation', page: 'Page',
  },
  es: {
    cv: 'Curriculum Vitae', profile: 'Perfil profesional', experience: 'Experiencia profesional', experienceOther: 'Otra experiencia',
    education: 'Formación académica', skills: 'Competencias', languages: 'Idiomas', certifications: 'Cursos y certificaciones', projects: 'Proyectos',
    additional: 'Información adicional', interests: 'Intereses', personal: 'Datos personales', contact: 'Contacto',
    references: 'Referencias', refsOnRequest: 'Referencias disponibles a petición.', objective: 'Objetivo',
    born: 'Fecha de nacimiento', nationality: 'Nacionalidad', permit: 'Permiso de trabajo', address: 'Dirección', phone: 'Teléfono', email: 'Correo electrónico',
    linkedin: 'LinkedIn', web: 'Web', present: 'actualidad', enclosures: 'Adjuntos', subject: 'Asunto: ', closing: 'Atentamente',
    salutation: 'Estimados/as señores/as:', coverLetter: 'Carta de presentación', page: 'Página',
  },
  it: {
    cv: 'Curriculum Vitae', profile: 'Profilo', experience: 'Esperienza professionale', experienceOther: 'Altre esperienze',
    education: 'Istruzione e formazione', skills: 'Competenze', languages: 'Lingue', certifications: 'Certificazioni', projects: 'Progetti',
    additional: 'Informazioni aggiuntive', interests: 'Interessi', personal: 'Dati personali', contact: 'Contatti',
    references: 'Referenze', refsOnRequest: 'Referenze disponibili su richiesta.', objective: 'Obiettivo',
    born: 'Data di nascita', nationality: 'Nazionalità', permit: 'Permesso di lavoro', address: 'Indirizzo', phone: 'Telefono', email: 'E-mail',
    linkedin: 'LinkedIn', web: 'Sito web', present: 'presente', enclosures: 'Allegati', subject: 'Oggetto: ', closing: 'Cordiali saluti',
    salutation: 'Gentili Signori,', coverLetter: 'Lettera di presentazione', page: 'Pagina',
  },
  nl: {
    cv: 'Curriculum Vitae', profile: 'Profiel', experience: 'Werkervaring', experienceOther: 'Overige werkervaring',
    education: 'Opleiding', skills: 'Vaardigheden', languages: 'Talen', certifications: 'Certificaten', projects: 'Projecten',
    additional: 'Aanvullende informatie', interests: 'Interesses', personal: 'Persoonlijke gegevens', contact: 'Contact',
    references: 'Referenties', refsOnRequest: 'Referenties op aanvraag.', objective: 'Doel',
    born: 'Geboortedatum', nationality: 'Nationaliteit', permit: 'Werkvergunning', address: 'Adres', phone: 'Telefoon', email: 'E-mail',
    linkedin: 'LinkedIn', web: 'Website', present: 'heden', enclosures: 'Bijlagen', subject: 'Betreft: ', closing: 'Met vriendelijke groet',
    salutation: 'Geachte heer/mevrouw,', coverLetter: 'Motivatiebrief', page: 'Pagina',
  },
};

// Market-specific wording on top of the base language.
const VARIANT = {
  'en:us': { cv: 'Resume', profile: 'Summary', experience: 'Experience', skills: 'Skills', closing: 'Sincerely', permit: 'Work authorization', salutation: 'Dear Hiring Manager,' },
  'en:uk': { cv: 'Curriculum Vitae', profile: 'Personal Profile', experience: 'Career History', education: 'Education and Qualifications', skills: 'Key Skills', closing: 'Yours faithfully', permit: 'Right to work', salutation: 'Dear Hiring Manager,' },
  'en:dach': { experience: 'Professional Experience', closing: 'Kind regards', permit: 'Residence permit', salutation: 'Dear Sir or Madam,' },
  'de:CH': { closing: 'Freundliche Grüsse', salutation: 'Sehr geehrte Damen und Herren', permit: 'Aufenthaltsbewilligung' },
  'pt:PT': { cv: 'Curriculum Vitae', profile: 'Perfil profissional', education: 'Formação académica', contact: 'Contacto', present: 'presente', closing: 'Com os melhores cumprimentos', salutation: 'Exmos. Senhores,' },
  'fr:latin': {},
};

/** Labels for an application. app.labels (provided by the AI for unsupported languages) wins. */
export function labels(app) {
  const code = app.language || 'en';
  const ct = country(app.country);
  const base = Object.assign({}, L.en, L[code] || {});
  const keys = [code + ':' + ct.family, code + ':' + ct.code];
  if (code === 'en') keys.unshift('en:' + (ct.english === 'us' ? 'us' : ct.english === 'uk' ? 'uk' : ct.family));
  for (const k of keys) if (VARIANT[k]) Object.assign(base, VARIANT[k]);
  if (app.labels && typeof app.labels === 'object') {
    for (const [k, v] of Object.entries(app.labels)) if (typeof v === 'string' && v.trim() && k in base) base[k] = v.trim();
  }
  return base;
}

export const LABEL_KEYS = Object.keys(L.en);
export const englishLabels = () => Object.assign({}, L.en);

export function localeFor(app) {
  const code = app.language || 'en';
  const ct = country(app.country);
  if (code === 'en') return ct.english === 'us' ? 'en-US' : 'en-GB';
  if (code === 'de') return ct.code === 'CH' ? 'de-CH' : ct.code === 'AT' ? 'de-AT' : 'de-DE';
  if (code === 'pt') return ct.code === 'PT' ? 'pt-PT' : 'pt-BR';
  if (code === 'fr') return ct.code === 'CA' ? 'fr-CA' : 'fr-FR';
  if (code === 'other') return guessLocale(app.languageName) || 'en-GB';
  return (LANGS.find((l) => l.code === code) || {}).locale || 'en-GB';
}

function guessLocale(name) {
  const m = { swedish: 'sv-SE', danish: 'da-DK', norwegian: 'nb-NO', finnish: 'fi-FI', polish: 'pl-PL', czech: 'cs-CZ', japanese: 'ja-JP', turkish: 'tr-TR', romanian: 'ro-RO', hungarian: 'hu-HU', greek: 'el-GR' };
  return m[String(name || '').toLowerCase()] || null;
}

// ---- dates -----------------------------------------------------------------------------------

/** "2024-03" -> { y: 2024, m: 3 }, "2024" -> { y: 2024 }, anything else -> null */
export function parseYm(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (m) return { y: +m[1], m: +m[2] };
  m = /^(\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return { y: +m[2], m: +m[1] };
  m = /^(\d{4})$/.exec(s);
  if (m) return { y: +m[1] };
  return null;
}

const PRESENT_RE = /^(present|current|now|today|ongoing|heute|aktuell|laufend|atual|presente|actual|actualidad|aujourd'hui|en cours|oggi|heden|nu)$/i;

function fmtYm(ym, app) {
  if (!ym) return '';
  if (!ym.m) return String(ym.y);
  const fam = country(app.country).family;
  if (fam === 'us' || fam === 'uk' || fam === 'intl') {
    const d = new Date(ym.y, ym.m - 1, 1);
    let mon = new Intl.DateTimeFormat(localeFor(app), { month: 'short' }).format(d).replace(/\.$/, '');
    mon = mon.charAt(0).toUpperCase() + mon.slice(1);
    return mon + ' ' + ym.y;
  }
  return String(ym.m).padStart(2, '0') + '/' + ym.y;
}

/** Period text for a CV entry. Prefers structured start/end, falls back to the free-text period. */
export function period(entry, app, dash = ' - ') {
  if (!entry) return '';
  const s = parseYm(entry.start);
  const endRaw = String(entry.end == null ? '' : entry.end).trim();
  const e = parseYm(endRaw);
  const lbl = labels(app);
  if (!s) {
    const raw = String(entry.period || '').trim();
    return raw.replace(/\s*[–—]\s*/g, dash).replace(/\s+-\s+/g, dash);
  }
  const a = fmtYm(s, app);
  if (e) {
    const b = fmtYm(e, app);
    return a === b ? a : a + dash + b;
  }
  if (!endRaw) return a;
  if (PRESENT_RE.test(endRaw)) return a + dash + lbl.present;
  // "2027-09 (expected)": a planned end date with a short note
  const noted = /^(\d{4}(?:-\d{1,2})?)\s*\((.+)\)$/.exec(endRaw);
  if (noted && parseYm(noted[1])) return a + dash + fmtYm(parseYm(noted[1]), app) + ' (' + noted[2].trim() + ')';
  return a + dash + endRaw;
}

/** "13. November 2026", "November 13, 2026", "13 de novembro de 2026" ... */
export function longDate(dateIso, app) {
  const d = dateIso ? new Date(dateIso) : new Date();
  const loc = localeFor(app);
  try {
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Date line of a letter, with the sender's city where the market expects it. */
export function letterDateLine(dateIso, app, city) {
  const code = app.language || 'en';
  const fam = country(app.country).family;
  const date = longDate(dateIso, app);
  const town = String(city || '').trim();
  if (fam === 'us' || fam === 'uk') return date;
  if (!town) return date;
  if (code === 'fr') return town + ', le ' + date;
  if (code === 'es') return town + ', ' + date;
  return town + ', ' + date;
}

/** Short numeric date for the sign-off line of a German-style CV: 13.11.2026 */
export function shortDocDate(dateIso, app) {
  const d = dateIso ? new Date(dateIso) : new Date();
  const code = app.language || 'en';
  if (code === 'de') return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return longDate(dateIso, app);
}

/** Names of the two documents, used for file names and captions. */
export function docNames(app) {
  const l = labels(app);
  const code = app.language || 'en';
  const fam = country(app.country).family;
  const file = {
    en: [fam === 'us' ? 'Resume' : 'CV', 'Cover_Letter'],
    de: ['Lebenslauf', 'Anschreiben'],
    pt: ['Curriculo', 'Carta_de_Apresentacao'],
    fr: ['CV', 'Lettre_de_motivation'],
    es: ['CV', 'Carta_de_presentacion'],
    it: ['CV', 'Lettera_di_presentazione'],
    nl: ['CV', 'Motivatiebrief'],
  }[code] || ['CV', 'Cover_Letter'];
  return { cv: l.cv, letter: l.coverLetter, cvFile: file[0], letterFile: file[1] };
}
