// One backup file out, and data in again: from a backup, from another data folder, from a JobMech 1 folder.
// This suite replaces the data several times and puts the original back at the end, so it runs last.
T.run('12-backup-restore', async () => {
  const { ok, eq, throws, waitFor, $, byText, mod, dialogClick, sleep } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const main = await mod('main.js');
  const u = await mod('util.js');
  const info = store.state.info;
  const out = info.dataDir + '\\dev-out';
  const id = store.state.apps[0].id;
  const zipNames = async (rel) => [...u.unzip(u.base64ToBytes(await host.store.readBinary(rel))).keys()];
  const snapshot = () => ({
    apps: store.state.apps.map((a) => a.id), name: store.state.profile.fullName, story: store.state.memory.story.length,
    facts: store.state.memory.facts.length, gaps: store.state.memory.gaps.slice(), engine: store.state.settings.ai.provider, photo: store.state.photo.length,
  });

  // ---- where the data lives
  eq('the window knows which kind of data folder it uses', [info.dataMode, /\\JobMech\\data$/.test(info.userDataDir), info.userDataDir !== info.dataDir], ['custom', true, true]);
  await main.navigate('settings', { tab: 'data' });
  ok('Settings explains the place and offers backup and restore', await waitFor(() => byText('.split-body .btn', 'Back up now') && byText('.split-body .btn', 'Restore') && /started with its own data folder/.test($('.split-body').textContent)));
  byText('.split-body .btn', 'Restore').click();
  ok('restoring first explains what happens and offers a file or a folder', await waitFor(() => /A copy of the current state is saved/.test(($('.overlay') || {}).textContent || '') && byText('.overlay .btn', 'Choose a backup file') && byText('.overlay .btn', 'Choose a data folder')));
  await dialogClick('Cancel');

  // ---- backup
  await host.secrets.set('keep-me', 'a-key-that-must-stay', 'api.example.com');
  const before = snapshot();
  const res = await host.data.exportBackup(out + '\\backup.zip');
  const names = await zipNames('dev-out/backup.zip');
  ok('the backup holds settings, profile, memory, portrait and the applications', ['settings.json', 'profile.json', 'memory.md', 'photo.jpg', 'applications/index.json', `applications/${id}.json`].every((n) => names.includes(n)), names);
  ok('API keys, window position, browser profile, logs and test output stay out', !names.some((n) => /^(\.webview|logs|backups|dev-out)\//.test(n) || /secrets\.dat|window\.json|\.part$/.test(n)), names);
  eq('the file count is reported', res.files, names.length);
  ok('entry names use forward slashes', !names.some((n) => n.includes('\\')));
  await throws('a backup cannot be written to a place the user never chose', () => host.data.exportBackup(info.baseDir + '\\stolen.zip'), /Choose where to save/);
  await throws('nor read from one', () => host.data.importFrom(info.baseDir + '\\app'), /Choose the backup file or folder first/);

  // ---- change things, then restore
  await store.removeApp(id);
  store.state.profile.fullName = 'Somebody Else';
  await store.saveProfile();
  store.state.memory.gaps.push('A gap added after the backup');
  await store.saveMemory();
  const restored = await host.data.importFrom(out + '\\backup.zip');
  await store.init();                                      // what the reload after a restore does
  eq('a restore brings everything back as it was', snapshot(), before);
  ok('the replaced state was saved to the backups folder first', /\\backups\\before-restore-\d{8}-\d{6}(-\d+)?\.zip$/.test(restored.safety) && await host.fs.exists(restored.safety), restored.safety);
  const safety = await zipNames('backups/' + restored.safety.split('\\').pop());
  ok('that safety copy holds the state from before the restore', safety.includes('profile.json') && !safety.includes(`applications/${id}.json`), safety);
  eq('saved API keys survive a restore', (await host.secrets.info('keep-me')).exists, true);

  // ---- things that are not backups
  await host.store.writeBinary('dev-out/not-a-backup.zip', u.bytesToBase64(await u.zip([{ name: 'holiday.txt', data: 'no JobMech data here' }])));
  await throws('a zip without JobMech data is refused', () => host.data.importFrom(out + '\\not-a-backup.zip'), /does not contain JobMech data/);
  await host.store.writeBinary('dev-out/broken.zip', btoa('this is not a zip file at all'));
  await throws('a damaged file is refused', () => host.data.importFrom(out + '\\broken.zip'), /not a readable backup/);
  await host.store.write('dev-out/empty-folder/readme.txt', 'nothing');
  await throws('a folder without JobMech data is refused', () => host.data.importFrom(out + '\\empty-folder'), /does not contain JobMech data/);
  eq('a refused import changes nothing', snapshot(), before);

  // ---- a hostile archive: paths that try to leave the folder, and files that belong to this PC
  const settingsText = await host.store.read('settings.json');
  await host.store.writeBinary('dev-out/hostile.zip', u.bytesToBase64(await u.zip([
    { name: 'wrapped/settings.json', data: settingsText },
    { name: 'wrapped/../../escaped.txt', data: 'x' },
    { name: 'wrapped/sub/../../../escaped-too.txt', data: 'x' },
    { name: 'wrapped/secrets.dat', data: 'not really keys' },
    { name: 'wrapped/window.json', data: '{"x":-9999}' },
    { name: 'wrapped/notes.txt', data: 'fine' },
  ])));
  const hostile = await host.data.importFrom(out + '\\hostile.zip');
  eq('data inside one folder of the archive is found; nothing is written outside the data folder', [hostile.files, await host.store.exists('notes.txt'), await host.fs.exists(info.dataDir + '\\..\\escaped.txt'), await host.fs.exists(info.dataDir + '\\..\\escaped-too.txt')], [2, true, false, false]);
  eq('an archive cannot replace the key store or the window position', [(await host.secrets.info('keep-me')).exists, ((await host.store.readJson('window.json')) || {}).x !== -9999], [true, true]);

  // ---- another JobMech copy: the user picked the program folder of a JobMech 1 copy
  await host.store.write('dev-out/old-copy/data/profile.json', JSON.stringify({ setupCompleted: true, fullName: 'Old Copy User', title: 'Analyst', aiProvider: 'groq', aiModel: 'some-model', apiKey: 'fixture-key-not-real-777', nationality: 'Dutch/EU citizen', languages: 'Dutch (Native)' }));
  await host.store.write('dev-out/old-copy/data/memory.md', '# JobMech Candidate Memory Bank\n\n## Base CV & Natural Language Career Story\nFive years as an analyst in Utrecht.\n');
  await host.store.write('dev-out/old-copy/data/applications.json', JSON.stringify([{ id: 'app_old_one', name: 'Analyst @ Old Corp', countryCode: 'NL', docLanguage: 'Dutch', createdAt: '2026-10-01', cv: { experience: [{ role: 'Analyst', company: 'Old Corp', bullets: ['Built reports'] }] }, coverLetter: { paragraphs: ['Hello.'] } }]));
  const old = await host.data.importFrom(out + '\\old-copy');
  await store.init();
  eq('the data folder inside it is found and converted from JobMech 1', [old.files, store.state.migrated && store.state.migrated.apps, store.state.profile.fullName, store.state.profile.nationality, store.state.apps.map((a) => a.id), store.state.settings.ai.provider], [3, 1, 'Old Copy User', 'Dutch', ['app_old_one'], 'groq']);
  eq('its plain-text key moved into the key store and out of the files', [(await host.secrets.info('groq')).exists, ((await host.store.read('profile.json')) + (await host.store.read('backup-v1/profile.json'))).includes('fixture-key-not-real')], [true, false]);
  eq('keys that were already saved are still there', (await host.secrets.info('keep-me')).exists, true);

  // ---- put the original back
  await host.data.importFrom(out + '\\backup.zip');
  await store.init();
  eq('the original data is back for good', snapshot(), before);
  await host.secrets.remove('keep-me');
  await host.secrets.remove('groq');
  const safeties = (await host.store.list('backups')).map((f) => f.name);
  ok('every replaced state has its own safety copy', safeties.length === 4 && safeties.every((n) => /^before-restore-/.test(n)), safeties);
  await main.navigate('compose');
  await sleep(30);
});
