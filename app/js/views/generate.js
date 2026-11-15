// Runs the writing pipeline behind a progress dialog, and stores what the candidate told us in memory.
import { h, ic, mount, clear } from '../ui.js';
import { generateDocuments } from '../ai/pipeline.js';
import { state, saveApp, addFacts, addGaps, saveMemory } from '../store.js';
import { isoDate } from '../util.js';
import { country } from '../countries.js';
import { langName } from '../doclang.js';

const readable = (t) => String(t || '').replace(/\\n/g, ' ').replace(/\\"/g, '”').replace(/["{}\[\]]/g, ' ').replace(/\s+:/g, ':').replace(/\s{2,}/g, ' ').slice(-420);

/**
 * Shows the progress dialog and writes the documents into `app`.
 * Resolves true when the documents are ready (already saved), false when cancelled or closed after an error.
 */
export function runGeneration(app) {
  return new Promise((resolve) => {
    const ct = country(app.country);
    const lang = app.language === 'other' ? app.languageName : langName(app.language);
    const steps = [
      { id: 'cv', label: 'Writing your CV', sub: `${ct.name} format, in ${lang}` },
      { id: 'letter', label: 'Writing your cover letter', sub: 'Matched to the posting, one page' },
      { id: 'edit', label: 'Editing', sub: 'Human voice, and every claim checked against your material' },
    ];
    const rows = {};
    const list = h('div.gen-steps');
    for (const s of steps) {
      const icEl = h('div.ic');
      const tm = h('div.tm');
      const sub = h('div.sub', s.sub);
      const row = h('div.gs', icEl, h('div', h('div.lbl', s.label), sub), tm);
      rows[s.id] = { row, icEl, tm, sub, started: 0, baseSub: s.sub };
      list.appendChild(row);
    }
    const live = h('div.livetext');
    const status = h('div.small.muted', { style: { minHeight: '18px', marginTop: '10px' } });
    const foot = h('div.modal-foot');
    const title = h('div.h2', 'Writing your application');
    const box = h('div.modal.wide', { style: { width: 'min(600px, 100%)' } },
      h('div.modal-head', title, h('div.small.muted.mt-4', `${app.title}${app.company ? ' at ' + app.company : ''}`)),
      h('div.modal-body', list, live, status),
      foot);
    const ov = h('div.overlay', box);
    document.body.appendChild(ov);

    let ctrl = null;
    let timer = null;
    const close = (ok) => { clearInterval(timer); ov.remove(); resolve(ok); };

    const setRow = (id, st, detail) => {
      const r = rows[id];
      if (!r) return;
      r.row.className = 'gs' + (st === 'run' ? ' on' : st === 'done' ? ' done' : st === 'fail' ? ' fail' : '');
      clear(r.icEl);
      if (st === 'run') { r.icEl.appendChild(h('span.spinner', { style: { width: '12px', height: '12px' } })); r.started = performance.now(); }
      else if (st === 'done') { r.icEl.appendChild(ic('check', 12)); r.tm.textContent = r.started ? Math.round((performance.now() - r.started) / 1000) + ' s' : ''; }
      else if (st === 'fail') { r.icEl.appendChild(ic('alert', 12)); r.sub.textContent = detail || 'Skipped'; }
      else if (st === 'skip') { r.icEl.appendChild(ic('minus', 12)); r.sub.textContent = 'Turned off in Settings'; }
    };

    const start = async () => {
      ctrl = new AbortController();
      title.textContent = 'Writing your application';
      status.textContent = '';
      status.style.color = '';
      live.textContent = '';
      for (const s of steps) { rows[s.id].row.className = 'gs'; clear(rows[s.id].icEl); rows[s.id].tm.textContent = ''; rows[s.id].sub.textContent = rows[s.id].baseSub; }
      mount(foot, h('button.btn', { onclick: () => { ctrl.abort(); } }, 'Cancel'));
      timer = setInterval(() => {
        for (const s of steps) {
          const r = rows[s.id];
          if (r.row.classList.contains('on')) r.tm.textContent = Math.round((performance.now() - r.started) / 1000) + ' s';
        }
      }, 500);
      try {
        if (!app.letterDate) app.letterDate = isoDate();
        await generateDocuments(app, {
          signal: ctrl.signal,
          onStage: setRow,
          onDelta: (t) => { live.textContent = readable(t); status.textContent = ''; },
          onStatus: (m) => { status.textContent = m === 'thinking' ? 'The model is thinking before it writes' : m; },
        });
        if (app.status === 'draft') app.status = 'ready';
        await saveApp(app);
        close(true);
      } catch (e) {
        clearInterval(timer);
        if (e && e.name === 'AbortError') { close(false); return; }
        for (const s of steps) if (rows[s.id].row.classList.contains('on')) setRow(s.id, 'fail', 'Stopped here');
        title.textContent = 'The AI could not finish';
        live.textContent = '';
        status.textContent = e && e.message ? e.message : String(e);
        status.style.color = 'var(--bad)';
        mount(foot,
          h('button.btn', { onclick: () => close(false) }, 'Close'),
          h('button.btn.btn-primary', { onclick: start }, ic('refresh', 15), 'Try again'));
      }
    };
    start();
  });
}

/** Saves the new facts and gaps of an application into memory.md. Returns a short summary. */
export async function commitMemory(app) {
  const label = [app.company, app.title].filter(Boolean).join(' · ') || 'Application';
  const pend = app.pending || { facts: [], gaps: [] };
  let facts = (pend.facts || []).map((f) => ({ fact: f }));
  const answered = (app.answers || []).filter((a) => a.state === 'answered' && String(a.a || '').trim());
  if (!facts.length && answered.length) facts = answered.map((a) => ({ q: a.q, a: a.a }));
  if (String(app.extraNotes || '').trim() && !(pend.facts || []).length) facts.push({ fact: String(app.extraNotes).trim() });
  let gaps = pend.gaps || [];
  const none = (app.answers || []).filter((a) => a.state === 'none');
  if (!gaps.length && none.length) gaps = none.map((a) => 'No: ' + a.q);
  const nf = addFacts(label, facts);
  const ng = addGaps(gaps);
  await saveMemory();
  app.memorySaved = true;
  await saveApp(app, { touch: false });
  return { facts: nf, gaps: ng };
}

export const autoSaveMemory = () => state.settings.memory.autoSave !== false;
