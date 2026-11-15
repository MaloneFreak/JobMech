// Starting JobMech 2 on a data folder written by JobMech 1 (tests\fixtures\v1).
T.run('09-migration-v1', async () => {
  const { ok, eq, throws, waitFor, $, mod, toastText } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const main = await mod('main.js');

  ok('the app starts straight into the composer, without the first-run guide', await waitFor(() => window.__jobmechReady === true && $('.compose') && !$('.onb')), String(window.__jobmechReady));
  eq('the migration reports what it carried over', store.state.migrated, { apps: 2, facts: 3, key: true, photo: true });
  ok('the user is told once', await waitFor(() => /Welcome to JobMech 2\. Your 2 applications, memory, photo and API key were carried over/.test(toastText()), 5000), toastText());

  // ---- the API key leaves the plain-text file
  const s = await host.store.readJson('settings.json');
  eq('engine, model and preferences are kept', [s.onboarded, s.ai.provider, s.ai.models.openrouter, s.docs.palette, s.memory.autoSave], [true, 'openrouter', 'example/free-model:free', 'teal', true]);
  eq('the key now lives in the encrypted store, tied to its provider', await host.secrets.info('openrouter'), { exists: true, hint: 'fix...2333', host: 'openrouter.ai' });
  const files = ['settings.json', 'profile.json', 'memory.md', 'backup-v1/profile.json', 'backup-v1/memory.md', 'backup-v1/applications.json'];
  const leaks = [];
  for (const f of files) if (((await host.store.read(f)) || '').includes('fixture-key-not-real')) leaks.push(f);
  eq('no readable file contains the key any more, not even the backup', leaks, []);
  eq('the backup keeps the other original files', [(await host.store.readJson('backup-v1/profile.json')).apiKey, (await host.store.readJson('backup-v1/applications.json')).length, await host.store.exists('backup-v1/photo.txt')], ['', 2, true]);
  await throws('a migrated key is still bound to its host', () => host.http({ url: 'http://127.0.0.1:9/', secret: 'openrouter' }), /will not be sent/);

  // ---- profile, photo, old files
  const p = store.state.profile;
  eq('the profile is mapped to the new fields', [p.fullName, p.headline, p.nationality, p.workPermit, p.website, 'apiKey' in p, 'setupCompleted' in p], ['Lena Brandt', 'Working Student Finance', 'German', 'EU citizen', 'https://example.com/lena', false, false]);
  ok('the portrait became a real image file', store.state.photo.startsWith('data:image/jpeg;base64,/9j/') && await host.store.exists('photo.jpg'));
  eq('the old files are gone', [await host.store.exists('photo.txt'), await host.store.exists('applications.json'), await host.store.exists('.port')], [false, false, false]);

  // ---- applications
  eq('both applications are listed, newest first', store.state.apps.map((a) => a.id), ['app_fixture_two', 'app_fixture_one']);
  const one = await store.getApp('app_fixture_one');
  eq('title, company, market, language and look are kept', [one.title, one.company, one.country, one.language, one.design.palette, one.design.photo, one.createdAt, one.status, one.legacy],
    ['Werkstudent Controlling (m/w/d)', 'Nordwind Logistik GmbH', 'DE', 'de', 'teal', true, '2026-11-10T12:00:00.000Z', 'ready', true]);
  eq('answers keep their state', one.answers.map((a) => [a.state, a.a]), [['answered', 'The reports covered 14 cost centres.'], ['skipped', ''], ['answered', 'I live in Hamburg and can work 20 hours per week.']]);
  eq('empty bullets and paragraphs are dropped', [one.cv.experience[0].bullets.length, one.letter.paragraphs.length], [2, 2]);
  eq('the old text fields are mapped', [one.cv.experience[0].period, one.cv.education[0].details, one.cv.skills, one.cv.extras, one.cv.languages.map((l) => l.name + ':' + l.level), one.letter.recipient, one.letter.closing],
    ['10/2024 - heute', ['Schwerpunkte: Controlling, Datenbanken'], [{ label: '', items: 'Excel, Power BI, SQL' }], [{ label: '', text: 'Verfügbar ab 01.01.2027' }], ['German:Native', 'English:C1', 'Spanish:A2'],
      ['Nordwind Logistik GmbH', 'Frau Katrin Albers', '20457 Hamburg'], 'Mit freundlichen Grüßen']);
  const two = await store.getApp('app_fixture_two');
  eq('an application without separate fields is split from its name', [two.title, two.company, two.country, two.language, two.design.photo, !isNaN(Date.parse(two.createdAt))], ['Junior Analyst', 'Example Corp', 'GB', 'en', false, true]);

  // ---- memory
  const m = store.state.memory;
  ok('the career story is kept word for word', m.story.startsWith('Werkstudentin Finanzen bei Hansa Freight') && m.story.endsWith('10/2024 bis 09/2027.'), m.story);
  eq('numbered answers get their question back, labelled answers keep theirs', m.facts.map((f) => [f.label, f.q, f.a, f.fact]), [
    ['Werkstudent Controlling (m/w/d) @ Nordwind Logistik GmbH', 'How many cost centres did your monthly reports cover?', 'The reports covered 14 cost centres.', ''],
    ['Werkstudent Controlling (m/w/d) @ Nordwind Logistik GmbH', 'Are you based in Hamburg and available 20 hours per week?', 'I live in Hamburg and can work 20 hours per week.', ''],
    ['Junior Analyst @ Example Corp', 'Do you have experience with SQL?', 'Yes, basic SELECT and JOIN queries in a university course.', ''],
  ]);
  const md = await host.store.read('memory.md');
  ok('memory.md is rewritten in the new layout', md.startsWith('# JobMech memory') && md.includes('## Profile\n- Name: Lena Brandt') && md.includes('## Career story') && md.includes('## Verified facts') && md.includes('## Known gaps') && !md.includes('Candidate Memory Bank'), md.slice(0, 300));

  // ---- the old documents open in the new studio
  for (const id of ['app_fixture_one', 'app_fixture_two']) {
    await main.navigate('studio', { id });
    ok(`${id} opens in the studio`, await waitFor(() => window.__studio && window.__studio.app.id === id && $('.studio .sheet-wrap')));
    ok(`${id} is marked as written by JobMech 1`, /Made with JobMech 1/.test($('.inspector').textContent));
    eq(`${id} lays out cleanly`, [window.__studio.ui.layout.cvPages, window.__studio.ui.layout.letterPages], [1, 1]);
  }
  ok('the German CV shows the migrated portrait', (await main.navigate('studio', { id: 'app_fixture_one' }), await waitFor(() => $('.sheet-wrap img'))));
  eq('a second start does not migrate again', await host.store.exists('settings.json'), true);
});
