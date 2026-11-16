// Applications: the tracker. Every application with its status, searchable, one click from its documents.
import { state, STATUSES, statusOf, getApp, saveApp, removeApp } from '../store.js';
import { h, ic, mount, clear, menu, confirmDialog, segmented, toast } from '../ui.js';
import { country } from '../countries.js';
import { langName } from '../doclang.js';
import { relTime, shortDate, isoDate } from '../util.js';

export async function mount$(root, params, shell) {
  const ui = { q: '', status: 'all' };
  const stats = h('div.stats');
  const tableWrap = h('div.card', { style: { overflow: 'hidden' } });

  const open = (a) => (a.hasDocs ? shell.navigate('studio', { id: a.id }) : shell.navigate('compose', { id: a.id }));

  async function setStatus(summary, id) {
    const app = await getApp(summary.id);
    if (!app) return;
    app.status = id;
    if (id === 'applied' && !app.appliedAt) app.appliedAt = isoDate();
    await saveApp(app);
    draw();
    if (id === 'interview' && !app.interview && app.cv && app.letter) {
      toast('An interview coming up? JobMech can prepare you for it.', { type: 'info', ms: 9000, action: { label: 'Prepare', fn: () => shell.navigate('studio', { id: app.id, tab: 'interview' }) } });
    }
  }

  async function del(a) {
    const ok = await confirmDialog('Delete this application?', `"${a.title}" and its documents will be removed from JobMech. Files you already saved elsewhere stay where they are.`, { ok: 'Delete', danger: true });
    if (!ok) return;
    await removeApp(a.id);
    toast('Application deleted.');
    draw();
  }

  function draw() {
    const apps = state.apps;
    const count = (id) => apps.filter((a) => a.status === id).length;
    mount(stats,
      [['All', apps.length], ['Ready to send', count('ready')], ['Applied', count('applied')], ['Interviews', count('interview')], ['Offers', count('offer')]]
        .map(([k, v]) => h('div.card.stat', h('div.eyebrow', k), h('div.v', String(v)))));

    const q = ui.q.trim().toLowerCase();
    const list = apps.filter((a) => (ui.status === 'all' || a.status === ui.status) && (!q || (a.title + ' ' + a.company + ' ' + country(a.country).name).toLowerCase().includes(q)));
    if (!apps.length) {
      mount(tableWrap, h('div.empty', h('div.ico', ic('briefcase', 22)), h('div.h2', 'No applications yet'),
        h('p.mt-8', 'Paste a job posting and JobMech writes the CV and cover letter for it.'),
        h('div.mt-16', h('button.btn.btn-accent', { onclick: () => shell.navigate('compose', { fresh: true }) }, ic('plus', 16), 'New application'))));
      return;
    }
    if (!list.length) { mount(tableWrap, h('div.empty', 'Nothing matches this filter.')); return; }

    const rows = list.map((a) => {
      const st = statusOf(a.status);
      const pill = h('button.status-pill', h('span.dot' + (st.dot ? '.' + st.dot : '')), st.label, ic('chevronDown', 12));
      pill.addEventListener('click', (e) => { e.stopPropagation(); menu(pill, STATUSES.map((s) => ({ label: s.label, icon: s.id === a.status ? 'check' : 'dots', onclick: () => setStatus(a, s.id) }))); });
      const more = h('button.btn.btn-icon.btn-sm.btn-ghost', { title: 'More' }, ic('more', 16));
      more.addEventListener('click', (e) => { e.stopPropagation(); menu(more, [
        { label: a.hasDocs ? 'Open documents' : 'Continue', icon: 'fileText', onclick: () => open(a) },
        { separator: true },
        { label: 'Delete', icon: 'trash', danger: true, onclick: () => del(a) },
      ], { align: 'right' }); });
      return h('tr', { onclick: () => open(a) },
        h('td', h('div', { style: { fontWeight: 600 } }, a.title), h('div.small.muted', a.company || '')),
        h('td', h('span.code-badge', a.country === 'XX' ? 'INT' : a.country), h('span.small.muted', { style: { marginLeft: '8px' } }, a.language === 'other' ? a.languageName : langName(a.language))),
        h('td', pill),
        h('td.small.muted.nowrap', shortDate(a.createdAt)),
        h('td.small.muted.nowrap', a.status === 'applied' && a.appliedAt ? 'Applied ' + shortDate(a.appliedAt) : relTime(a.updatedAt)),
        h('td', { style: { width: '40px' } }, more));
    });
    mount(tableWrap, h('table.table', h('thead', h('tr', ['Position', 'Market', 'Status', 'Created', 'Last change', ''].map((t) => h('th', t)))), h('tbody', rows)));
  }

  const search = h('input.input', { type: 'search', placeholder: 'Search position or company', style: { width: '260px' } });
  search.addEventListener('input', () => { ui.q = search.value; draw(); });
  const filter = segmented([{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s.id, label: s.label }))], 'all', (v) => { ui.status = v; draw(); });

  mount(root,
    h('div.topbar', h('div.title.grow', h('div.display', 'Applications')),
      h('button.btn.btn-accent', { onclick: () => shell.navigate('compose', { fresh: true }) }, ic('plus', 16), 'New application')),
    h('div.scroll', h('div.page.col.gap-16', stats, h('div.row.wrap', search, h('div.grow'), filter), tableWrap)));
  draw();
  return null;
}

export { mount$ as mount };
