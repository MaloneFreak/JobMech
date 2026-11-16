// First run on an empty data folder: the three-step guide, then the composer.
T.run('01-onboarding', async () => {
  const { ok, eq, waitFor, $, $$, byText, type, mod, sleep } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');

  ok('the first-run guide opens on an empty data folder', await waitFor(() => $('.onb')));
  eq('nothing is marked as set up yet', [store.state.settings.onboarded, store.state.settings.ai.provider], [false, '']);
  ok('developer mode offers the offline test engine', byText('.provopt', 'Offline test engine'));
  eq('all real providers are offered', ['OpenRouter', 'Google Gemini', 'Groq', 'Anthropic Claude', 'OpenAI', 'Mistral', 'Ollama', 'Custom endpoint'].filter((n) => !byText('.provopt', n)), []);

  const covered = $$('.provopt').filter((card) => {
    const tag = card.querySelector('.tag').getBoundingClientRect();
    const hit = (el) => { const r = el.getBoundingClientRect(); return tag.left < r.right && r.left < tag.right && tag.top < r.bottom && r.top < tag.bottom; };
    return hit(card.querySelector('.n')) || hit(card.querySelector('.d')) || tag.right > card.getBoundingClientRect().right;
  }).map((card) => card.querySelector('.n').textContent);
  eq('no tag covers the name or description of its engine', covered, []);

  byText('.onb-foot .btn', 'I already have JobMech data').click();
  ok('someone who used JobMech before can bring the data over right away', await waitFor(() => /Used JobMech before\?/.test(($('.overlay') || {}).textContent || '') && byText('.overlay .btn', 'Choose a data folder') && byText('.overlay .btn', 'Choose a backup file')));
  await T.dialogClick('Cancel');

  byText('.provopt', 'Offline test engine').click();
  ok('choosing an engine selects its model', await waitFor(() => store.state.settings.ai.models.mock === 'mock-writer'));
  byText('.onb-body .btn', 'Test connection').click();
  ok('the connection test reports the answer', await waitFor(() => /Connected\. The model answered "OK"/.test($('.onb-body').textContent)), $('.onb-body').textContent.slice(-200));

  byText('.onb-foot .btn', 'Continue').click();
  ok('step 2 asks for personal details', await waitFor(() => /About you/.test($('.onb-body .display').textContent)));
  const inputs = $$('.onb-body .grid-2 input.input');
  eq('the form has every profile field', inputs.length, FIX.profile.length);
  inputs.forEach((el, i) => type(el, FIX.profile[i]));
  byText('.onb-foot .btn', 'Continue').click();

  ok('step 3 asks for the background', await waitFor(() => /Your background/.test($('.onb-body .display').textContent)));
  type($('.onb-body textarea'), FIX.story);
  byText('.onb-foot .btn', 'Start using JobMech').click();
  ok('the guide closes and the app is ready', await waitFor(() => window.__jobmechReady === true && !$('.onb')), String(window.__jobmechReady));
  ok('the composer is the first screen', await waitFor(() => $('.compose')));

  const s = await host.store.readJson('settings.json');
  eq('settings.json records the choices', [s.onboarded, s.ai.provider, s.ai.models.mock, s.version], [true, 'mock', 'mock-writer', 2]);
  const p = await host.store.readJson('profile.json');
  eq('profile.json holds the details', [p.fullName, p.email, p.postalCity, p.birthDate, p.languages], [FIX.profile[0], FIX.profile[2], FIX.profile[5], FIX.profile[9], FIX.profile[12]]);
  const md = await host.store.read('memory.md');
  ok('memory.md holds the profile and the story', md.includes('## Profile') && md.includes('- Name: Lena Brandt') && md.includes('## Career story') && md.includes('Hansa Freight Services GmbH'), md.slice(0, 300));
  ok('memory.md never contains settings or keys', !/apiKey|secret/i.test(md));
  ok('the sidebar shows the engine as ready', await waitFor(() => $('.ai-chip .dot.ok')));
  ok('the story is pre-filled from memory', $('.compose textarea').value.includes('Hansa Freight'));
  await sleep(50);
});
