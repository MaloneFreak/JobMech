// JobMech 2 - application shell: start-up, theme, sidebar and navigation between views.
import * as store from './store.js';
import { state, statusOf } from './store.js';
import { h, ic, mount, toast, clear } from './ui.js';
import { app as hostApp } from './host.js';
import { activeConfig, readiness } from './ai/client.js';
import { country } from './countries.js';
import { relTime } from './util.js';

const views = {
  compose: () => import('./views/compose.js'),
  studio: () => import('./views/studio.js'),
  applications: () => import('./views/applications.js'),
  memory: () => import('./views/memory.js'),
  settings: () => import('./views/settings.js'),
};

const shell = { route: { name: 'compose' }, cleanup: null, query: '', aiOk: null };
const $side = document.getElementById('side');
const $view = document.getElementById('view');
const $app = document.getElementById('app');

// ---------------------------------------------------------------------------------- theme

export function applyTheme() {
  const pref = (state.settings && state.settings.theme) || 'system';
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('jm-theme', pref); } catch { /* private mode */ }
  const cs = getComputedStyle(document.documentElement);
  const hex = (v) => cs.getPropertyValue(v).trim();
  hostApp.theme(dark, hex('--surface-2'), hex('--ink')).catch(() => {});
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

// ---------------------------------------------------------------------------------- navigation

export async function navigate(name, params = {}) {
  if (shell.cleanup) {
    try { const ok = await shell.cleanup(); if (ok === false) return; } catch (e) { console.error(e); }
    shell.cleanup = null;
  }
  shell.route = { name, ...params };
  $app.classList.toggle('rail', name === 'studio');
  renderSide();
  clear($view);
  $view.style.animation = 'none';
  void $view.offsetWidth;
  $view.style.animation = '';
  try {
    const mod = await views[name]();
    shell.cleanup = (await mod.mount($view, params, { navigate, refreshAi })) || null;
  } catch (e) {
    console.error(e);
    hostApp.log('ERROR', `View ${name} failed: ${e && e.stack ? e.stack : e}`);
    mount($view, h('div.empty', h('div.ico', ic('alert', 22)), h('div.h2', 'This screen could not be opened'), h('p.mt-8', String(e && e.message ? e.message : e))));
  }
}

export async function refreshAi() {
  try { shell.aiOk = await readiness(); } catch { shell.aiOk = { ok: false, reason: '' }; }
  renderSide();
  return shell.aiOk;
}

export function openApp(id) {
  const s = state.apps.find((a) => a.id === id);
  if (!s) return;
  if (s.hasDocs) navigate('studio', { id });
  else navigate('compose', { id });
}

// ---------------------------------------------------------------------------------- sidebar

function renderSide() {
  const r = shell.route;
  const cfg = activeConfig();
  const navBtn = (name, icon, label, count) => h('button' + (r.name === name ? '.on' : ''), { onclick: () => navigate(name), title: label },
    ic(icon, 17), h('span', label), count != null ? h('span.count', String(count)) : null);

  const q = shell.query.trim().toLowerCase();
  const list = state.apps.filter((a) => !q || (a.title + ' ' + a.company).toLowerCase().includes(q));
  const items = list.map((a) => {
    const st = statusOf(a.status);
    return h('div.app-item' + (r.id === a.id ? '.on' : ''), { onclick: () => openApp(a.id), title: `${a.title}${a.company ? ' at ' + a.company : ''}` },
      h('span.dot' + (st.dot ? '.' + st.dot : '')),
      h('div.grow',
        h('div.t', a.title),
        h('div.s', h('span.ellipsis', a.company || country(a.country).name), h('span.code-badge', a.country === 'XX' ? 'INT' : a.country))));
  });

  const search = h('input.input.input-sm', { type: 'search', placeholder: 'Search', value: shell.query });
  search.addEventListener('input', () => { shell.query = search.value; renderSide(); const el = $side.querySelector('input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });

  const aiLabel = cfg.p ? cfg.p.name : 'AI not set up';
  const aiSub = cfg.p ? (cfg.model || 'no model chosen') : 'Click to choose an engine';
  const aiDot = shell.aiOk && shell.aiOk.ok ? 'ok' : 'warn';

  mount($side,
    h('div.brand', h('img', { src: 'assets/icon-256.png', alt: '' }), h('div.txt', h('div.name', 'JobMech'), h('div.ver', 'v' + (state.info.version || '2')))),
    h('div.side-pad', h('button.btn.btn-accent.btn-block.new-btn', { onclick: () => navigate('compose', { fresh: true }), title: 'New application' }, ic('plus', 16), h('span', 'New application'))),
    h('nav.nav',
      navBtn('applications', 'list', 'Applications', state.apps.length || null),
      navBtn('memory', 'database', 'Memory'),
      navBtn('settings', 'sliders', 'Settings')),
    h('div.side-label', h('span.eyebrow', 'Recent')),
    state.apps.length > 6 ? h('div.side-search', search) : null,
    h('div.app-list', items.length ? items : h('div.empty-list', state.apps.length ? 'No match.' : 'Your applications will appear here.')),
    h('div.side-foot',
      h('button.ai-chip', { onclick: () => navigate('settings', { tab: 'ai' }), title: shell.aiOk && !shell.aiOk.ok ? shell.aiOk.reason : 'AI engine' },
        h('span.dot.' + aiDot),
        h('div.txt.grow', h('div.a.ellipsis', aiLabel), h('div.b.ellipsis', aiSub)))));
}

// ---------------------------------------------------------------------------------- start-up

window.addEventListener('error', (e) => hostApp.log('JS', `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  if (r && r.name === 'AbortError') return;
  hostApp.log('JS', 'Unhandled: ' + (r && r.stack ? r.stack : r));
});
// a file dropped outside a drop zone must never replace the app
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

async function boot() {
  const bootEl = document.getElementById('boot');
  try {
    await store.init();
    applyTheme();
    store.subscribe((what) => { if (what === 'apps' || what === 'settings') renderSide(); });
    window.addEventListener('focus', () => { store.reloadMemory().catch(() => {}); });
    await refreshAi();

    if (state.migrated) {
      const m = state.migrated;
      setTimeout(() => toast(`Welcome to JobMech 2. Your ${m.apps} application${m.apps === 1 ? '' : 's'}, memory${m.photo ? ', photo' : ''}${m.key ? ' and API key' : ''} were carried over.`, { ms: 9000 }), 600);
    }

    if (!state.settings.onboarded) {
      const onb = await import('./views/onboarding.js');
      bootEl.remove();
      await onb.run({ refreshAi });
    } else {
      bootEl.remove();
    }
    await navigate('compose');
    window.__jobmechReady = true;
  } catch (e) {
    console.error(e);
    hostApp.log('FATAL', 'Boot failed: ' + (e && e.stack ? e.stack : e));
    const msg = document.getElementById('boot-msg');
    if (msg) { msg.textContent = 'JobMech could not start: ' + (e && e.message ? e.message : e); msg.style.color = 'var(--bad)'; }
    window.__jobmechReady = 'error';
  }
}

boot();
