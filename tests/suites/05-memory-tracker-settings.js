// Memory screen, the application tracker and the settings.
T.run('05-memory-tracker-settings', async () => {
  const { ok, eq, waitFor, $, $$, byText, type, mod, sleep, toastText, dialogClick, menuClick } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const main = await mod('main.js');
  const sub = async (label) => { byText('.subnav button', label).click(); await sleep(80); };

  // ---- memory
  await main.navigate('memory');
  ok('the memory screen opens on the profile', await waitFor(() => $('.split-body .grid-2 input')));
  const nameInput = $('.split-body .grid-2 input');
  eq('the profile form shows the saved name', nameInput.value, 'Lena Brandt');
  type($$('.split-body .grid-2 input')[4], 'Beispielweg 9');
  ok('profile edits save by themselves', await waitFor(async () => ((await host.store.readJson('profile.json')) || {}).street === 'Beispielweg 9', 4000));
  ok('the profile block of memory.md follows', (await host.store.read('memory.md')).includes('- Address: Beispielweg 9, 20457 Hamburg'));

  await sub('Facts and gaps');
  const n0 = store.state.memory.facts.length;
  eq('every stored fact is listed', $$('.split-body .fact').length, n0);
  byText('.split-body .btn', 'Add a fact').click();
  type(await waitFor(() => $('.overlay textarea')), 'Presented the quarterly report to the management board in June 2025.');
  await dialogClick('Add');
  ok('a fact can be added by hand', await waitFor(() => store.state.memory.facts.length === n0 + 1 && $$('.split-body .fact').length === n0 + 1));
  byText('.split-body .btn', 'Add a gap').click();
  type(await waitFor(() => $('.overlay input')), 'No experience with Tableau');
  await dialogClick('Add');
  ok('a gap can be added by hand', await waitFor(() => store.state.memory.gaps.includes('No experience with Tableau')));
  byText('.gapchip', 'No experience with Tableau').querySelector('button').click();
  ok('a gap can be removed', await waitFor(() => !store.state.memory.gaps.includes('No experience with Tableau')));

  const strip = (m) => ({ story: m.story, gaps: m.gaps, facts: m.facts.map((f) => [f.label, f.date, f.fact, f.q, f.a]) });
  const md = store.serializeMemory();
  eq('memory.md reads back exactly as it was written', strip(store.parseMemory(md)), strip(store.state.memory));
  eq('the file on disk is that text', await host.store.read('memory.md'), md);

  await sub('memory.md');
  const ta = $('.split-body textarea');
  ta.value = ta.value.replace('## Known gaps', '## Known gaps\n- No driving licence');
  byText('.split-body .btn', 'Save changes').click();
  await dialogClick('Save');
  ok('the file can be edited as text', await waitFor(() => store.state.memory.gaps.includes('No driving licence')), toastText());

  const edited = (await host.store.read('memory.md')).replace('- No driving licence\n', '- No driving licence\n- No forklift licence\n');
  await host.store.write('memory.md', edited);
  ok('a change made in another editor is picked up', (await store.reloadMemory()) === true && store.state.memory.gaps.includes('No forklift licence'), store.state.memory.gaps);

  await sub('Career story');
  const story = $('.split-body textarea');
  type(story, story.value + '\nFührerschein Klasse B.');
  await sub('Profile');
  ok('the story is saved when leaving the tab', (await host.store.read('memory.md')).includes('Führerschein Klasse B.'));

  // attachments: a text file and a Word file made by the app itself are read back into the story
  const { storyEditor } = await mod('views/parts.js');
  const { buildDocx } = await mod('docs/docx.js');
  const ed = storyEditor({ value: '' });
  const appFull = await store.getApp(store.state.apps[0].id);
  await ed.addFiles([new File(['Plain notes about a summer job in 2021.'], 'notes.txt'), new File([await buildDocx(appFull, 'cv')], 'old-cv.docx')]);
  ok('attached text and Word files are appended to the story', ed.value.includes('--- From notes.txt ---') && ed.value.includes('--- From old-cv.docx ---') && ed.value.includes('Hansa Freight Services GmbH'), ed.value.slice(0, 200));
  await ed.addFiles([new File(['x'], 'scan.doc')]);
  ok('an unsupported file is refused in plain words', /old Word format/.test(toastText()), toastText());

  // ---- tracker
  const extra = store.newApp();
  extra.title = 'Throwaway application'; extra.company = 'Example AG';
  await store.saveApp(extra);
  await main.navigate('applications');
  ok('the tracker lists every application', await waitFor(() => $$('.table tbody tr').length === 2));
  eq('the counters add up', $$('.stats .stat .v').map((v) => v.textContent), ['2', '0', '1', '0', '0']);
  type($('.topbar ~ .scroll input[type=search]'), 'nordwind');
  eq('search narrows the list', $$('.table tbody tr').length, 1);
  type($('.topbar ~ .scroll input[type=search]'), 'zzz');
  ok('an empty result says so', /Nothing matches/.test($('.scroll').textContent));
  type($('.topbar ~ .scroll input[type=search]'), '');
  byText('.table tbody tr', 'Throwaway').querySelector('.status-pill').click();
  await menuClick('Interview');
  ok('the status can be changed from the list', await waitFor(() => store.state.apps.find((a) => a.id === extra.id).status === 'interview'));
  byText('.table tbody tr', 'Throwaway').querySelector('button[title="More"]').click();
  await menuClick('Delete');
  await dialogClick('Delete');
  ok('an application can be deleted', await waitFor(() => store.state.apps.length === 1 && $$('.table tbody tr').length === 1));
  eq('its file is gone', await host.store.exists(`applications/${extra.id}.json`), false);
  eq('the index on disk matches', (await host.store.readJson('applications/index.json')).map((a) => a.id), store.state.apps.map((a) => a.id));
  byText('.table tbody tr', 'Werkstudent').click();
  ok('a row opens its documents', await waitFor(() => window.__studio));

  // ---- settings
  await main.navigate('settings', { tab: 'look' });
  byText('.split-body .seg button', 'Dark').click();
  ok('the dark theme applies to the page and the title bar', await waitFor(async () => document.documentElement.dataset.theme === 'dark' && ((await host.store.readJson('window.json')) || {}).dark === true));
  byText('.split-body .seg button', 'Light').click();
  ok('and back to light', await waitFor(async () => document.documentElement.dataset.theme === 'light' && ((await host.store.readJson('window.json')) || {}).dark === false));
  await sub('Documents');
  type($('.split-body select'), 'teal');
  await sleep(80);
  eq('document defaults apply to the next application', store.newApp().design.palette, 'teal');
  type($('.split-body select'), 'navy');
  await sub('Local AI');
  ok('the local AI page reads this computer and finds out about Ollama', await waitFor(() => /GB memory/.test($('.split-body').textContent) && /Ollama is (running|installed but not running|not installed)/.test($('.split-body').textContent), 12000), $('.split-body').textContent.slice(0, 300));
  await sub('Data and about');
  ok('the data folder and version are shown', $('.split-body').textContent.includes(store.state.info.dataDir) && $('.split-body').textContent.includes('JobMech ' + store.state.info.version));
  await sub('AI engine');
  ok('the engine page shows the active engine', await waitFor(() => $('.provopt.on') && /Offline test engine/.test($('.provopt.on').textContent)));
});
