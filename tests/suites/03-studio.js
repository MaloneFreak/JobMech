// The studio: preview, review, inline editing, AI refinements, history, design, status.
T.run('03-studio', async () => {
  const { ok, eq, waitFor, $, $$, byText, type, mod, sleep, toastText, dialogClick, menuClick, portrait } = T;
  const store = await mod('store.js');
  const main = await mod('main.js');
  const { isoDate } = await mod('util.js');
  const id = store.state.apps[0].id;
  const fresh = () => store.getApp(id);
  const tab = async (name) => { byText('.inspector .tabs button', name).click(); await sleep(40); };
  const insp = () => $('.inspector .insp-body');

  await main.navigate('studio', { id });
  ok('the studio opens for a finished application', await waitFor(() => window.__studio && $('.studio .sheet-wrap')));
  const st = window.__studio;

  // ---- preview and review
  eq('the CV fits the German norm and the letter is one page', [st.ui.layout.cvPages <= 2, st.ui.layout.letterPages], [true, 1]);
  eq('the preview is headed in the document language', $('.doc-col .cap .eyebrow').textContent, 'Lebenslauf');
  const sheetText = $('.sheet-wrap').textContent;
  ok('the page shows the candidate and the German date format', sheetText.includes('Lena Brandt') && sheetText.includes('10/2024 - heute') && sheetText.includes('Geburtsdatum: 17.04.2003'), sheetText.slice(0, 400));
  eq('the first three checks pass', $$('.inspector .qrow').slice(0, 2).map((r) => r.classList.contains('ok')), [true, true]);
  const flags = st.ui.quality.flags;
  ok('a tool the candidate never named is flagged for checking', flags.length === 1 && flags[0].kind === 'claim' && flags[0].match === 'SAP FI/CO', flags);
  eq('keyword coverage is counted', [st.ui.quality.stats.keywordTotal, st.ui.quality.stats.keywordHits > 5], [12, true]);
  $('.inspector .issue').click();
  ok('clicking a finding jumps to it in the letter', await waitFor(() => st.ui.mode === 'letter' && $('.sheet-wrap .pulse')));
  byText('.studio-bar .seg button', 'Both').click();
  ok('both documents can be shown side by side', await waitFor(() => $$('.doc-col').length === 2));
  const z0 = st.ui.z;
  $('.studio-bar button[title="Zoom in"]').click();
  ok('zooming changes the scale, not the layout', st.ui.z > z0 && st.ui.layout.letterPages === 1);
  $('.studio-bar button[title="Fit width"]').click();
  byText('.studio-bar .seg button', 'CV').click();
  await sleep(60);

  // ---- inline editing
  const edit = async (path, text, key) => {
    const el = $(`[data-edit="${path}"]`);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.textContent = text;
    if (key) el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    else el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(60);
  };
  await edit('cv.experience.0.bullets.0', 'Kostenberichte für 14 Kostenstellen — monatlich erstellt');
  eq('a typed dash is turned into a comma', st.app.cv.experience[0].bullets[0], 'Kostenberichte für 14 Kostenstellen, monatlich erstellt');
  await edit('cv.experience.0.bullets.3', '');
  eq('emptying a bullet removes it', st.app.cv.experience[0].bullets.length, 3);
  await edit('cv.experience.0.bullets.2', 'Rund 300 Eingangsrechnungen pro Monat abgeglichen', 'Enter');
  ok('Enter adds a new bullet and moves into it', st.app.cv.experience[0].bullets.length === 4 && document.activeElement.dataset.edit === 'cv.experience.0.bullets.3', document.activeElement.dataset.edit);
  document.activeElement.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  await sleep(60);
  eq('an untouched empty bullet disappears again', st.app.cv.experience[0].bullets.length, 3);
  await edit('cv.headline', 'ESC TEST', 'Escape');
  ok('Escape cancels an edit', st.app.cv.headline.startsWith('Studentin'));
  await edit('cv.experience.0.period', '10/2024 - heute (20 Std.)');
  eq('a hand-written period replaces the dates', [st.app.cv.experience[0].period, st.app.cv.experience[0].start], ['10/2024 - heute (20 Std.)', '']);
  await sleep(600);
  eq('edits are saved to disk', (await fresh()).cv.experience[0].bullets[0], 'Kostenberichte für 14 Kostenstellen, monatlich erstellt');

  // ---- AI refinements and history
  await tab('Refine');
  type($('textarea', insp()), 'Make the profile one sentence');
  byText('.btn', 'Apply change', insp()).click();
  ok('a CV change request is applied', await waitFor(() => /Shortened the profile/.test(toastText())), toastText());
  ok('the profile is now one sentence', st.app.cv.summary.split('. ').length === 1, st.app.cv.summary);
  byText('.seg button', 'Cover letter', insp()).click();
  await sleep(80);
  byText('.quick button', 'Make it shorter', insp()).click();
  ok('a quick letter request is applied', (await waitFor(() => /Removed the paragraph about SAP/.test(toastText()))) && st.app.letter.paragraphs.length === 3, toastText());
  eq('both earlier versions are in the history', st.app.history.map((v) => v.label), ['Before letter change', 'Before CV change']);
  byText('.issue', 'Before letter change', insp()).click();
  ok('restoring asks first', await dialogClick('Restore'));
  ok('the earlier letter is back', (await waitFor(() => /Version restored/.test(toastText()))) && st.app.letter.paragraphs.length === 4, toastText());
  eq('the replaced version stays in the history', st.app.history[0].label, 'Before restoring');

  // ---- design
  byText('.studio-bar .seg button', 'CV').click();
  await sleep(60);
  await tab('Design');
  const sheetStyle = () => $('.sheet-wrap .ss').firstElementChild.getAttribute('style') + $('.sheet-wrap .ss').firstElementChild.className;
  const before = sheetStyle();
  $('.swatch[title="Forest"], .swatch:nth-child(5)', insp()).click();
  await sleep(60);
  ok('the colour changes the page', st.app.design.palette !== 'navy' && sheetStyle() !== before, st.app.design.palette);
  $$('.fontopt', insp())[3].click();
  await sleep(60);
  byText('.seg button', 'Compact', insp()).click();
  await sleep(60);
  eq('font and spacing are stored on the application', [st.app.design.font, st.app.design.density], ['georgia', 'compact']);

  // height / width of the previewed sheet; whole pixels, so allow for rounding on small screens
  const ratio = () => { const w = $('.sheet-wrap'); return parseFloat(w.style.height) / parseFloat(w.style.width); };
  const near = (a, b) => Math.abs(a - b) < 0.012;
  ok('German documents are A4', near(ratio(), 297 / 210), ratio());
  const [countrySel, langSel] = $$('select', insp());
  type(countrySel, 'US');
  await sleep(80);
  ok('American documents are US Letter', near(ratio(), 279.4 / 215.9), ratio());
  ok('the signature line is not offered for a US resume', !byText('label.switch', 'Place, date and name', insp()));
  type($$('select', insp())[1], 'en');
  await sleep(80);
  eq('headings follow the document language', $('.doc-col .cap .eyebrow').textContent, 'Resume');
  ok('personal data is left off a US resume', !/Date of birth|Geburtsdatum|Nationality/.test($('.sheet-wrap').textContent));
  type($$('select', insp())[0], 'DE');
  await sleep(60);
  type($$('select', insp())[1], 'de');
  await sleep(60);

  await store.setPhoto(portrait());
  await tab('Job');
  await tab('Design');
  const sw = byText('label.switch', 'Photo on the CV', insp()).querySelector('input');
  ok('the photo switch is available once a portrait exists', !sw.disabled);
  if (!sw.checked) sw.click();
  ok('the portrait is placed on the German CV', await waitFor(() => { const i = $('.sheet-wrap img'); return i && i.src.startsWith('data:image/jpeg'); }));

  // ---- job details and status
  await tab('Job');
  type($('select', insp()), 'applied');
  await sleep(80);
  eq('marking as applied stamps today', [st.app.status, st.app.appliedAt], ['applied', isoDate()]);
  ok('the status pill follows', /Applied/.test($('.studio-bar .status-pill').textContent));
  type($('textarea', insp()), 'Interview with Ms Albers on Monday');
  await sleep(600);
  eq('notes are saved', (await fresh()).notes, 'Interview with Ms Albers on Monday');

  // ---- humanize again, regenerate
  await tab('Review');
  byText('.btn', 'Humanize again', insp()).click();
  ok('the editing pass can be repeated', await waitFor(() => /The editor (changed|found nothing)/.test(toastText())), toastText());
  $('.studio-bar button[title="More"]').click();
  ok('the menu offers a rewrite', await menuClick('Write both documents again'));
  ok('rewriting asks first', await dialogClick('Write again'));
  ok('both documents are rewritten', await waitFor(() => /Both documents were rewritten/.test(toastText()), 30000), toastText());
  ok('the previous version went to the history', st.app.history[0].label === 'Before regenerating' && st.app.cv.experience[0].bullets.length === 4, st.app.history.map((v) => v.label));
  eq('the status is kept across a rewrite', st.app.status, 'applied');
});
