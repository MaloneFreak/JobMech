// New application: (1) your background + the job posting, (2) fit, questions and design, then the documents.
import { state, newApp, getApp, saveApp, saveMemory, loadDraft, saveDraft, clearDraft } from '../store.js';
import { h, ic, mount, clear, toast, field, switchEl, busy } from '../ui.js';
import { storyEditor } from './parts.js';
import { analyzeJob } from '../ai/pipeline.js';
import { readiness } from '../ai/client.js';
import { COUNTRIES, country, family, paper, PHOTO_TEXT } from '../countries.js';
import { LANGS, langName } from '../doclang.js';
import { PALETTES, FONTS } from '../palettes.js';
import { runGeneration, commitMemory } from './generate.js';
import { debounce } from '../util.js';

function stepsEl(active) {
  const names = ['Job', 'Tailor', 'Documents'];
  const el = h('div.steps');
  names.forEach((n, i) => {
    if (i) el.appendChild(h('span.bar'));
    const cls = i + 1 === active ? '.on' : i + 1 < active ? '.done' : '';
    el.appendChild(h('div.step' + cls, h('span.n', i + 1 < active ? ic('check', 11) : String(i + 1)), n));
  });
  return el;
}

export async function mount$(root, params, shell) {
  const ctx = { app: null, jobText: '', country: 'auto', language: 'auto', busy: null, saveToMemory: state.settings.memory.autoSave !== false };

  if (params.id) {
    ctx.app = await getApp(params.id);
    if (ctx.app) { ctx.jobText = ctx.app.job.text || ''; }
  } else if (params.fresh) {
    await clearDraft().catch(() => {});
  } else {
    const d = await loadDraft();
    if (d) { ctx.jobText = d.jobText || ''; ctx.country = d.country || 'auto'; ctx.language = d.language || 'auto'; }
  }

  const persistDraft = debounce(() => { if (!ctx.app) saveDraft({ jobText: ctx.jobText, country: ctx.country, language: ctx.language }).catch(() => {}); }, 600);

  // ================================================================== step 1
  function stepOne() {
    const mem = state.memory;
    const story = storyEditor({ value: mem.story, onInput: () => markDirty() });
    const saved = h('span.tiny.muted');
    const saveBtn = h('button.btn.btn-sm', ic('save', 14), 'Save to memory');
    const badge = h('span.chip');
    const paint = () => {
      const n = story.value.trim().length;
      const dirty = story.value.trim() !== (state.memory.story || '').trim();
      badge.className = 'chip ' + (n < 80 ? 'chip-warn' : dirty ? 'chip-accent' : 'chip-ok');
      badge.textContent = n < 80 ? 'Empty' : dirty ? 'Not saved yet' : 'From memory';
      saveBtn.disabled = !dirty || n < 1;
      saved.textContent = n ? `${n.toLocaleString('en-GB')} characters${state.memory.facts.length ? ' · ' + state.memory.facts.length + ' saved facts' : ''}` : '';
    };
    const markDirty = () => paint();
    saveBtn.addEventListener('click', async () => {
      state.memory.story = story.value.trim();
      await saveMemory();
      paint();
      toast('Your background was saved to memory.');
    });

    const job = h('textarea.textarea.selectable', { placeholder: 'Paste the complete job posting here: title, company, tasks, requirements, location. The more of the original text, the better the match.', spellcheck: 'false' });
    job.value = ctx.jobText;
    job.addEventListener('input', () => { ctx.jobText = job.value; persistDraft(); });
    const countrySel = h('select.select.select-sm', h('option', { value: 'auto' }, 'Detect from the posting'), COUNTRIES.map((c) => h('option', { value: c.code, selected: c.code === ctx.country }, c.name)));
    countrySel.addEventListener('change', () => { ctx.country = countrySel.value; persistDraft(); });
    const langSel = h('select.select.select-sm', h('option', { value: 'auto' }, 'Same as the posting'), LANGS.map((l) => h('option', { value: l.code, selected: l.code === ctx.language }, l.name)));
    langSel.addEventListener('change', () => { ctx.language = langSel.value; persistDraft(); });

    const status = h('div.small.muted.grow.ellipsis');
    const go = h('button.btn.btn-accent', 'Analyze the job', ic('arrowRight', 16));
    const cancel = h('button.btn.btn-ghost.hidden', 'Cancel');

    go.addEventListener('click', async () => {
      const storyText = story.value.trim();
      const jobText = job.value.trim();
      if (storyText.length < 80) { toast('Tell JobMech about yourself first: paste your CV or attach a file on the left.', { type: 'bad' }); story.textarea.focus(); return; }
      if (jobText.length < 120) { toast('Paste the full job posting on the right.', { type: 'bad' }); job.focus(); return; }
      const ready = await readiness();
      if (!ready.ok) { toast(ready.reason, { type: 'bad', action: { label: 'Open Settings', fn: () => shell.navigate('settings', { tab: 'ai' }) } }); return; }

      state.memory.story = storyText;
      if (state.settings.memory.autoSave !== false) await saveMemory();
      paint();
      const ctrl = new AbortController();
      ctx.busy = ctrl;
      busy(go, true, ' Reading the posting');
      cancel.classList.remove('hidden');
      cancel.onclick = () => ctrl.abort();
      status.textContent = 'Comparing the posting with your background';
      try {
        const an = await analyzeJob(jobText, {
          signal: ctrl.signal,
          onStatus: (m) => { status.textContent = m === 'thinking' ? 'The model is thinking' : m; },
          onDelta: (t) => { status.textContent = 'Comparing the posting with your background · ' + Math.round(t.length / 5) + ' words'; },
        });
        const app = ctx.app || newApp();
        app.job = { text: jobText, analysis: an };
        app.title = an.job.title || 'Application';
        app.company = an.job.company;
        app.location = an.job.city;
        app.country = ctx.country !== 'auto' ? ctx.country : an.job.countryCode;
        app.language = ctx.language !== 'auto' ? ctx.language : an.job.language;
        app.languageName = app.language === 'other' ? an.job.languageName : '';
        app.answers = an.questions.map((q, i) => ({ id: 'q' + (i + 1), q: q.question, why: q.why, a: '', state: 'skipped' }));
        app.extraNotes = '';
        app.design.photo = !!state.photo && country(app.country).photo === 'expected';
        app.status = 'draft';
        await saveApp(app);
        await clearDraft().catch(() => {});
        ctx.app = app;
        stepTwo();
      } catch (e) {
        if (!(e && e.name === 'AbortError')) toast(e.message || String(e), { type: 'bad', action: e.kind === 'setup' || e.kind === 'auth' ? { label: 'Open Settings', fn: () => shell.navigate('settings', { tab: 'ai' }) } : null });
        busy(go, false);
        status.textContent = '';
        cancel.classList.add('hidden');
      } finally { ctx.busy = null; }
    });

    mount(root,
      h('div.topbar', h('div.title.grow', h('div.display', 'New application'), h('div.small.muted.mt-4', 'JobMech reads the posting, asks only what it needs, then writes a CV and cover letter in the format of the job\'s country.')), stepsEl(1)),
      h('div.compose',
        h('div.card.pane',
          h('div.card-head', h('div.h3', 'Your background'), badge),
          h('div.pane-body', story.textarea, story.zone, story.chips, story.input),
          h('div.pane-foot', saved, h('div.grow'), h('button.btn.btn-sm.btn-ghost', { onclick: () => shell.navigate('memory') }, 'Open memory'), saveBtn)),
        h('div.card.pane',
          h('div.card-head', h('div.h3', 'The job posting')),
          h('div.pane-body', job, h('div.grid-2', field('Country of the job', countrySel), field('Language of the documents', langSel))),
          h('div.pane-foot', status, cancel, go))));
    paint();
    if (!job.value) job.focus();
  }

  // ================================================================== step 2
  function stepTwo() {
    const app = ctx.app;
    const an = app.job.analysis || { requirements: [], questions: [], fit: '', job: {} };
    const save = debounce(() => saveApp(app).catch(() => {}), 500);

    // ---- job card
    const titleIn = h('input.input', { value: app.title });
    titleIn.addEventListener('input', () => { app.title = titleIn.value.trim(); save(); });
    const compIn = h('input.input', { value: app.company });
    compIn.addEventListener('input', () => { app.company = compIn.value.trim(); save(); });
    const countrySel = h('select.select', COUNTRIES.map((c) => h('option', { value: c.code, selected: c.code === app.country }, c.name)));
    const langSel = h('select.select', [...LANGS.map((l) => h('option', { value: l.code, selected: l.code === app.language }, l.name)),
      app.language === 'other' ? h('option', { value: 'other', selected: true }, app.languageName || 'Other') : null]);
    langSel.addEventListener('change', () => { app.language = langSel.value; save(); });

    const met = an.requirements.filter((r) => r.status === 'met').length;
    const part = an.requirements.filter((r) => r.status === 'partial').length;
    const miss = an.requirements.length - met - part;
    const total = Math.max(1, an.requirements.length);
    const icon = { met: 'check', partial: 'minus', missing: 'x' };
    const fit = an.requirements.length ? h('div.card.card-pad',
      h('div.row.between.mb-8', h('div.h3', 'How you match'), h('div.row.gap-12.tiny.muted', h('span', h('b', String(met)), ' met'), h('span', h('b', String(part)), ' partly'), h('span', h('b', String(miss)), ' open'))),
      h('div.fitbar', h('i.a', { style: { width: (met / total * 100) + '%' } }), h('i.b', { style: { width: (part / total * 100) + '%' } }), h('i.c', { style: { width: (miss / total * 100) + '%' } })),
      an.fit ? h('div.small.soft.mt-12', an.fit) : null,
      h('div.mt-8', an.requirements.map((r) => h('div.req.' + r.status, h('div.st', ic(icon[r.status], 11)),
        h('div', h('span', r.text), r.importance === 'nice' ? h('span.tag', 'nice to have') : null, r.evidence ? h('div.ev', r.evidence) : null))))) : null;

    // ---- questions
    const qCards = app.answers.map((a, i) => {
      const ta = h('textarea.textarea.selectable', { rows: 2, placeholder: 'Your answer, in any language. Facts and numbers help most.' });
      ta.value = a.a || '';
      const noneBtn = h('button.btn.btn-sm.btn-ghost', ic('ban', 14), 'I don\'t have this');
      const stateEl = h('div.state');
      const card = h('div.q');
      const paint = () => {
        card.classList.toggle('none', a.state === 'none');
        ta.disabled = a.state === 'none';
        noneBtn.classList.toggle('btn-primary', a.state === 'none');
        noneBtn.classList.toggle('btn-ghost', a.state !== 'none');
        clear(stateEl);
        if (a.state === 'none') stateEl.append(ic('check', 13), 'Understood. It will not be claimed, and JobMech will not ask again.');
        else if (a.state === 'answered') stateEl.append(ic('check', 13), 'Will be used');
        else stateEl.append('Optional. Leave empty to skip.');
      };
      ta.addEventListener('input', () => { a.a = ta.value; a.state = ta.value.trim() ? 'answered' : 'skipped'; paint(); save(); });
      noneBtn.addEventListener('click', () => { a.state = a.state === 'none' ? (ta.value.trim() ? 'answered' : 'skipped') : 'none'; paint(); save(); });
      mount(card, h('div.qh', h('span.qn', 'Q' + (i + 1)), h('div.grow', h('div.qt', a.q), a.why ? h('div.qw', a.why) : null)), ta, h('div.qa', noneBtn, h('div.grow'), stateEl));
      paint();
      return card;
    });
    const extra = h('textarea.textarea.selectable', { rows: 2, placeholder: 'Anything else the employer should know: why this company, a relevant project, your availability...' });
    extra.value = app.extraNotes || '';
    extra.addEventListener('input', () => { app.extraNotes = extra.value; save(); });

    // ---- design
    const formatCard = h('div.card.card-pad');
    const photoWrap = h('div');
    const paintFormat = () => {
      const ct = country(app.country);
      mount(formatCard,
        h('div.row.between.mb-8', h('span.h3', family(app.country).label), h('span.chip', paper(app.country).label)),
        ct.rules.map((r) => h('div.std', ic('check', 14), h('span', r))),
        !state.profile.street && ct.address ? h('div.notice.mt-12', ic('info', 16), h('div', 'Employers here expect a postal address. Add yours under Memory, Profile.')) : null);
      const sw = switchEl(app.design.photo && !!state.photo, (v) => { app.design.photo = v; save(); paintFormat(); }, 'Photo on the CV');
      if (!state.photo) sw.querySelector('input').disabled = true;
      const note = !state.photo ? 'No portrait saved yet. Add one under Memory, Profile.' : PHOTO_TEXT[ct.photo] + (ct.photo === 'omit' && app.design.photo ? '. Recruiters there may discard CVs with photos.' : '.');
      mount(photoWrap, sw, h('div.tiny.muted.mt-4', note));
    };
    countrySel.addEventListener('change', () => {
      app.country = countrySel.value;
      app.design.photo = !!state.photo && country(app.country).photo === 'expected';
      save(); paintFormat();
    });
    const pal = h('div.swatches');
    const paintPal = () => mount(pal, PALETTES.map((p) => h('button.swatch' + (app.design.palette === p.id ? '.on' : ''), { onclick: () => { app.design.palette = p.id; save(); paintPal(); }, title: p.name },
      h('div.bars', h('i', { style: { background: p.primary } }), h('i', { style: { background: p.secondary } }), h('i', { style: { background: p.tint } })), h('div.nm', p.name))));
    const fnt = h('div.fontpick');
    const paintFont = () => mount(fnt, FONTS.map((f) => h('button.fontopt' + (app.design.font === f.id ? '.on' : ''), { onclick: () => { app.design.font = f.id; save(); paintFont(); } },
      h('div.s', { style: { fontFamily: f.headCss || f.css } }, 'Ag ', h('span', { style: { fontFamily: f.css, fontSize: '13px' } }, f.name)), h('div.n', f.note))));
    paintFormat(); paintPal(); paintFont();

    // ---- actions
    const memSw = switchEl(ctx.saveToMemory, (v) => { ctx.saveToMemory = v; }, 'Save my answers to memory');
    const gen = h('button.btn.btn-accent.btn-lg', ic('sparkles', 17), app.cv ? 'Write the documents again' : 'Write my CV and cover letter');
    gen.addEventListener('click', async () => {
      const ready = await readiness();
      if (!ready.ok) { toast(ready.reason, { type: 'bad', action: { label: 'Open Settings', fn: () => shell.navigate('settings', { tab: 'ai' }) } }); return; }
      if (!app.title) app.title = 'Application';
      save.flush();
      app.memorySaved = false;
      const ok = await runGeneration(app);
      if (!ok) return;
      if (ctx.saveToMemory) { try { await commitMemory(app); } catch (e) { toast('Could not save to memory: ' + e.message, { type: 'bad' }); } }
      shell.navigate('studio', { id: app.id });
    });

    mount(root,
      h('div.topbar', h('div.title.grow', h('div.display.ellipsis', app.title || 'New application'), h('div.small.muted.mt-4.ellipsis', [app.company, app.location].filter(Boolean).join(' · ') || 'Check the details, answer what you can, choose the look.')), stepsEl(2)),
      h('div.tailor',
        h('div.tailor-main',
          h('div.card.card-pad', h('div.grid-2', field('Job title', titleIn), field('Company', compIn), field('Country of the job', countrySel, 'Decides the layout and the conventions.'), field('Language of the documents', langSel, 'The text is written in this language.'))),
          fit,
          h('div', h('div.row.between.mb-8', h('div.h2', qCards.length ? 'A few questions' : 'No questions this time'), qCards.length ? h('span.tiny.muted', 'Answer only what applies. Nothing is invented for the rest.') : null),
            qCards.length ? h('div.col.gap-12', qCards) : h('div.small.muted', 'Your memory already covers what this posting asks for.')),
          h('div', h('div.h3.mb-8', 'Anything to add for this application?'), extra)),
        h('div.tailor-side',
          h('div', h('div.eyebrow.mb-8', 'Format for ' + country(app.country).name), formatCard),
          photoWrap,
          h('div', h('div.eyebrow.mb-8', 'Colour'), pal),
          h('div', h('div.eyebrow.mb-8', 'Font'), fnt))),
      h('div.actionbar',
        h('button.btn.btn-ghost', { onclick: () => { ctx.jobText = app.job.text; stepOne(); } }, ic('arrowLeft', 16), 'Back'),
        h('div.grow'), memSw, gen));
  }

  if (ctx.app && ctx.app.job && ctx.app.job.analysis) stepTwo();
  else stepOne();

  return async () => { if (ctx.busy) ctx.busy.abort(); persistDraft.flush(); };
}

export { mount$ as mount };
