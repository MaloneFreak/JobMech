// Memory: everything JobMech knows about you. Profile, career story, verified facts and known gaps,
// all kept in data/memory.md so you (or any other AI tool) can read and edit it.
import { state, saveMemory, saveRawMemory, saveSettings, serializeMemory, reloadMemory } from '../store.js';
import { h, ic, mount, clear, toast, confirmDialog, promptDialog, switchEl, busy } from '../ui.js';
import { storyEditor, photoPicker, profileForm } from './parts.js';
import { tidyMemory } from '../ai/pipeline.js';
import { readiness } from '../ai/client.js';
import { addGaps } from '../store.js';
import { fs } from '../host.js';
import { uid, isoDate, debounce } from '../util.js';

export async function mount$(root, params) {
  await reloadMemory().catch(() => {});
  const ui = { tab: params.tab || 'profile' };
  const nav = h('div.subnav');
  const body = h('div.split-body');
  let leave = null;

  const tabs = [
    ['profile', 'user', 'Profile'],
    ['story', 'fileText', 'Career story'],
    ['facts', 'check', 'Facts and gaps'],
    ['file', 'file', 'memory.md'],
  ];

  function drawNav() {
    mount(nav, tabs.map(([id, icon, label]) => h('button' + (ui.tab === id ? '.on' : ''), { onclick: () => go(id) }, ic(icon, 16), label,
      id === 'facts' && (state.memory.facts.length + state.memory.gaps.length) ? h('span.n', String(state.memory.facts.length + state.memory.gaps.length)) : null)));
  }

  async function go(id) {
    if (leave) { await leave(); leave = null; }
    ui.tab = id;
    drawNav();
    clear(body);
    ({ profile, story, facts, file })[id]();
  }

  function profile() {
    const saved = h('span.tiny.muted');
    const form = profileForm(() => { saved.textContent = 'Saved'; setTimeout(() => { saved.textContent = ''; }, 1500); });
    const photo = photoPicker();
    leave = async () => form.flush();
    mount(body,
      h('div.section', h('div.row', h('div.h2', 'About you'), saved), h('div.desc', 'These details head your documents. JobMech shows or hides each one according to the country: a date of birth appears on a German CV, never on an American resume.'),
        h('div.card.card-pad', form.el)),
      h('div.section', h('div.card.card-pad', photo.el)));
  }

  function story() {
    const status = h('span.tiny.muted');
    const ed = storyEditor({ value: state.memory.story, onInput: () => { status.textContent = 'Not saved'; save(); } });
    const save = debounce(async () => { state.memory.story = ed.value.trim(); await saveMemory(); status.textContent = 'Saved'; }, 900);
    leave = async () => save.flush();
    ed.textarea.style.minHeight = '340px';
    mount(body,
      h('div.section', h('div.row', h('div.h2', 'Career story'), status),
        h('div.desc', 'The raw material for every application: paste CVs, old cover letters, or write freely. It does not need to be tidy or in one language. JobMech picks what fits each job and never sends this text anywhere except to the AI engine you chose.'),
        h('div.col', ed.textarea, ed.zone, ed.chips, ed.input)));
  }

  function facts() {
    const list = h('div.col');
    const gapsEl = h('div.gapchips');

    const drawFacts = () => {
      const fs_ = state.memory.facts;
      if (!fs_.length) { mount(list, h('div.small.muted', 'Nothing yet. When you answer questions for a job, the answers are kept here so you are never asked twice.')); return; }
      mount(list, fs_.map((f) => {
        const edit = h('button.btn.btn-icon.btn-sm.btn-ghost', { title: 'Edit' }, ic('edit', 14));
        const del = h('button.btn.btn-icon.btn-sm.btn-ghost', { title: 'Delete' }, ic('trash', 14));
        edit.addEventListener('click', async () => {
          const v = await promptDialog('Edit fact', { value: f.fact || f.a, multiline: true, hint: f.q ? 'Asked: ' + f.q : '' });
          if (v == null) return;
          if (f.fact || !f.q) f.fact = v.trim(); else f.a = v.trim();
          await saveMemory(); drawFacts();
        });
        del.addEventListener('click', async () => {
          state.memory.facts = state.memory.facts.filter((x) => x !== f);
          await saveMemory(); drawFacts(); drawNav();
        });
        return h('div.fact',
          h('div.f', f.fact || f.a), h('div.row.gap-4', edit, del),
          f.q ? h('div.ctx', f.fact ? `Asked: ${f.q} Answered: ${f.a}` : `Asked: ${f.q}`) : null,
          h('div.src', [f.label, f.date].filter(Boolean).join(' · ')));
      }));
    };

    const drawGaps = () => {
      mount(gapsEl, state.memory.gaps.length
        ? state.memory.gaps.map((g) => h('span.gapchip', g, h('button', { title: 'Remove', onclick: async () => { state.memory.gaps = state.memory.gaps.filter((x) => x !== g); await saveMemory(); drawGaps(); drawNav(); } }, ic('x', 12))))
        : h('div.small.muted', 'Nothing yet. When you say "I don\'t have this" to a question, it is listed here.'));
    };

    const addFact = h('button.btn.btn-sm', ic('plus', 14), 'Add a fact');
    addFact.addEventListener('click', async () => {
      const v = await promptDialog('Add a fact', { multiline: true, placeholder: 'For example: At Accenture I trained two new colleagues on the SAP invoice workflow.', ok: 'Add' });
      if (!v || !v.trim()) return;
      state.memory.facts.push({ id: uid('f'), label: 'Added by hand', date: isoDate(), fact: v.trim(), q: '', a: '' });
      await saveMemory(); drawFacts(); drawNav();
    });
    const addGap = h('button.btn.btn-sm', ic('plus', 14), 'Add a gap');
    addGap.addEventListener('click', async () => {
      const v = await promptDialog('Something you do not have', { placeholder: 'For example: No experience with SAP FI/CO', ok: 'Add' });
      if (!v || !v.trim()) return;
      addGaps([v.trim()]);
      await saveMemory(); drawGaps(); drawNav();
    });

    const raw = state.memory.facts.filter((f) => !f.fact && (f.q || f.a)).length;
    const tidy = h('button.btn.btn-sm', ic('wand', 14), `Tidy ${raw} raw answer${raw === 1 ? '' : 's'} with AI`);
    tidy.addEventListener('click', async () => {
      const ready = await readiness();
      if (!ready.ok) { toast(ready.reason, { type: 'bad' }); return; }
      busy(tidy, true, ' Tidying');
      try {
        const r = await tidyMemory({});
        const ng = addGaps(r.gaps || []);
        await saveMemory();
        toast(`Rewrote ${r.facts} answer${r.facts === 1 ? '' : 's'} as clear facts${ng ? ' and found ' + ng + ' gap' + (ng === 1 ? '' : 's') : ''}.`);
        go('facts');
      } catch (e) { toast(e.message, { type: 'bad' }); busy(tidy, false); }
    });

    mount(body,
      h('div.section', h('div.row', h('div.h2.grow', 'Verified facts'), raw ? tidy : null, addFact),
        h('div.desc', 'Things you confirmed while preparing applications. The AI may use them in any future CV or letter.'), list),
      h('div.section', h('div.row', h('div.h2.grow', 'Known gaps'), addGap),
        h('div.desc', 'Skills and experience you told JobMech you do not have. They are never claimed in a document, and you are not asked about them again.'), gapsEl));
    drawFacts(); drawGaps();
  }

  function file() {
    const path = state.info.dataDir + '\\memory.md';
    const ta = h('textarea.textarea.selectable.mono', { style: { minHeight: '330px', fontSize: '12px' }, spellcheck: 'false' });
    ta.value = serializeMemory();
    const saveBtn = h('button.btn.btn-primary.btn-sm', ic('save', 14), 'Save changes');
    saveBtn.addEventListener('click', async () => {
      const ok = await confirmDialog('Replace memory with this text?', 'JobMech will re-read the file. Keep the four "##" headings so it can find each part. The Profile block is rewritten from the Profile tab.', { ok: 'Save' });
      if (!ok) return;
      await saveRawMemory(ta.value);
      await saveMemory();
      ta.value = serializeMemory();
      drawNav();
      toast('memory.md saved.');
    });
    const auto = switchEl(state.settings.memory.autoSave !== false, async (v) => { state.settings.memory.autoSave = v; await saveSettings(); }, 'Always save new answers to memory');
    mount(body,
      h('div.section', h('div.h2', 'The memory file'),
        h('div.desc', 'One plain Markdown file holds everything on this screen. It is easy to back up, and easy for any AI assistant to read.'),
        h('div.card.card-pad.col.gap-12',
          h('div.row', h('span.mono.small.selectable.grow.ellipsis', path),
            h('button.btn.btn-sm', { onclick: () => fs.open(path).catch((e) => toast(e.message, { type: 'bad' })) }, ic('external', 14), 'Open'),
            h('button.btn.btn-sm', { onclick: () => fs.reveal(path).catch((e) => toast(e.message, { type: 'bad' })) }, ic('folder', 14), 'Show in folder')),
          auto,
          h('div.tiny.muted', 'When this is on, the "Save my answers to memory" switch is already ticked for every new application.'))),
      h('div.section', h('div.row', h('div.h2.grow', 'Edit as text'), saveBtn), ta));
  }

  mount(root,
    h('div.topbar', h('div.title.grow', h('div.display', 'Memory'), h('div.small.muted.mt-4', 'What JobMech knows about you. It stays on this computer.'))),
    h('div.split', nav, body));
  drawNav();
  await go(ui.tab);
  return async () => { if (leave) await leave(); };
}

export { mount$ as mount };
