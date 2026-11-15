// Every market and language renders and exports; the text rules behave as documented.
T.run('08-formats-and-rules', async () => {
  const { ok, eq, mod } = T;
  const store = await mod('store.js');
  const c = await mod('countries.js');
  const d = await mod('doclang.js');
  const pal = await mod('palettes.js');
  const { renderDoc } = await mod('docs/render.js');
  const { buildDocx } = await mod('docs/docx.js');
  const hz = await mod('humanizer.js');
  const u = await mod('util.js');
  const client = await mod('ai/client.js');
  const pipe = await mod('ai/pipeline.js');
  const prov = await mod('ai/providers.js');
  const base = await store.getApp(store.state.apps[0].id);
  if (!store.state.photo) await store.setPhoto(T.portrait());
  const xmlOk = (xml) => !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');

  // ---- all 26 markets, each in English and in one more language
  eq('26 markets and 7 languages are defined', [c.COUNTRIES.length, d.LANGS.length], [26, 7]);
  const problems = [];
  let renders = 0;
  for (let i = 0; i < c.COUNTRIES.length; i++) {
    const ct = c.COUNTRIES[i];
    for (const lang of ['en', d.LANGS[i % d.LANGS.length].code]) {
      const app = u.clone(base);
      Object.assign(app, { country: ct.code, language: lang });
      app.design = Object.assign({}, app.design, { photo: c.photoDefault(ct.code, true), palette: pal.PALETTES[i % pal.PALETTES.length].id, font: pal.FONTS[i % pal.FONTS.length].id, density: pal.DENSITY[i % pal.DENSITY.length].id });
      const tag = `${ct.code}/${lang}`;
      try {
        const cv = renderDoc(app, 'cv', { editable: false });
        const letter = renderDoc(app, 'letter', { editable: false });
        renders += 2;
        const cvText = cv.pages.map((p) => p.textContent).join(' ');
        if (!cv.count || !cvText.includes('Lena Brandt') || !cvText.includes('Hansa Freight')) problems.push(`${tag}: CV incomplete`);
        if (letter.count !== 1) problems.push(`${tag}: letter has ${letter.count} pages`);
        if (cv.count > 3) problems.push(`${tag}: CV has ${cv.count} pages`);
        if (ct.birth !== cvText.includes('2003')) problems.push(`${tag}: date of birth ${ct.birth ? 'missing' : 'shown'}`);
        const hasPhoto = cv.pages.some((p) => p.querySelector('img'));
        if (hasPhoto !== (ct.photo === 'expected')) problems.push(`${tag}: photo ${hasPhoto ? 'shown' : 'missing'} (${ct.photo})`);
        if (c.paper(ct.code).label !== (ct.paper === 'Letter' ? 'US Letter' : 'A4')) problems.push(`${tag}: paper`);
        for (const kind of ['cv', 'letter']) {
          const entries = u.unzip(await buildDocx(app, kind));
          const xml = new TextDecoder().decode(await entries.get('word/document.xml')());
          if (!xmlOk(xml) || !xml.includes('Lena Brandt')) problems.push(`${tag}: Word ${kind} broken`);
        }
      } catch (e) { problems.push(`${tag}: ${e.message}`); }
    }
  }
  eq('every market renders a CV and a one-page letter, and exports to Word', problems, []);
  eq('104 pages layouts were produced', renders, 104);
  const other = u.clone(base);
  Object.assign(other, { language: 'other', languageName: 'Swedish', country: 'SE', labels: null });
  ok('a language without built-in headings falls back to English ones', renderDoc(other, 'cv', {}).count >= 1 && d.docNames(other).cv.length > 0);
  eq('photo defaults follow the country', ['DE', 'US', 'GB', 'FR'].map((k) => c.photoDefault(k, true)), ['DE', 'US', 'GB', 'FR'].map((k) => c.country(k).photo === 'expected'));
  eq('an unknown country code means "international"', c.country('ZZ').code, 'XX');
  eq('language names are recognised in several spellings', ['German', 'Deutsch', 'pt-BR', 'Français', 'Klingon'].map((n) => d.normalizeLang(n).code), ['de', 'de', 'pt', 'fr', 'other']);
  eq('dates follow the document language', [d.period({ start: '2024-10', end: 'present' }, { country: 'DE', language: 'de' }), d.period({ start: '2022-06', end: '2024-08' }, { country: 'US', language: 'en' })], ['10/2024 - heute', 'Jun 2022 - Aug 2024']);

  // ---- text hygiene
  eq('dashes: ranges keep a hyphen, punctuation becomes a comma', [hz.sanitize('2020–2024'), hz.sanitize('Reports — monthly'), hz.sanitize('A -- B'), hz.sanitize('ends –.')], ['2020-2024', 'Reports, monthly', 'A, B', 'ends.']);
  eq('markdown left-overs are removed', [hz.sanitize('**Excel** and `SQL`'), hz.sanitize('- a bullet'), hz.sanitize('  two   spaces ')], ['Excel and SQL', 'a bullet', 'two spaces']);
  eq('Swiss German has no sharp s', [hz.sanitize('Grüße', { country: 'CH', lang: 'de' }), hz.sanitize('Grüße', { country: 'DE', lang: 'de' })], ['Grüsse', 'Grüße']);
  eq('file names are plain ASCII', [u.fileSlug('Müller & Söhne'), u.fileSlug('João Gonçalves'), u.fileSlug('Werkstudent (m/w/d) Finance'), u.fileSlug('')], ['Mueller_Soehne', 'Joao_Goncalves', 'Werkstudent_Finance', 'Document']);

  // ---- review rules
  const bad = u.clone(base);
  bad.cv.experience[0].bullets.push('Ich habe die Kosten um 37% gesenkt!');
  bad.cv.summary = 'Hochmotivierte Studentin bei [Company Name].';
  const q = hz.assess(bad, hz.sourcesFor(bad, store.memoryForAi()), { cvPages: 3, letterPages: 2 });
  const kinds = (k) => q.flags.filter((f) => f.kind === k).map((f) => f.match);
  ok('a figure that is not in the material is flagged', kinds('number').includes('37%'), kinds('number'));
  ok('figures that are in the material are not flagged', !kinds('number').some((n) => ['14', '300', '12.000', '1,8'].includes(n)), kinds('number'));
  ok('stock phrases, placeholders, exclamation marks and "I" in bullets are flagged', kinds('phrase').length === 1 && kinds('placeholder')[0] === '[Company Name]' && kinds('tone').length === 1 && kinds('pronoun')[0] === 'Ich', q.flags.map((f) => f.kind));
  ok('too many pages are reported for both documents', q.checks.some((x) => x.level === 'warn' && /CV: 3 pages/.test(x.title)) && q.checks.some((x) => /Cover letter: 2 pages/.test(x.title)), q.checks.map((x) => x.title));

  // ---- what the AI returns is normalised, never trusted
  eq('JSON is read from fenced, chatty or slightly broken answers', [
    client.parseJsonLoose('```json\n{"a":1}\n```'), client.parseJsonLoose('Sure! {"a":[1,2,],}'), client.parseJsonLoose('<think>x</think>{"a":"line\nbreak"}'), client.parseJsonLoose('no json here'),
  ], [{ a: 1 }, { a: [1, 2] }, { a: 'line\nbreak' }, null]);
  const an = pipe.normalizeAnalysis({ job: { title: 'Analyst (m/f/d)', countryCode: 'zz', language: 'Deutsch', address: ['[Street]', 'Am Kai 1'] }, requirements: [{ text: 'Excel', importance: 'Nice to have', status: 'Partially' }, { text: '' }], questions: ['One?', { question: 'Two?', why: 'w' }], keywords: ['Excel', 'Excel', ''] });
  eq('an analysis is cleaned up', [an.job.title, an.job.countryCode, an.job.language, an.job.address, an.requirements, an.questions.length, an.keywords],
    ['Analyst', 'XX', 'de', ['Am Kai 1'], [{ text: 'Excel', importance: 'nice', status: 'partial', evidence: '' }], 2, ['Excel']]);
  const cv = pipe.normalizeCv({ experience: [{ role: 'Analyst', bullets: 'First — point\nSecond point', start: '2024-01', end: 'present' }, { bullets: ['orphan'] }], skills: ['Excel', 'SQL'], languages: ['German (native)', { name: 'English', level: 'C1' }], interests: ['Rowing', 'Chess'] }, { country: 'DE', language: 'en' });
  eq('a CV in a loose shape is brought into the app\'s shape', [cv.experience.length, cv.experience[0].bullets, cv.skills, cv.languages, cv.interests],
    [1, ['First, point', 'Second point'], [{ label: '', items: 'Excel, SQL' }], [{ name: 'German', level: 'native' }, { name: 'English', level: 'C1' }], 'Rowing, Chess']);
  const letter = pipe.normalizeLetter({ recipient: 'Example AG\n[Street and number]\n8001 Zürich', subject: 'Betreff: Bewerbung als Analyst', salutation: 'Sehr geehrte Frau Meier,', body: 'Erster Absatz.\n\nZweiter Absatz.', signOff: 'Freundliche Grüße,' }, { country: 'CH', language: 'de' });
  eq('a letter follows the country conventions', [letter.recipient, letter.subject, letter.salutation, letter.paragraphs.length, letter.closing], [['Example AG', '8001 Zürich'], 'Bewerbung als Analyst', 'Sehr geehrte Frau Meier', 2, 'Freundliche Grüsse']);

  // ---- small machinery
  eq('the ZIP writer produces a valid checksum', u.crc32(u.utf8('123456789')), 0xCBF43926);
  const big = 'JobMech '.repeat(500);
  const z = u.unzip(await u.zip([{ name: 'a.txt', data: 'short' }, { name: 'dir/b.txt', data: big }]));
  eq('files survive a ZIP round trip', [new TextDecoder().decode(await z.get('a.txt')()), new TextDecoder().decode(await z.get('dir/b.txt')()) === big], ['short', true]);
  const before = store.state.memory.facts.length;
  eq('a fact already in memory is not stored twice', [store.addFacts('Test', [{ fact: store.state.memory.facts[0].fact.toUpperCase() + ' ' }]), store.state.memory.facts.length], [0, before]);
  eq('local model advice matches the hardware', [prov.localAdvice({ ramGb: 8, gpus: [] }), prov.localAdvice({ ramGb: 32, gpus: [{ name: 'NVIDIA GeForce RTX 4080', vramGb: 16 }] })].map((a) => [a.pick, a.weak]), [['gemma3:4b', true], ['mistral-small3.2', false]]);
  eq('provider errors are put in plain words', [402, 404, 429, 503].map((st) => prov.describeHttpError(st, '{"error":{"message":"x"}}', 'Acme').split('.')[0]),
    ['Acme says the account has no credit left', 'Acme does not know this model', 'Acme is rate limiting requests right now', 'Acme is having trouble at the moment (error 503)']);
});
