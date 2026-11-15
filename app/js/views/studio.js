// The studio: paged preview of both documents, inline editing, review, AI refinements, design and export.
import { state, getApp, saveApp, removeApp, STATUSES, statusOf, memoryForAi } from '../store.js';
import { h, ic, mount, clear, toast, menu, confirmDialog, segmented, switchEl, field, busy } from '../ui.js';
import { renderDoc, markFlags, LAYOUT_SCALE } from '../docs/render.js';
import { assess, sourcesFor, sanitize } from '../humanizer.js';
import { country, family, COUNTRIES, PHOTO_TEXT, paper } from '../countries.js';
import { LANGS, docNames, langName } from '../doclang.js';
import { PALETTES, FONTS, DENSITY } from '../palettes.js';
import { exportDocs } from '../docs/export.js';
import { runGeneration, commitMemory } from './generate.js';
import { humanize, refine } from '../ai/pipeline.js';
import { readiness } from '../ai/client.js';
import { deepGet, deepSet, debounce, shortDate, isoDate, clone } from '../util.js';
import { fs } from '../host.js';

const MM = 96 / 25.4;
const SS = devicePixelRatio >= 1.5 ? 1 : 2;      // supersampling of the preview on low-density screens

export async function mount$(root, params, shell) {
  const app = await getApp(params.id);
  if (!app) { shell.navigate('applications'); return null; }
  if (!app.cv || !app.letter) { shell.navigate('compose', { id: app.id }); return null; }
  app.design = Object.assign({ palette: 'navy', font: 'calibri', density: 'normal', photo: false, signature: true }, app.design || {});

  const ui = { mode: 'cv', zoom: 'fit', tab: params.tab || 'review', quality: null, layout: {}, working: false };
  const persist = debounce(() => saveApp(app).catch((e) => toast(e.message, { type: 'bad' })), 450);

  // ------------------------------------------------------------------ frame
  const bar = h('div.studio-bar');
  const deskInner = h('div.desk-inner');
  const desk = h('div.desk', deskInner);
  const tabsEl = h('div.tabs');
  const body = h('div.insp-body');
  const inspector = h('div.inspector', tabsEl, body);
  const frame = h('div.studio', desk, inspector);
  mount(root, bar, frame);

  // ------------------------------------------------------------------ preview
  const sheetW = () => paper(app.country).w * MM;

  function applyZoom() {
    let z = ui.zoom;
    if (z === 'fit') {
      const avail = desk.clientWidth - 40;
      z = ui.mode === 'both' ? (avail - 22) / 2 / sheetW() : avail / sheetW();
      z = Math.min(1.12, Math.max(0.3, z));
    }
    // Pure visual scaling: the page keeps its real layout, so line breaks are identical to the PDF.
    // The page is drawn at twice the preview size and averaged down by the compositor (the "ss" layer),
    // which gives evenly spaced, smooth text on ordinary 100% displays.
    const pg = paper(app.country);
    const w0 = Math.round(pg.w * MM * z);
    const h0 = Math.round(pg.h * MM * z);
    for (const w of deskInner.querySelectorAll('.sheet-wrap')) {
      const ss = w.firstElementChild;
      const s = ss.firstElementChild;
      w.style.width = w0 + 'px';
      w.style.height = h0 + 'px';
      ss.style.width = (w0 * SS) + 'px';
      ss.style.height = (h0 * SS) + 'px';
      ss.style.transform = `scale(${1 / SS})`;
      s.style.transformOrigin = '0 0';
      s.style.transform = `scale(${(w0 * SS) / (pg.w * MM * LAYOUT_SCALE)})`;
    }
    for (const c of deskInner.querySelectorAll('.doc-col .cap')) c.style.width = Math.round(sheetW() * z) + 'px';
    ui.z = z;
  }

  function refresh({ keepScroll = true } = {}) {
    const top = desk.scrollTop;
    const cv = renderDoc(app, 'cv', { editable: true });
    const letter = renderDoc(app, 'letter', { editable: true });
    ui.layout = { cvPages: cv.count, letterPages: letter.count, cvFitted: cv.fitted, letterFitted: letter.fitted };
    ui.quality = assess(app, sourcesFor(app, memoryForAi()), ui.layout);
    for (const p of [...cv.pages, ...letter.pages]) markFlags(p, ui.quality.flags);
    const names = docNames(app);
    const col = (label, res) => h('div.doc-col',
      h('div.cap', h('span.eyebrow', label), h('span.tiny.muted', `${res.count} page${res.count > 1 ? 's' : ''}${res.fitted ? ' · fitted' : ''}`)),
      res.pages.map((p) => h('div.sheet-wrap', h('div.ss', p))));
    clear(deskInner);
    if (ui.mode !== 'letter') deskInner.appendChild(col(names.cv, cv));
    if (ui.mode !== 'cv') deskInner.appendChild(col(names.letter, letter));
    applyZoom();
    if (keepScroll) desk.scrollTop = top;
    renderInspector();
  }

  // inline editing: click any text on the page
  let editing = null;
  deskInner.addEventListener('mousedown', (e) => {
    const el = e.target.closest('[data-edit]');
    if (!el || el === editing) return;
    el.contentEditable = 'plaintext-only';
    el.dataset.orig = el.textContent;
    editing = el;
  });
  deskInner.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-edit]');
    if (!el) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const path = el.dataset.edit;
      if (!e.shiftKey && /\.(bullets|details|paragraphs)\.\d+$/.test(path) && el.textContent.trim()) {
        commit(el, { insertAfter: true });
      } else el.blur();
    } else if (e.key === 'Escape') {
      el.textContent = el.dataset.orig || '';
      el.blur();
    }
  });
  deskInner.addEventListener('focusout', (e) => {
    const el = e.target.closest('[data-edit]');
    if (el && el.isContentEditable) commit(el, {});
  });
  deskInner.addEventListener('paste', (e) => {
    const el = e.target.closest('[data-edit]');
    if (!el) return;
    e.preventDefault();
    const t = (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, t);
  });

  function commit(el, { insertAfter }) {
    if (!el.isConnected) return;
    const path = el.dataset.edit;
    const text = sanitize(el.textContent.replace(/\s+/g, ' '), { country: app.country, lang: app.language });
    el.contentEditable = 'false';
    editing = null;
    const isItem = /\.(bullets|details|paragraphs|recipient)\.\d+$/.test(path);
    const cut = path.lastIndexOf('.');
    let focusPath = null;
    if (text === (el.dataset.orig || '') && !insertAfter) { if (!text && isItem) { /* fall through: drop the empty item */ } else return; }
    if (path.endsWith('.period')) {
      const entry = deepGet(app, path.slice(0, -7));
      if (entry) { entry.period = text; entry.start = ''; entry.end = ''; }
    } else if (isItem) {
      const list = deepGet(app, path.slice(0, cut));
      const i = +path.slice(cut + 1);
      if (Array.isArray(list)) {
        if (!text) list.splice(i, 1);
        else {
          list[i] = text;
          if (insertAfter) { list.splice(i + 1, 0, ''); focusPath = `${path.slice(0, cut)}.${i + 1}`; }
        }
      }
    } else {
      deepSet(app, path, text);
    }
    persist();
    refresh();
    if (focusPath) {
      const n = deskInner.querySelector(`[data-edit="${focusPath}"]`);
      if (n) { n.contentEditable = 'plaintext-only'; n.dataset.orig = ''; editing = n; n.focus(); }
    }
  }

  function reveal(flag) {
    let el = flag.path ? deskInner.querySelector(`[data-edit="${flag.path}"]`) : null;
    if (!el && flag.altPath) el = deskInner.querySelector(`[data-edit="${flag.altPath}"]`);
    if (!el) {
      const want = flag.path && flag.path.startsWith('letter') ? 'letter' : 'cv';
      if (ui.mode !== want && ui.mode !== 'both') { ui.mode = want; renderBar(); refresh({ keepScroll: false }); return reveal(flag); }
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  // ------------------------------------------------------------------ top bar
  function renderBar() {
    const ct = country(app.country);
    const st = statusOf(app.status);
    const statusBtn = h('button.status-pill', { title: 'Change status' }, h('span.dot' + (st.dot ? '.' + st.dot : '')), st.label, ic('chevronDown', 12));
    statusBtn.addEventListener('click', () => menu(statusBtn, STATUSES.map((s) => ({
      label: s.label, icon: s.id === app.status ? 'check' : 'dots',
      onclick: () => { app.status = s.id; if (s.id === 'applied' && !app.appliedAt) app.appliedAt = isoDate(); saveApp(app); renderBar(); renderInspector(); },
    }))));

    const dl = h('button.btn.btn-accent', ic('download', 16), 'Download', ic('chevronDown', 14));
    dl.addEventListener('click', () => menu(dl, [
      { heading: 'PDF' },
      { label: 'CV and cover letter (2 files)', icon: 'download', hint: 'PDF', onclick: () => doExport('both', 'pdf') },
      { label: 'CV only', icon: 'fileText', hint: 'PDF', onclick: () => doExport('cv', 'pdf') },
      { label: 'Cover letter only', icon: 'mail', hint: 'PDF', onclick: () => doExport('letter', 'pdf') },
      { label: 'One combined file (letter + CV)', icon: 'layers', hint: 'PDF', onclick: () => doExport('combined', 'pdf') },
      { separator: true },
      { heading: 'Word' },
      { label: 'CV and cover letter (2 files)', icon: 'download', hint: 'DOCX', onclick: () => doExport('both', 'docx') },
      { label: 'CV only', icon: 'fileText', hint: 'DOCX', onclick: () => doExport('cv', 'docx') },
      { label: 'Cover letter only', icon: 'mail', hint: 'DOCX', onclick: () => doExport('letter', 'docx') },
    ], { align: 'right', width: 300 }));

    const more = h('button.btn.btn-icon.btn-ghost', { title: 'More' }, ic('more', 18));
    more.addEventListener('click', () => menu(more, [
      { label: 'Write both documents again', icon: 'refresh', onclick: regenerate },
      { label: 'Change answers and design', icon: 'edit', onclick: () => shell.navigate('compose', { id: app.id }) },
      { separator: true },
      { label: 'Delete this application', icon: 'trash', danger: true, onclick: del },
    ], { align: 'right' }));

    mount(bar,
      h('button.btn.btn-icon.btn-ghost', { title: 'All applications', onclick: () => shell.navigate('applications') }, ic('arrowLeft', 18)),
      h('div.ttl.grow',
        h('div.a', app.title || 'Application'),
        h('div.b', h('span.ellipsis', app.company || ''), h('span.code-badge', ct.code === 'XX' ? 'INT' : ct.code), h('span', app.language === 'other' ? app.languageName : langName(app.language)))),
      statusBtn,
      segmented([{ value: 'cv', label: 'CV' }, { value: 'letter', label: 'Letter' }, { value: 'both', label: 'Both', icon: 'columns' }], ui.mode, (v) => { ui.mode = v; refresh({ keepScroll: false }); }),
      h('div.seg',
        h('button', { title: 'Zoom out', onclick: () => { ui.zoom = Math.max(0.3, (ui.z || 1) - 0.1); applyZoom(); } }, ic('zoomOut', 14)),
        h('button' + (ui.zoom === 'fit' ? '.on' : ''), { title: 'Fit width', onclick: () => { ui.zoom = 'fit'; applyZoom(); renderBar(); } }, 'Fit'),
        h('button', { title: 'Zoom in', onclick: () => { ui.zoom = Math.min(1.6, (ui.z || 1) + 0.1); applyZoom(); } }, ic('zoomIn', 14))),
      dl, more);
  }

  async function doExport(kind, format) {
    if (editing) editing.blur();
    try {
      const r = await exportDocs(app, { kind, format });
      if (!r) return;
      const first = r.files[0];
      toast(r.files.length > 1 ? `Saved ${r.files.length} files to ${r.dirName}` : `Saved ${first.name}`, {
        action: { label: 'Show in folder', fn: () => fs.reveal(first.path).catch(() => {}) }, ms: 7000,
      });
      renderInspector();
    } catch (e) {
      toast(e.message || String(e), { type: 'bad' });
    }
  }

  async function regenerate() {
    const ready = await readiness();
    if (!ready.ok) { toast(ready.reason + ' Open Settings.', { type: 'bad', action: { label: 'Settings', fn: () => shell.navigate('settings', { tab: 'ai' }) } }); return; }
    const ok = await confirmDialog('Write both documents again?', 'The AI will write a new CV and cover letter from your memory and answers. Your manual edits to the current version will be replaced. The current version stays in History.', { ok: 'Write again' });
    if (!ok) return;
    if (await runGeneration(app)) { toast('Both documents were rewritten.'); refresh({ keepScroll: false }); renderBar(); }
  }

  async function del() {
    const ok = await confirmDialog('Delete this application?', `"${app.title}" and its documents will be removed from JobMech. Files you already saved elsewhere stay where they are.`, { ok: 'Delete', danger: true });
    if (!ok) return;
    await removeApp(app.id);
    shell.navigate('applications');
  }

  // ------------------------------------------------------------------ inspector
  function renderInspector() {
    const q = ui.quality || { checks: [], flags: [], coverage: [], stats: {} };
    const todo = q.flags.length;
    const tab = (id, label, n) => h('button' + (ui.tab === id ? '.on' : ''), { onclick: () => { ui.tab = id; renderInspector(); } }, label, n ? h('span.n.warn', String(n)) : null);
    mount(tabsEl, tab('review', 'Review', todo), tab('refine', 'Refine'), tab('design', 'Design'), tab('job', 'Job'));
    clear(body);
    if (ui.tab === 'review') reviewTab(q);
    else if (ui.tab === 'refine') refineTab();
    else if (ui.tab === 'design') designTab();
    else jobTab();
  }

  function reviewTab(q) {
    if (app.legacy) {
      body.appendChild(h('div.notice.info', ic('info', 16), h('div', h('b', 'Made with JobMech 1. '), 'It is shown in the new layout, but the text is the old one. Write it again to get the new country-specific writing and fact check.',
        h('div.mt-8', h('button.btn.btn-sm.btn-primary', { onclick: regenerate }, ic('refresh', 14), 'Write again')))));
    }
    const icon = { ok: 'check', warn: 'alert', bad: 'x' };
    body.appendChild(h('div.col.gap-12', q.checks.map((c) => h('div.qrow.' + c.level, h('div.st', ic(icon[c.level], 11)), h('div', h('div', { style: { fontWeight: 600 } }, c.title), h('div.d', c.detail))))));

    if (q.flags.length) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'Check these before sending'),
        h('div.col', q.flags.slice(0, 14).map((f) => h('div.issue', { onclick: () => reveal(f) }, h('div.w', f.message), h('div.x', f.path && f.path.startsWith('letter') ? 'In the cover letter. Click to show.' : 'In the CV. Click to show.'))))));
    }

    if ((app.editNotes || []).length) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'What the editor changed'),
        h('div.col.gap-4', app.editNotes.map((n) => h('div.small.soft', { style: { lineHeight: '1.45' } }, '· ' + n)))));
    }

    if (q.coverage.length) {
      body.appendChild(h('div', h('div.row.between.mb-8', h('span.eyebrow', 'Posting keywords'), h('span.tiny.muted', `${q.stats.keywordHits} of ${q.stats.keywordTotal} used`)),
        h('div.kw', q.coverage.map((c) => h('span.' + (c.hit ? 'hit' : 'miss'), { title: c.hit ? 'Appears in your documents' : 'Not used. Only add it if it is true for you.' }, c.k))),
        h('div.tiny.muted.mt-8', 'Dashed keywords are not in your documents. That is fine when you do not have that skill.')));
    }

    const hum = h('button.btn.btn-sm', ic('wand', 14), 'Humanize again');
    hum.addEventListener('click', async () => {
      const ready = await readiness();
      if (!ready.ok) { toast(ready.reason, { type: 'bad' }); return; }
      busy(hum, true, ' Editing');
      try {
        const before = { cv: clone(app.cv), letter: clone(app.letter) };
        const n = await humanize(app, {});
        if (n) { app.history = app.history || []; app.history.unshift({ at: new Date().toISOString(), label: 'Before humanizing', ...before }); app.history = app.history.slice(0, 8); }
        await saveApp(app);
        toast(n ? `The editor changed ${n} passage${n > 1 ? 's' : ''}.` : 'The editor found nothing to change.');
        refresh();
      } catch (e) { toast(e.message, { type: 'bad' }); busy(hum, false); }
    });

    const mem = h('div.card.card-pad');
    const pend = app.pending || {};
    const hasNew = (pend.facts || []).length || (pend.gaps || []).length || (app.answers || []).some((a) => a.state !== 'skipped' && (a.a || a.state === 'none'));
    if (app.memorySaved) mount(mem, h('div.row', h('span.dot.ok'), h('span.small', 'Your answers for this job are saved in memory.')));
    else if (hasNew) {
      const b = h('button.btn.btn-sm', ic('save', 14), 'Save to memory');
      b.addEventListener('click', async () => { busy(b, true); const r = await commitMemory(app); toast(`Saved to memory: ${r.facts} fact${r.facts === 1 ? '' : 's'}${r.gaps ? ', ' + r.gaps + ' gap' + (r.gaps === 1 ? '' : 's') : ''}.`); renderInspector(); });
      mount(mem, h('div.small.soft.mb-8', 'What you answered for this job is not in memory yet.'), b);
    } else mount(mem, h('div.small.muted', 'Nothing new to save to memory for this job.'));

    body.appendChild(h('div.row.wrap', hum));
    body.appendChild(mem);
  }

  function refineTab() {
    let target = ui.mode === 'letter' ? 'letter' : 'cv';
    const ta = h('textarea.textarea', { rows: 4, placeholder: 'Tell the AI what to change. For example: shorten the letter to three paragraphs, or put the Power BI work first.' });
    const status = h('div.tiny.muted', { style: { minHeight: '16px' } });
    const go = h('button.btn.btn-primary', ic('sparkles', 15), 'Apply change');
    const run = async (text) => {
      const instruction = (text || ta.value).trim();
      if (!instruction) { ta.focus(); return; }
      const ready = await readiness();
      if (!ready.ok) { toast(ready.reason, { type: 'bad' }); return; }
      busy(go, true, ' Working');
      const ctrl = new AbortController();
      try {
        const note = await refine(app, target, instruction, { signal: ctrl.signal, onStatus: (m) => { status.textContent = m === 'thinking' ? 'Thinking' : m; }, onDelta: () => { status.textContent = 'Rewriting'; } });
        await saveApp(app);
        ui.mode = ui.mode === 'both' ? 'both' : target;
        toast(note || 'Change applied.');
        ta.value = '';
        renderBar();
        refresh();
      } catch (e) {
        toast(e.message, { type: 'bad' });
        busy(go, false);
        status.textContent = '';
      }
    };
    go.addEventListener('click', () => run());
    const quick = target === 'letter'
      ? ['Make it shorter', 'More formal', 'More direct', 'Stronger opening', 'Mention my availability']
      : ['Tighten the bullets', 'Shorten to one page', 'Put the most relevant job first', 'Make the profile more concrete'];
    const seg = segmented([{ value: 'cv', label: 'CV' }, { value: 'letter', label: 'Cover letter' }], target, (v) => { target = v; ui.mode = ui.mode === 'both' ? 'both' : v; renderBar(); refresh({ keepScroll: false }); ui.tab = 'refine'; renderInspector(); });
    body.appendChild(h('div.col.gap-12',
      h('div.row.between', h('span.eyebrow', 'Change with AI'), seg),
      ta,
      h('div.quick', quick.map((qk) => h('button', { onclick: () => run(qk) }, qk))),
      h('div.row', go, status),
      h('div.tiny.muted', 'The AI keeps to your material: it will not add experience you do not have. You can also click any text on the page and type.')));

    const hist = app.history || [];
    if (hist.length) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'History'),
        h('div.col', hist.map((v, i) => h('div.issue', {
          onclick: async () => {
            const ok = await confirmDialog('Restore this version?', `Both documents go back to the state "${v.label}" (${shortDate(v.at)}). The current version is kept in History.`, { ok: 'Restore' });
            if (!ok) return;
            const cur = { at: new Date().toISOString(), label: 'Before restoring', cv: clone(app.cv), letter: clone(app.letter) };
            if (v.cv) app.cv = clone(v.cv);
            if (v.letter) app.letter = clone(v.letter);
            app.history.splice(i, 1);
            app.history.unshift(cur);
            await saveApp(app);
            refresh();
            toast('Version restored.');
          },
        }, h('div.w', v.label), h('div.x', new Date(v.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })))))));
    }
  }

  function designTab() {
    const ct = country(app.country);
    const d = app.design;
    const set = (k, v) => { d[k] = v; saveApp(app); refresh(); };

    const pal = h('div.swatches', PALETTES.map((p) => h('button.swatch' + (d.palette === p.id ? '.on' : ''), { onclick: () => set('palette', p.id), title: p.name },
      h('div.bars', h('i', { style: { background: p.primary } }), h('i', { style: { background: p.secondary } }), h('i', { style: { background: p.tint } })),
      h('div.nm', p.name))));
    const fnt = h('div.fontpick', FONTS.map((f) => h('button.fontopt' + (d.font === f.id ? '.on' : ''), { onclick: () => set('font', f.id) },
      h('div.s', { style: { fontFamily: f.headCss || f.css } }, 'Ag ', h('span', { style: { fontFamily: f.css, fontSize: '13px' } }, f.name)),
      h('div.n', f.note))));

    const photoNote = !state.photo ? 'Add a portrait in Memory to use it here.' : PHOTO_TEXT[ct.photo] + (ct.photo === 'omit' && d.photo ? '. Recruiters there may discard CVs with photos.' : '.');
    const photoSw = switchEl(d.photo && !!state.photo, (v) => set('photo', v), 'Photo on the CV');
    if (!state.photo) photoSw.querySelector('input').disabled = true;

    const countrySel = h('select.select', COUNTRIES.map((x) => h('option', { value: x.code, selected: x.code === app.country }, x.name)));
    countrySel.addEventListener('change', () => {
      app.country = countrySel.value;
      const nc = country(app.country);
      d.photo = !!state.photo && nc.photo === 'expected';
      saveApp(app); renderBar(); refresh({ keepScroll: false });
    });
    const langSel = h('select.select', [...LANGS.map((l) => h('option', { value: l.code, selected: l.code === app.language }, l.name)),
      app.language === 'other' ? h('option', { value: 'other', selected: true }, app.languageName || 'Other') : null]);
    langSel.addEventListener('change', () => {
      app.language = langSel.value;
      saveApp(app); renderBar(); refresh();
      toast('Headings switched. To translate the text itself, write the documents again.', { type: 'info', action: { label: 'Write again', fn: regenerate } });
    });
    const dateIn = h('input.input', { type: 'date', value: app.letterDate || isoDate() });
    dateIn.addEventListener('change', () => { app.letterDate = dateIn.value || isoDate(); saveApp(app); refresh(); });

    body.appendChild(h('div.col.gap-16',
      h('div', h('div.eyebrow.mb-8', 'Format'),
        h('div.card.card-pad',
          h('div.row.between.mb-8', h('span.h3', family(app.country).label), h('span.chip', paper(app.country).label)),
          ct.rules.map((r) => h('div.std', ic('check', 14), h('span', r))),
          h('div.grid-2.mt-12', field('Job country', countrySel), field('Document language', langSel)))),
      h('div', h('div.eyebrow.mb-8', 'Colour'), pal),
      h('div', h('div.eyebrow.mb-8', 'Font'), fnt),
      h('div', h('div.eyebrow.mb-8', 'Spacing'),
        segmented(DENSITY.map((x) => ({ value: x.id, label: x.label })), d.density || 'normal', (v) => set('density', v))),
      h('div.col.gap-12',
        h('div', photoSw, h('div.tiny.muted.mt-4', photoNote)),
        ct.signature ? switchEl(d.signature !== false, (v) => set('signature', v), 'Place, date and name at the end of the CV') : null,
        field('Date on the documents', dateIn))));
  }

  function jobTab() {
    const an = (app.job && app.job.analysis) || null;
    const statusSel = h('select.select', STATUSES.map((s) => h('option', { value: s.id, selected: s.id === app.status }, s.label)));
    statusSel.addEventListener('change', () => { app.status = statusSel.value; if (app.status === 'applied' && !app.appliedAt) app.appliedAt = isoDate(); saveApp(app); renderBar(); renderInspector(); });
    const applied = h('input.input', { type: 'date', value: app.appliedAt || '' });
    applied.addEventListener('change', () => { app.appliedAt = applied.value; persist(); });
    const url = h('input.input', { type: 'url', placeholder: 'https://', value: app.url || '' });
    url.addEventListener('input', () => { app.url = url.value.trim(); persist(); });
    const notes = h('textarea.textarea', { rows: 3, placeholder: 'Contact names, interview dates, salary range...' });
    notes.value = app.notes || '';
    notes.addEventListener('input', () => { app.notes = notes.value; persist(); });
    const titleIn = h('input.input', { value: app.title || '' });
    titleIn.addEventListener('change', () => { app.title = titleIn.value.trim() || app.title; saveApp(app); renderBar(); });
    const compIn = h('input.input', { value: app.company || '' });
    compIn.addEventListener('change', () => { app.company = compIn.value.trim(); saveApp(app); renderBar(); });

    body.appendChild(h('div.col.gap-12',
      h('div.grid-2', field('Status', statusSel), field('Applied on', applied)),
      field('Job title', titleIn), field('Company', compIn),
      field('Link to the posting', url), field('Notes', notes)));

    const files = (app.exports || []).slice(0, 6);
    if (files.length) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'Saved files'),
        h('div.col', files.map((f) => h('div.issue', { onclick: () => fs.reveal(f.path).catch((e) => toast(e.message, { type: 'bad' })) },
          h('div.w.ellipsis', f.name), h('div.x.ellipsis', `${shortDate(f.at)} · ${f.dir}`))))));
    }

    if (an && an.requirements && an.requirements.length) {
      const icon = { met: 'check', partial: 'minus', missing: 'x' };
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'What the job asks for'),
        h('div.card', { style: { padding: '2px 12px' } }, an.requirements.map((r) => h('div.req.' + r.status, h('div.st', ic(icon[r.status], 11)),
          h('div', h('span', r.text), r.importance === 'nice' ? h('span.tag', 'nice to have') : null, r.evidence ? h('div.ev', r.evidence) : null))))));
    }
    const qa = (app.answers || []).filter((a) => a.state !== 'skipped');
    if (qa.length) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'Your answers'),
        h('div.col.gap-12', qa.map((a) => h('div.small', h('div.muted', a.q), h('div.mt-4', a.state === 'none' ? 'I don\'t have this.' : a.a))))));
    }
    if (app.job && app.job.text) {
      body.appendChild(h('div', h('div.eyebrow.mb-8', 'Job posting'), h('div.pre.selectable', app.job.text)));
    }
  }

  // ------------------------------------------------------------------ go
  const onResize = debounce(() => { if (ui.zoom === 'fit') applyZoom(); }, 120);
  window.addEventListener('resize', onResize);
  renderBar();
  refresh({ keepScroll: false });
  if (state.settings.memory.autoSave !== false && !app.memorySaved && app.pending && ((app.pending.facts || []).length || (app.pending.gaps || []).length) && params.fresh) {
    commitMemory(app).then(() => renderInspector()).catch(() => {});
  }
  window.__studio = { app, refresh, ui };

  return async () => {
    window.removeEventListener('resize', onResize);
    if (editing) editing.blur();
    persist.flush();
    delete window.__studio;
  };
}

export { mount$ as mount };
