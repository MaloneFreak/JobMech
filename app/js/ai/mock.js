// Offline test engine (only selectable in developer mode). Returns canned answers for a fictional
// candidate so the whole app can be exercised without any network call. Two flaws are planted on
// purpose (a dash and a stock phrase) to prove that the humanizer and the review catch them.

const ANALYSIS = {
  job: {
    title: 'Werkstudent Controlling & Reporting (m/w/d)', company: 'Nordwind Logistik GmbH', city: 'Hamburg', countryCode: 'DE', language: 'de',
    contactPerson: 'Katrin Albers', contactSalutation: 'Sehr geehrte Frau Albers,', reference: 'NW-2026-118', startDate: '01.01.2027', contract: 'Werkstudent, 20 Stunden pro Woche',
    address: ['Am Sandtorkai 41', '20457 Hamburg'],
  },
  requirements: [
    { text: 'Enrolled student in business or economics', importance: 'must', status: 'met', evidence: 'B.Sc. Wirtschaftsinformatik, 5th semester, Universität Hamburg' },
    { text: 'Advanced Excel including pivot tables', importance: 'must', status: 'met', evidence: 'Monthly cost reports in Excel with pivot tables at Hansa Freight' },
    { text: 'First experience with Power BI', importance: 'must', status: 'partial', evidence: 'One university project dashboard in Power BI' },
    { text: 'SAP FI/CO user knowledge', importance: 'nice', status: 'missing', evidence: '' },
    { text: 'German fluent, English good', importance: 'must', status: 'met', evidence: 'German native, English C1' },
    { text: 'Available 20 hours per week', importance: 'must', status: 'partial', evidence: 'Availability not stated' },
  ],
  questions: [
    { question: 'At Hansa Freight you built monthly cost reports. How many cost centres or shipments did they cover, and who used them?', why: 'Gives scale to the reporting requirement' },
    { question: 'Have you worked with SAP FI or CO, even as a user in a lecture or internship?', why: 'SAP FI/CO is listed as a plus' },
    { question: 'Can you work 20 hours per week from January 2027, and are you based in Hamburg?', why: 'Formal condition of the posting' },
  ],
  keywords: ['Controlling', 'Reporting', 'Excel', 'Pivot-Tabellen', 'Power BI', 'SAP FI/CO', 'Kostenstellen', 'Abweichungsanalyse', 'Monatsabschluss', 'KPI', 'Logistik', 'Werkstudent'],
  fit: 'Solid match on studies, Excel reporting and languages. The main risk is the missing SAP FI/CO practice and only one small Power BI project.',
};

const CV = {
  headline: 'Studentin der Wirtschaftsinformatik, Schwerpunkt Controlling',
  summary: 'Studentin der Wirtschaftsinformatik im 5. Semester mit zwei Jahren Praxis im Reporting eines Logistikunternehmens. Monatliche Kostenberichte in Excel für 14 Kostenstellen erstellt — erste Dashboards in Power BI aus einem Studienprojekt.',
  experience: [
    {
      role: 'Werkstudentin Finanzen', company: 'Hansa Freight Services GmbH', location: 'Hamburg, Deutschland', start: '2024-10', end: 'present', relevance: 'core',
      bullets: [
        'Monatliche Kostenberichte in Excel für 14 Kostenstellen erstellt, mit Pivot-Tabellen und SVERWEIS',
        'Abweichungen zwischen Plan und Ist je Kostenstelle aufbereitet und der Leiterin Controlling vorgelegt',
        'Hochmotiviert rund 300 Eingangsrechnungen pro Monat mit den Lieferscheinen abgeglichen',
        'Vorlage für den Wochenbericht überarbeitet, Bearbeitungszeit von etwa 3 Stunden auf 1 Stunde gesenkt',
      ],
    },
    {
      role: 'Aushilfe im Verkauf', company: 'Buchhandlung Seitenwind', location: 'Lübeck, Deutschland', start: '2022-06', end: '2024-08', relevance: 'other',
      bullets: ['Kundenberatung und Kassenabschluss an zwei Tagen pro Woche'],
    },
  ],
  education: [
    {
      degree: 'B.Sc. Wirtschaftsinformatik', institution: 'Universität Hamburg', location: 'Hamburg', start: '2024-10', end: '2027-09 (voraussichtlich)',
      details: ['Schwerpunkte: Controlling, Datenbanken, Business Intelligence', 'Studienprojekt: Power-BI-Dashboard zu Lieferzeiten mit 12.000 Datensätzen'],
    },
    { degree: 'Abitur', institution: 'Katharineum zu Lübeck', location: 'Lübeck', start: '2014-08', end: '2022-06', details: ['Abschlussnote 1,8'] },
  ],
  skills: [
    { label: 'Reporting und Daten', items: 'Excel (Pivot-Tabellen, SVERWEIS, Power Query), Power BI (Grundlagen), SQL (Grundlagen)' },
    { label: 'Werkzeuge', items: 'Microsoft 365, DATEV (Anwenderin), Confluence' },
  ],
  languages: [{ name: 'Deutsch', level: 'Muttersprache' }, { name: 'Englisch', level: 'C1' }, { name: 'Spanisch', level: 'A2' }],
  certifications: [{ name: 'Excel für Controller', issuer: 'IHK Hamburg', year: '2025' }],
  projects: [],
  extras: [{ label: 'Verfügbarkeit', text: 'Ab 01.01.2027, 20 Stunden pro Woche, wohnhaft in Hamburg' }],
  interests: '',
  facts: ['At Hansa Freight Services the monthly cost reports covered 14 cost centres and were used by the head of controlling.', 'Available for 20 hours per week from 1 January 2027 and living in Hamburg.'],
  gaps: ['No hands-on experience with SAP FI or CO'],
};

const LETTER = {
  recipient: ['Nordwind Logistik GmbH', 'Frau Katrin Albers', 'Am Sandtorkai 41', '20457 Hamburg'],
  subject: 'Bewerbung als Werkstudentin Controlling & Reporting, Referenz NW-2026-118',
  salutation: 'Sehr geehrte Frau Albers,',
  paragraphs: [
    'seit zwei Jahren erstelle ich bei Hansa Freight Services die monatlichen Kostenberichte für 14 Kostenstellen. Genau diese Arbeit, Zahlen aus der Logistik so aufzubereiten, dass das Controlling damit entscheiden kann, beschreibt Ihre Ausschreibung für das Team Controlling & Reporting.',
    'Die Berichte baue ich in Excel mit Pivot-Tabellen und Power Query. Für den Wochenbericht habe ich die Vorlage überarbeitet, sodass die Erstellung statt etwa drei Stunden noch eine Stunde dauert. Abweichungen zwischen Plan und Ist bereite ich je Kostenstelle auf und stelle sie der Leiterin Controlling vor. In einem Studienprojekt habe ich außerdem ein Power-BI-Dashboard zu Lieferzeiten mit 12.000 Datensätzen gebaut – mein erster Kontakt mit dem Werkzeug, das Sie für Ihr Reporting einsetzen.',
    'Mit SAP FI/CO habe ich bisher nicht gearbeitet. Ich kenne DATEV als Anwenderin und arbeite mich in neue Systeme zügig ein, wie zuletzt in Power Query.',
    'Ich bin an der Universität Hamburg im 5. Semester Wirtschaftsinformatik eingeschrieben, wohne in Hamburg und kann ab dem 1. Januar 2027 20 Stunden pro Woche arbeiten. Über ein Gespräch freue ich mich.',
  ],
  closing: 'Mit freundlichen Grüßen',
  enclosures: 'Anlagen: Lebenslauf',
};

// One note carries a dash on purpose, and one category is unknown: both must be cleaned up.
const INTERVIEW = {
  pitch: [
    'Wirtschaftsinformatik im 5. Semester an der Universität Hamburg, Schwerpunkt Controlling',
    'Seit zwei Jahren Werkstudentin bei Hansa Freight Services – monatliche Kostenberichte für 14 Kostenstellen',
    'Nordwind Logistik: gleiche Branche, Reporting in Power BI, das ich aus dem Studienprojekt kenne',
  ],
  questions: [
    { category: 'motivation', question: 'Warum möchten Sie zu Nordwind Logistik wechseln?', why: 'Ob die Bewerbung gezielt ist', points: ['Logistik kenne ich aus zwei Jahren bei Hansa Freight Services', 'Die Stelle verbindet Excel-Reporting mit Power BI, beides aus der Ausschreibung'] },
    { category: 'role', question: 'Wie gehen Sie bei einer Abweichungsanalyse vor?', why: 'Fachliches Verständnis der Kernaufgabe', points: ['Plan und Ist je Kostenstelle gegenübergestellt und der Leiterin Controlling vorgelegt', 'Grundlage waren die monatlichen Kostenberichte in Excel mit Pivot-Tabellen'] },
    { category: 'experience', question: 'Sie haben den Wochenbericht überarbeitet. Was genau haben Sie geändert?', why: 'Eigenanteil und Ergebnis prüfen', points: ['Vorlage neu aufgebaut, Erstellung von etwa 3 Stunden auf 1 Stunde gesenkt', 'Welche Schritte automatisiert wurden, vorher noch einmal durchgehen: das Material nennt sie nicht'] },
    { category: 'gap', question: 'Welche Erfahrung haben Sie mit SAP FI/CO?', why: 'Im Profil als Vorteil genannt', points: ['Ehrlich sagen: bisher nicht damit gearbeitet', 'DATEV als Anwenderin, zuletzt in Power Query eingearbeitet'] },
    { category: 'practical', question: 'Ab wann und in welchem Umfang können Sie anfangen?', why: 'Formale Bedingung der Stelle', points: ['Ab 1. Januar 2027, 20 Stunden pro Woche', 'Wohnhaft in Hamburg'] },
    { category: 'teamwork', question: 'Erzählen Sie von einer Situation, in der Sie unter Zeitdruck genau arbeiten mussten.', why: 'Sorgfalt im Monatsabschluss', points: ['Rund 300 Eingangsrechnungen pro Monat mit den Lieferscheinen abgeglichen', 'Ein konkretes Beispiel für einen gefundenen Fehler vorbereiten: das Material nennt keines'] },
  ],
  ask: ['Welche Kennzahlen laufen heute schon in Power BI, welche noch in Excel?', 'Wie ist das Team Controlling & Reporting aufgebaut?', 'Wie läuft die Einarbeitung in SAP FI/CO ab?'],
  watch: ['Auf die Frage nach SAP vorbereitet sein und nichts beschönigen', 'Pünktlich sein und die Unterlagen ausgedruckt mitbringen'],
};

const between = (text, a, b) => {
  const i = text.indexOf(a);
  if (i < 0) return '';
  const j = text.indexOf(b, i + a.length);
  return text.slice(i + a.length, j < 0 ? undefined : j).trim();
};

export function mockReply(o) {
  const task = o.task || '';
  if (task === 'ping') return 'OK';
  if (task === 'analysis') return JSON.stringify(ANALYSIS);
  if (task === 'cv') return JSON.stringify(CV);
  if (task === 'letter') return JSON.stringify(LETTER);
  if (task === 'interview') return JSON.stringify(INTERVIEW);
  if (task === 'edit') {
    let fields = {};
    try { fields = JSON.parse(between(o.user, 'to the cover letter.\n', '\n\nGo through every field')); } catch { /* ignore */ }
    const edits = {};
    for (const [k, v] of Object.entries(fields)) {
      if (/Hochmotiviert /.test(v)) edits[k] = v.replace(/Hochmotiviert rund/, 'Rund');
    }
    return JSON.stringify({ edits, notes: ['Removed the filler word "hochmotiviert" from a CV bullet: it added no fact.'] });
  }
  if (task === 'refine-cv' || task === 'refine-letter') {
    let doc = {};
    try { doc = JSON.parse(between(o.user, '(JSON)\n', '\n\nJOB POSTING (context)')); } catch { /* ignore */ }
    if (task === 'refine-letter' && Array.isArray(doc.paragraphs) && doc.paragraphs.length > 3) doc.paragraphs.splice(2, 1);
    if (task === 'refine-cv' && doc.summary) doc.summary = String(doc.summary).split('. ')[0] + '.';
    doc.note = task === 'refine-cv' ? 'Shortened the profile to one sentence.' : 'Removed the paragraph about SAP to shorten the letter.';
    return JSON.stringify(doc);
  }
  if (task === 'tidy') {
    let items = [];
    try { items = JSON.parse(between(o.user, 'raw answers.\n\n', '\n\nFor each item')); } catch { /* ignore */ }
    return JSON.stringify({ facts: items.map((it) => ({ id: it.id, fact: `Confirmed: ${String(it.a || '').slice(0, 140)}` })), gaps: [] });
  }
  return JSON.stringify({ note: 'mock' });
}
