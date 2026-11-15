// A new application from start to finish: analysis, questions, generation, memory.
T.run('02-compose-generate', async () => {
  const { ok, eq, waitFor, $, $$, byText, type, mod, sleep, toastText } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const hz = await mod('humanizer.js');
  const main = await mod('main.js');

  await main.navigate('compose', { fresh: true });
  ok('step 1 is shown', await waitFor(() => $('.compose')));
  const analyze = () => byText('.pane-foot .btn', 'Analyze the job');
  const job = $$('.compose textarea')[1];

  analyze().click();
  ok('an empty posting is refused with a clear message', await waitFor(() => /Paste the full job posting/.test(toastText())), toastText());
  eq('nothing was created', store.state.apps.length, 0);

  type(job, FIX.job);
  ok('the unfinished posting is kept as a draft', await waitFor(async () => ((await host.store.readJson('draft.json')) || {}).jobText === FIX.job, 4000));

  analyze().click();
  ok('step 2 opens after the analysis', await waitFor(() => $('.tailor')), toastText());
  eq('one application was created', store.state.apps.length, 1);
  const id = store.state.apps[0].id;
  let app = await store.getApp(id);
  eq('the job title loses its gender suffix', app.title, 'Werkstudent Controlling & Reporting');
  eq('company, country and language are detected', [app.company, app.country, app.language, app.status], ['Nordwind Logistik GmbH', 'DE', 'de', 'draft']);
  eq('the draft is cleared once the application exists', await host.store.exists('draft.json'), false);
  eq('three questions are asked', $$('.tailor .q').length, 3);
  eq('all six requirements are listed', $$('.tailor .req').length, 6);
  ok('the country format is explained', /Tabular CV/.test($('.tailor-side').textContent) && /A4/.test($('.tailor-side').textContent));

  const cards = $$('.tailor .q');
  type(cards[0].querySelector('textarea'), 'The reports covered 14 cost centres and were used by the head of controlling.');
  byText('button', "I don't have this", cards[1]).click();
  await sleep(700);
  app = await store.getApp(id);
  eq('answers are saved with their state', app.answers.map((a) => a.state), ['answered', 'none', 'skipped']);

  byText('.actionbar .btn', 'Write my CV and cover letter').click();
  ok('the progress dialog lists the three stages', await waitFor(() => $$('.overlay .gs').length === 3));
  ok('the studio opens when the documents are ready', await waitFor(() => window.__studio && $('.studio .sheet-wrap'), 30000), ($('.overlay') || { textContent: '' }).textContent.slice(0, 300));

  app = await store.getApp(id);
  eq('the CV has both positions and both degrees', [app.cv.experience.length, app.cv.education.length], [2, 2]);
  eq('the letter has four paragraphs', app.letter.paragraphs.length, 4);
  eq('the application is ready to send', [app.status, app.legacy, !!app.generatedAt], ['ready', false, true]);
  const fields = hz.textFields(app);
  const all = Object.values(fields).join('\n');
  ok('no em or en dash survives (the test engine plants two)', !/[‒-―]/.test(all), all.match(/.{0,30}[‒-―].{0,30}/));
  ok('the planted dashes became commas', app.cv.summary.includes('Kostenstellen erstellt, erste Dashboards') && app.letter.paragraphs[1].includes('gebaut, mein erster Kontakt'), app.cv.summary);
  ok('the editing pass removed the planted stock phrase', !/hochmotiviert/i.test(all) && app.cv.experience[0].bullets[2].startsWith('Rund 300'), app.cv.experience[0].bullets[2]);
  eq('the editor explains what it changed', (app.editNotes || []).length, 1);
  eq('the German closing has no comma', app.letter.closing, 'Mit freundlichen Grüßen');
  eq('the recipient block is complete', app.letter.recipient.length, 4);

  ok('new facts went to memory', store.state.memory.facts.some((f) => /14 cost centres/.test(f.fact)) && store.state.memory.facts.length === 2, store.state.memory.facts);
  eq('the gap is remembered', store.state.memory.gaps, ['No hands-on experience with SAP FI or CO']);
  ok('the application knows its answers are saved', app.memorySaved === true);
  const md = await host.store.read('memory.md');
  ok('memory.md lists the facts under the application', md.includes('### Nordwind Logistik GmbH · Werkstudent Controlling & Reporting') && md.includes('## Known gaps\n- No hands-on experience with SAP FI or CO'), md.slice(-700));
  ok('the sidebar lists the application', await waitFor(() => $$('.app-list .app-item').length === 1));
});
