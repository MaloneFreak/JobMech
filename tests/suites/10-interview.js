// Interview preparation for an application: likely questions with the candidate's own material to answer them.
T.run('10-interview', async () => {
  const { ok, eq, waitFor, $, $$, byText, type, mod, sleep, toastText } = T;
  const store = await mod('store.js');
  const main = await mod('main.js');
  const pipe = await mod('ai/pipeline.js');
  const prompts = await mod('ai/prompts.js');
  const id = store.state.apps[0].id;
  const insp = () => $('.inspector .insp-body');
  const tab = async (name) => { byText('.inspector .tabs button', name).click(); await sleep(40); };

  await main.navigate('studio', { id });
  ok('the studio opens', await waitFor(() => window.__studio && $('.studio .sheet-wrap')));
  const st = window.__studio;
  const statusBefore = st.app.status;

  // ---- the hint when an application reaches the interview stage
  await tab('Job');
  type($('select', insp()), 'interview');
  ok('reaching the interview stage offers the preparation', await waitFor(() => /can prepare you for it/.test(toastText())), toastText());
  byText('.toast .act', 'Prepare').click();
  ok('the offer opens the Interview tab', await waitFor(() => st.ui.tab === 'interview' && /Invited to an interview\?/.test(insp().textContent)));
  eq('the preparation defaults to the language of the documents', $('select', insp()).value, 'de');
  ok('all five tabs fit in the inspector', (() => { const t = $('.inspector .tabs'); return t.scrollWidth <= t.clientWidth + 1; })());

  // ---- preparing
  byText('.btn', 'Prepare me for the interview', insp()).click();
  ok('the preparation is written', await waitFor(() => /Your interview preparation is ready/.test(toastText()), 20000), toastText());
  const prep = st.app.interview;
  eq('pitch, questions, own questions and tips are all there', [prep.pitch.length, prep.questions.length, prep.ask.length, prep.watch.length], [3, 6, 3, 2]);
  ok('no dash survives (the test engine plants one)', !/[‒-―]/.test(JSON.stringify(prep)) && prep.pitch[1].includes('Hansa Freight Services, monatliche'), prep.pitch[1]);
  eq('categories are known ones, an unknown one becomes "experience"', prep.questions.map((q) => q.category), ['motivation', 'role', 'experience', 'gap', 'practical', 'experience']);
  eq('language and date are recorded', [prep.language, prep.generatedAt.slice(0, 4) >= '2026'], ['de', true]);
  eq('every question is shown with its notes', [$$('.prep-q .t', insp()).length, $$('.prep-q.gap', insp()).length, $$('.prep-q .prep-list li', insp()).length], [6, 1, 3 + 12 + 3 + 2]);
  ok('the weak spot is marked as one', /Weak spot/.test($('.prep-q.gap', insp()).textContent) && /SAP FI\/CO/.test($('.prep-q.gap', insp()).textContent));
  eq('the preparation is saved with the application', (await store.getApp(id)).interview.questions.length, 6);

  // ---- text for copying
  const text = pipe.interviewText(st.app);
  ok('the plain-text version has every part', text.startsWith('Interview preparation: Werkstudent Controlling & Reporting at Nordwind Logistik GmbH') && ['TELL ME ABOUT YOURSELF', 'LIKELY QUESTIONS', '1. Warum möchten Sie', '   Why they ask: ', '   - ', 'QUESTIONS YOU CAN ASK', 'KEEP IN MIND'].every((x) => text.includes(x)), text.slice(0, 300));

  // ---- again, in another language
  type($('select', insp()), 'en');
  byText('.btn', 'Prepare again', insp()).click();
  ok('it can be prepared again in another language', await waitFor(() => st.app.interview.language === 'en' && /Prepared .* English/.test(insp().textContent), 20000), toastText());

  // ---- what the AI is told
  const p = prompts.interviewPrompt(st.app, store.memoryForAi(), 'en');
  ok('the coach knows the market and the truth rules', p.system.includes('job interviews in Germany') && p.system.includes('GROUND RULES') && p.system.includes('Known gaps are off limits'));
  ok('the request names the language, the posting, the open requirements and the known gaps',
    p.user.includes('WRITE IN: clear international English with British spelling') && p.user.includes('Werkstudent Controlling & Reporting (m/w/d)') &&
    p.user.includes('[missing] SAP FI/CO user knowledge') && p.user.includes('[partial] First experience with Power BI') && p.user.includes('KNOWN GAPS') && p.user.includes('No hands-on experience with SAP FI or CO'), p.user.slice(0, 400));
  ok('the employer\'s view (profile and letter) is included', p.user.includes('WHAT THE EMPLOYER HAS ALREADY READ') && p.user.includes(st.app.letter.paragraphs[0].slice(0, 40)));

  // ---- loose answers are brought into shape
  const n = pipe.normalizeInterview({ pitch: 'one\ntwo', questions: ['Just a question?', { category: 'Behavioral', question: 'Tell me — when?', points: 'a\nb' }, { question: '' }], ask: null, watch: ['**bold** tip'] }, {});
  eq('strings, missing parts and other spellings are accepted', n, {
    pitch: ['one', 'two'],
    questions: [{ category: 'experience', question: 'Just a question?', why: '', points: [] }, { category: 'behavioural', question: 'Tell me, when?', why: '', points: ['a', 'b'] }],
    ask: [], watch: ['bold tip'],
  });

  await tab('Job');
  type($('select', insp()), statusBefore);
  await sleep(80);
  eq('the status is put back', st.app.status, statusBefore);
});
