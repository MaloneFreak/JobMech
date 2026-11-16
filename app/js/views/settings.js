// Settings: AI engine (cloud or local), local model manager, document defaults, appearance, data.
import { state, saveSettings } from '../store.js';
import { h, ic, mount, clear, toast, confirmDialog, switchEl, segmented, field, busy } from '../ui.js';
import { PROVIDERS, baseUrl, hostOf, listModels, LOCAL_MODELS, localAdvice } from '../ai/providers.js';
import { ping } from '../ai/client.js';
import { secrets, http, app as hostApp, fs, call } from '../host.js';
import { PALETTES, FONTS, DENSITY } from '../palettes.js';
import { applyTheme } from '../main.js';
import { backupNow, bringOver, dataPlaceText } from './dataio.js';
import { checkForUpdate, available } from '../update.js';

/** Runs an action from a button and reports a failure instead of leaving the click without effect. */
async function guard(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), { type: 'bad' }); }
  btn.disabled = false;
}

// ---------------------------------------------------------------------------------- new versions

function updatePanel(shell) {
  const s = state.settings;
  const line = h('div.small');
  const dl = h('button.btn.btn-sm.btn-primary', ic('download', 14), 'Open the download page');
  const check = h('button.btn.btn-sm', ic('refresh', 14), 'Check now');
  const paint = (note) => {
    const up = available();
    line.textContent = note || (up ? `Version ${up.version} is available.` : s.updates.lastCheck ? 'This is the latest version.' : 'Not checked yet.');
    line.style.color = up && !note ? 'var(--accent-ink)' : '';
    dl.style.display = up ? '' : 'none';
    dl.onclick = () => hostApp.openExternal(up.url);
  };
  check.addEventListener('click', async () => {
    busy(check, true, ' Checking');
    let note = '';
    try { await checkForUpdate({ force: true }); } catch (e) { note = e.message || 'The check did not work.'; }
    busy(check, false);
    paint(note);
    shell.refreshSide();
  });
  paint();
  return h('div.col.gap-8',
    h('div.row', h('div.grow', line), dl, check),
    h('div', switchEl(s.updates.check !== false, async (v) => { s.updates.check = v; await saveSettings(); }, 'Look for a new version once a day'),
      h('div.tiny.muted.mt-4', 'Asks GitHub for the number of the latest release. Nothing about you or your documents is sent.')));
}

// ---------------------------------------------------------------------------------- AI engine panel

/** Provider picker + key + model + connection test. Used in Settings and in the first-run guide. */
export function aiPanel({ onChange = () => {}, compact = false } = {}) {
  const s = state.settings;
  const grid = h('div.prov');
  const detail = h('div.card.card-pad.col.gap-12');
  const el = h('div.col.gap-12', grid, detail);
  let token = 0;

  const choose = async (id) => {
    s.ai.provider = id;
    const p = PROVIDERS[id];
    if (!s.ai.models[id] && p.defaultModel) s.ai.models[id] = p.defaultModel;
    await saveSettings();
    drawGrid();
    await drawDetail();
    onChange();
  };

  function drawGrid() {
    const list = Object.values(PROVIDERS).filter((p) => !p.dev || state.info.dev);
    mount(grid, list.map((p) => h('button.provopt' + (s.ai.provider === p.id ? '.on' : ''), { onclick: () => choose(p.id) },
      h('div.n', ic(p.local ? 'cpu' : 'cloud', 15), p.name),
      h('div.d', p.blurb),
      p.tag ? h('span.tag.chip' + (/free/i.test(p.tag) ? '.chip-ok' : ''), p.tag) : null)));
  }

  async function drawDetail() {
    const my = ++token;
    const id = s.ai.provider;
    const p = PROVIDERS[id];
    clear(detail);
    if (!p) {
      detail.appendChild(h('div.small.muted', 'Choose where the writing should happen. Not sure? OpenRouter and Google Gemini both have free options that work well, and a key takes two minutes to get.'));
      return;
    }
    const info = p.key ? await secrets.info(id) : { exists: false };
    if (my !== token) return;

    detail.appendChild(h('div.row', h('div.h3.grow', p.name), p.keyUrl ? h('a.small', { onclick: () => hostApp.openExternal(p.keyUrl) }, 'Get an API key', ic('external', 12)) : null));

    // --- address (local engines)
    if (id === 'ollama' || id === 'custom') {
      const key = id;
      const inp = h('input.input', { value: s.ai.endpoints[key] || '', placeholder: id === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1', spellcheck: 'false' });
      inp.addEventListener('change', async () => { s.ai.endpoints[key] = inp.value.trim().replace(/\/+$/, ''); await saveSettings(); loadModels(); onChange(); });
      detail.appendChild(field(id === 'ollama' ? 'Ollama address' : 'Server address (OpenAI-compatible, ending in /v1)', inp));
    }

    // --- key
    if (p.key) {
      const row = h('div');
      const drawKey = (inf) => {
        if (inf.exists) {
          mount(row, h('div.row', h('span.chip.chip-ok', ic('lock', 12), 'Key saved'), h('span.mono.small.muted', inf.hint), h('div.grow'),
            h('button.btn.btn-sm.btn-ghost', { onclick: () => drawKey({ exists: false }) }, 'Replace'),
            h('button.btn.btn-sm.btn-ghost.btn-danger', { onclick: async () => { await secrets.remove(id); drawKey({ exists: false }); onChange(); } }, 'Remove')));
        } else {
          const inp = h('input.input', { type: 'password', placeholder: p.key === 'optional' ? 'API key (only if your server needs one)' : 'Paste your API key', autocomplete: 'off', spellcheck: 'false' });
          const save = h('button.btn.btn-primary', 'Save key');
          const doSave = async () => {
            const v = inp.value.trim();
            if (!v) { inp.focus(); return; }
            await secrets.set(id, v, hostOf(baseUrl(id, s)));
            inp.value = '';
            drawKey(await secrets.info(id));
            toast('Key saved. It is stored encrypted for your Windows account and never shown again.');
            loadModels();
            onChange();
          };
          save.addEventListener('click', doSave);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
          mount(row, h('div.row', h('div.grow', inp), save));
        }
      };
      drawKey(info);
      detail.appendChild(field('API key', row, p.help || null));
    }

    // --- model
    const dl = h('datalist', { id: 'models-' + id });
    const model = h('input.input', { value: s.ai.models[id] || '', placeholder: 'Choose or type a model', spellcheck: 'false' });
    model.setAttribute('list', dl.id);
    const hint = h('div.hint', 'Loading the current model list');
    const reload = h('button.btn.btn-icon', { title: 'Reload the model list' }, ic('refresh', 16));
    model.addEventListener('change', async () => { s.ai.models[id] = model.value.trim(); await saveSettings(); onChange(); });
    detail.appendChild(h('div.field', h('label', 'Model'), h('div.row', h('div.grow', model), reload), dl, hint));

    async function loadModels() {
      const inf = p.key ? await secrets.info(id) : { exists: false };
      if (p.key === true && !inf.exists && id !== 'openrouter') { clear(dl); hint.textContent = 'Save your API key to see the models you can use.'; return; }
      hint.textContent = 'Loading the current model list';
      try {
        const list = await listModels(id, s, inf.exists);
        if (my !== token) return;
        mount(dl, list.map((m) => h('option', { value: m.id }, m.label)));
        if (!list.length) hint.textContent = id === 'ollama' ? 'Ollama is running but has no model yet. Download one under Local AI.' : 'The provider returned no models.';
        else {
          const free = list.filter((m) => m.free).length;
          hint.textContent = `${list.length} models available${free ? ', ' + free + ' of them free (look for "free")' : ''}. Type to search.`;
          if (!s.ai.models[id] && (id === 'ollama' || id === 'mock' || list.length === 1)) { s.ai.models[id] = list[0].id; model.value = list[0].id; await saveSettings(); onChange(); }
        }
      } catch (e) {
        if (my !== token) return;
        clear(dl);
        hint.textContent = (e.message || 'The model list could not be loaded.') + ' You can still type a model name.';
      }
    }
    reload.addEventListener('click', loadModels);
    loadModels();

    // --- test
    const result = h('div.small', { style: { minHeight: '18px' } });
    const test = h('button.btn', ic('bolt', 15), 'Test connection');
    test.addEventListener('click', async () => {
      s.ai.models[id] = model.value.trim();
      await saveSettings();
      busy(test, true, ' Testing');
      result.textContent = '';
      try {
        const t0 = performance.now();
        const answer = await ping();
        result.style.color = 'var(--ok)';
        result.textContent = `Connected. The model answered "${answer}" in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      } catch (e) {
        result.style.color = 'var(--bad)';
        result.textContent = e.message || String(e);
      }
      busy(test, false);
      onChange();
    });
    detail.appendChild(h('div.row', test, h('div.grow', result)));

    if (!compact) {
      detail.appendChild(h('hr.divider'));
      detail.appendChild(h('div', switchEl(s.ai.humanize !== false, async (v) => { s.ai.humanize = v; await saveSettings(); }, 'Editing pass: humanize the wording and check every claim'),
        h('div.tiny.muted.mt-4', 'A second AI request reviews both documents after they are written. Recommended. Turn it off to save one request per application.')));
    }
  }

  drawGrid();
  drawDetail();
  return el;
}

// ---------------------------------------------------------------------------------- local AI (Ollama)

function localPanel(shell) {
  const el = h('div.col.gap-16');
  const s = state.settings;
  const base = () => baseUrl('ollama', s);
  let aborter = null;

  async function draw() {
    let hw = null;
    try { hw = await hostApp.hardware(); } catch { /* ignore */ }
    const adv = localAdvice(hw);
    let running = false;
    let version = '';
    let installed = [];
    try {
      const r = await http({ url: base() + '/api/version', timeoutMs: 2500 });
      if (r.status === 200) { running = true; version = (JSON.parse(r.body || '{}').version) || ''; }
    } catch { /* not running */ }
    if (running) { try { installed = await listModels('ollama', s, false); } catch { installed = []; } }
    let found = { installed: running };
    if (!running) { try { found = await call('ollama.find'); } catch { /* ignore */ } }

    const gpu = hw && hw.gpus && hw.gpus.length ? hw.gpus.map((g) => `${g.name}${g.vramGb ? ' (' + g.vramGb + ' GB)' : ''}`).join(', ') : 'no graphics card detected';
    const hwCard = h('div.card.card-pad.col.gap-12',
      h('div.row', ic('cpu', 18), h('div.grow', h('div.h3', 'This computer'), h('div.small.muted', hw ? `${hw.ramGb} GB memory · ${hw.cores} processor threads · ${gpu}` : 'Hardware could not be read'))),
      adv.weak
        ? h('div.notice.warn', ic('alert', 16), h('div', h('b', 'Local AI will be slow and limited here. '), 'Good local writing needs about 16 GB of memory or a dedicated graphics card. A free cloud model (OpenRouter, Gemini or Groq) writes better documents in a fraction of the time. If privacy matters more than speed, the lightest model below still works.'))
        : h('div.notice.ok', ic('check', 16), h('div', adv.pick ? `This computer can run local models. Suggested: ${adv.pick}.` : 'This computer can run small local models.')));

    const statusRow = h('div.row');
    if (running) {
      mount(statusRow, h('span.dot.ok'), h('div.grow', h('div.h3', 'Ollama is running'), h('div.small.muted', `Version ${version || 'unknown'} · ${installed.length} model${installed.length === 1 ? '' : 's'} installed`)),
        h('button.btn.btn-sm', { onclick: draw }, ic('refresh', 14), 'Refresh'));
    } else if (found.installed) {
      const start = h('button.btn.btn-sm.btn-primary', ic('bolt', 14), 'Start Ollama');
      start.addEventListener('click', async () => { busy(start, true, ' Starting'); try { await hostApp.ollamaLaunch(); } catch (e) { toast(e.message, { type: 'bad' }); } setTimeout(draw, 3500); });
      mount(statusRow, h('span.dot.warn'), h('div.grow', h('div.h3', 'Ollama is installed but not running'), h('div.small.muted', 'Start it to use local models.')), start);
    } else {
      const inst = h('button.btn.btn-sm.btn-primary', ic('download', 14), 'Install Ollama');
      inst.addEventListener('click', async () => {
        const ok = await confirmDialog('Install Ollama?', 'Ollama is the free program that runs AI models on your own computer. A Windows terminal will open and install it with winget (about 1 GB). When it finishes, come back here and press Refresh.', { ok: 'Install' });
        if (!ok) return;
        try { await hostApp.ollamaInstall(); } catch (e) { toast(e.message, { type: 'bad' }); }
      });
      mount(statusRow, h('span.dot'), h('div.grow', h('div.h3', 'Ollama is not installed'), h('div.small.muted', 'Needed only if you want the AI to run on this computer.')),
        h('button.btn.btn-sm.btn-ghost', { onclick: () => hostApp.openExternal('https://ollama.com/download') }, 'Website', ic('external', 12)), inst,
        h('button.btn.btn-sm', { onclick: draw }, ic('refresh', 14), 'Refresh'));
    }

    const have = new Set(installed.map((m) => m.id));
    const hasModel = (id) => have.has(id) || have.has(id + ':latest');
    const use = async (id) => { s.ai.provider = 'ollama'; s.ai.models.ollama = id; await saveSettings(); await shell.refreshAi(); toast(`JobMech now writes with ${id} on this computer.`); draw(); };

    const recRows = LOCAL_MODELS.map((m) => {
      const fits = !hw || hw.ramGb + 0.6 >= m.ram || (adv.dedicated && adv.vram >= m.ram / 2);
      const prog = h('div.progress', { style: { display: 'none', marginTop: '6px' } }, h('i'));
      const note = h('div.small.muted', `${m.size} download · needs about ${m.ram} GB memory · ${m.note}`);
      const btn = hasModel(m.id)
        ? (s.ai.provider === 'ollama' && (s.ai.models.ollama === m.id || s.ai.models.ollama === m.id + ':latest')
          ? h('span.chip.chip-ok', ic('check', 12), 'In use')
          : h('button.btn.btn-sm.btn-primary', { onclick: () => use(m.id) }, 'Use this model'))
        : h('button.btn.btn-sm', { disabled: !running }, ic('download', 14), 'Download');
      if (!hasModel(m.id) && running) {
        btn.addEventListener('click', async () => {
          if (aborter) { aborter.abort(); return; }
          aborter = new AbortController();
          btn.textContent = 'Cancel';
          prog.style.display = '';
          let buf = '';
          let last = {};
          try {
            const r = await http({ url: base() + '/api/pull', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, stream: true }), stream: true, timeoutMs: 900000, signal: aborter.signal }, (chunk) => {
              buf += chunk;
              let i;
              while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i).trim();
                buf = buf.slice(i + 1);
                if (!line) continue;
                try { last = JSON.parse(line); } catch { continue; }
                if (last.total && last.completed) {
                  const pct = Math.round(last.completed / last.total * 100);
                  prog.firstChild.style.width = pct + '%';
                  note.textContent = `Downloading: ${pct}% of ${(last.total / 1073741824).toFixed(1)} GB`;
                } else if (last.status) note.textContent = last.status;
              }
            });
            if (r.status >= 400 || last.error) throw new Error(last.error || 'The download failed.');
            toast(`${m.name} is ready.`);
          } catch (e) {
            if (!(e && e.name === 'AbortError')) toast(e.message || String(e), { type: 'bad' });
          }
          aborter = null;
          draw();
        });
      }
      return h('div.model-row', h('div', h('div.row', h('span.h3', m.name), h('span.mono.tiny.muted', m.id), adv.pick === m.id ? h('span.chip.chip-accent', 'Suggested for this PC') : null, !fits ? h('span.chip.chip-warn', 'Too heavy for this PC') : null), note, prog), btn);
    });

    const others = installed.filter((m) => !LOCAL_MODELS.some((r) => r.id === m.id || r.id + ':latest' === m.id));
    const otherRows = others.map((m) => h('div.model-row', h('div', h('div.h3', m.id), h('div.small.muted', m.size ? (m.size / 1073741824).toFixed(1) + ' GB on disk' : '')),
      s.ai.provider === 'ollama' && s.ai.models.ollama === m.id ? h('span.chip.chip-ok', ic('check', 12), 'In use') : h('button.btn.btn-sm', { onclick: () => use(m.id) }, 'Use this model')));

    mount(el, hwCard, h('div.card.card-pad', statusRow),
      h('div', h('div.eyebrow.mb-8', 'Recommended models'), h('div.card', recRows)),
      otherRows.length ? h('div', h('div.eyebrow.mb-8', 'Other installed models'), h('div.card', otherRows)) : null);
  }
  draw();
  return el;
}

// ---------------------------------------------------------------------------------- view

export async function mount$(root, params, shell) {
  const ui = { tab: params.tab || 'ai' };
  const nav = h('div.subnav');
  const body = h('div.split-body');
  const s = state.settings;
  const tabs = [['ai', 'sparkles', 'AI engine'], ['local', 'cpu', 'Local AI'], ['docs', 'fileText', 'Documents'], ['look', 'palette', 'Appearance'], ['data', 'folder', 'Data and about']];

  function go(id) {
    ui.tab = id;
    mount(nav, tabs.map(([t, icon, label]) => h('button' + (ui.tab === t ? '.on' : ''), { onclick: () => go(t) }, ic(icon, 16), label)));
    clear(body);
    if (id === 'ai') {
      mount(body, h('div.section', h('div.h2', 'AI engine'),
        h('div.desc', 'JobMech needs a language model to read postings and write your documents. Pick a cloud service (several are free) or run a model on this computer. Your API key is encrypted for your Windows account and is sent only to the provider it belongs to.'),
        aiPanel({ onChange: () => shell.refreshAi() })));
    } else if (id === 'local') {
      mount(body, h('div.section', h('div.h2', 'Local AI'), h('div.desc', 'Run the model on your own computer with Ollama: nothing leaves the machine and nothing costs money. The price is speed and, on modest hardware, writing quality.'), localPanel(shell)));
    } else if (id === 'docs') {
      const palSel = h('select.select', PALETTES.map((p) => h('option', { value: p.id, selected: p.id === s.docs.palette }, p.name)));
      palSel.addEventListener('change', async () => { s.docs.palette = palSel.value; await saveSettings(); });
      const fontSel = h('select.select', FONTS.map((f) => h('option', { value: f.id, selected: f.id === s.docs.font }, f.name)));
      fontSel.addEventListener('change', async () => { s.docs.font = fontSel.value; await saveSettings(); });
      mount(body, h('div.section', h('div.h2', 'Document defaults'), h('div.desc', 'Starting choices for new applications. Each application can still be changed on its own.'),
        h('div.card.card-pad.col.gap-16',
          h('div.grid-2', field('Colour', palSel), field('Font', fontSel)),
          field('Spacing', segmented(DENSITY.map((d) => ({ value: d.id, label: d.label })), s.docs.density, async (v) => { s.docs.density = v; await saveSettings(); })),
          h('div', switchEl(!!s.docs.enDash, async (v) => { s.docs.enDash = v; await saveSettings(); }, 'Typographic dash in date ranges (03/2024 – 07/2025)'),
            h('div.tiny.muted.mt-4', 'Off by default: date ranges use a plain hyphen, like most people type them. Sentences never contain dashes either way.')),
          h('div', switchEl(s.memory.autoSave !== false, async (v) => { s.memory.autoSave = v; await saveSettings(); }, 'Always save new answers to memory'),
            h('div.tiny.muted.mt-4', 'Your answers to the questions are kept in memory.md so you are never asked twice.')))));
    } else if (id === 'look') {
      mount(body, h('div.section', h('div.h2', 'Appearance'), h('div.desc', 'The look of the app itself. Your documents are not affected.'),
        h('div.card.card-pad', field('Theme', segmented([{ value: 'system', label: 'Match Windows', icon: 'monitor' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }], s.theme || 'system',
          async (v) => { s.theme = v; await saveSettings(); applyTheme(); })))));
    } else {
      const dir = state.info.dataDir;
      const open = (p) => fs.open(p).catch((e) => toast(e.message, { type: 'bad' }));
      mount(body,
        h('div.section', h('div.h2', 'Your data'), h('div.desc', 'Everything stays in one folder on this computer: your profile, memory, applications and settings. API keys are the exception: they are tied to your Windows account and must be entered again on another machine.'),
          h('div.card.card-pad.col.gap-12',
            h('div.row', h('span.mono.small.selectable.grow.ellipsis', dir), h('button.btn.btn-sm', { onclick: () => open(dir) }, ic('folder', 14), 'Open folder')),
            h('div.small.muted', dataPlaceText()),
            h('hr.divider'),
            h('div.row', h('div.grow', h('div.h3', 'Back up'), h('div.small.muted', 'One file with everything except API keys. Keep it on another drive or in the cloud.')),
              h('button.btn.btn-sm.btn-primary', { onclick: (e) => guard(e.currentTarget, backupNow) }, ic('download', 14), 'Back up now')),
            h('div.row', h('div.grow', h('div.h3', 'Restore'), h('div.small.muted', 'From a backup file, or from the data folder of another JobMech copy.')),
              h('button.btn.btn-sm', { onclick: (e) => guard(e.currentTarget, () => bringOver({ replacing: true })) }, ic('upload', 14), 'Restore')),
            h('hr.divider'),
            h('div.row', h('span.small.grow', 'Trouble? The log file helps to find out why.'), h('button.btn.btn-sm.btn-ghost', { onclick: () => open(dir + '\\logs\\jobmech.log') }, 'Open log')))),
        h('div.section', h('div.h2', 'About'),
          h('div.card.card-pad.col.gap-12',
            h('div.row', h('img', { src: 'assets/icon-256.png', width: 40, height: 40, alt: '' }), h('div', h('div.h3', 'JobMech ' + state.info.version), h('div.small.muted', 'Tailored CVs and cover letters, formatted for the country you apply to.'))),
            updatePanel(shell),
            h('div.small.muted', 'Reads PDF attachments with pdf.js (Mozilla, Apache 2.0). Window engine: Microsoft Edge WebView2.'))));
    }
  }

  mount(root, h('div.topbar', h('div.title.grow', h('div.display', 'Settings'))), h('div.split', nav, body));
  go(ui.tab);
  return null;
}

export { mount$ as mount };
