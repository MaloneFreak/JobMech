// Minimal DOM toolkit: element builder, toasts, modal dialogs and dropdown menus.
import { icon } from './icons.js';

/** h('div.card', { onclick }, child, 'text', [more]) */
export function h(spec, props, ...children) {
  let tag = 'div';
  let cls = '';
  const m = /^([a-z0-9]+)?((?:\.[\w-]+)*)$/i.exec(spec);
  if (m) { tag = m[1] || 'div'; cls = (m[2] || '').split('.').filter(Boolean).join(' '); }
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (props && (props instanceof Node || typeof props !== 'object' || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const ic = (name, size = 16) => {
  const s = document.createElement('span');
  s.style.display = 'contents';
  s.innerHTML = icon(name, size);
  return s.firstChild;
};

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

// ---- toasts --------------------------------------------------------------------------------
let toastHost = null;
export function toast(message, { type = 'ok', action = null, ms = 4200 } = {}) {
  if (!toastHost) { toastHost = h('div.toasts'); document.body.appendChild(toastHost); }
  const t = h('div.toast.' + type,
    ic(type === 'bad' ? 'alert' : type === 'info' ? 'info' : 'check'),
    h('div.grow', message),
    action ? h('button.act', { onclick: () => { action.fn(); t.remove(); } }, action.label) : null);
  toastHost.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, type === 'bad' ? Math.max(ms, 7000) : ms);
  return t;
}

// ---- modal dialogs --------------------------------------------------------------------------
export function modal({ title, body, actions = [{ label: 'Close', value: null }], wide = false, dismissable = true }) {
  return new Promise((resolve) => {
    const close = (v) => { document.removeEventListener('keydown', onKey, true); ov.remove(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && !e.shiftKey && !/TEXTAREA/.test(e.target.tagName)) {
        const prim = actions.find((a) => a.primary);
        if (prim && !prim.disabled) { e.preventDefault(); close(resolveValue(prim)); }
      }
    };
    const resolveValue = (a) => (typeof a.value === 'function' ? a.value() : a.value);
    const foot = h('div.modal-foot', actions.map((a) => h('button.btn' + (a.primary ? (a.danger ? '.btn-danger' : '.btn-primary') : '') + (a.accent ? '.btn-accent' : ''), {
      onclick: async () => {
        if (a.onclick) { const keep = await a.onclick(); if (keep === false) return; }
        close(resolveValue(a));
      },
    }, a.label)));
    const box = h('div.modal' + (wide ? '.wide' : ''),
      h('div.modal-head', h('div.h2', title)),
      h('div.modal-body', typeof body === 'string' ? h('p.soft', { style: { lineHeight: '1.55' } }, body) : body),
      foot);
    const ov = h('div.overlay', { onmousedown: (e) => { if (e.target === ov && dismissable) close(null); } }, box);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey, true);
    const first = box.querySelector('input, textarea, select') || foot.querySelector('.btn-primary, .btn-accent') || foot.lastChild;
    if (first) setTimeout(() => first.focus(), 30);
  });
}

export function confirmDialog(title, text, { ok = 'Confirm', cancel = 'Cancel', danger = false } = {}) {
  return modal({ title, body: text, actions: [{ label: cancel, value: false }, { label: ok, value: true, primary: true, danger }] }).then((v) => v === true);
}

export async function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Save', multiline = false, hint = '' } = {}) {
  const input = multiline
    ? h('textarea.textarea', { rows: 5, placeholder })
    : h('input.input', { type: 'text', placeholder });
  input.value = value;
  const res = await modal({
    title,
    body: h('div.field', label ? h('label', label) : null, input, hint ? h('div.hint', hint) : null),
    actions: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: () => input.value }],
  });
  return res;
}

// ---- dropdown menu --------------------------------------------------------------------------
let openMenu = null;
export function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }

/** items: [{ label, icon, hint, danger, onclick } | { separator: true } | { heading: 'text' }] */
export function menu(anchor, items, { align = 'left', width = null } = {}) {
  closeMenu();
  const el = h('div.menu', { style: width ? { minWidth: width + 'px' } : null });
  for (const it of items) {
    if (!it) continue;
    if (it.separator) { el.appendChild(h('div.ms')); continue; }
    if (it.heading) { el.appendChild(h('div.ml.eyebrow', it.heading)); continue; }
    el.appendChild(h('button.mi' + (it.danger ? '.danger' : ''), {
      onclick: () => { closeMenu(); it.onclick && it.onclick(); },
    }, it.icon ? ic(it.icon) : null, h('span', it.label), it.hint ? h('span.k', it.hint) : null));
  }
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  let left = align === 'right' ? r.right - mw : r.left;
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  openMenu = el;
  const first = el.querySelector('.mi');
  if (first) first.focus();
  return el;
}

document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', (e) => {
  if (!openMenu) return;
  if (e.key === 'Escape') { closeMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const its = [...openMenu.querySelectorAll('.mi')];
    const i = its.indexOf(document.activeElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % its.length : (i - 1 + its.length) % its.length;
    its[n] && its[n].focus();
  }
});
window.addEventListener('blur', closeMenu);

// ---- small builders -------------------------------------------------------------------------
export function field(label, control, hint) {
  return h('div.field', label ? h('label', label) : null, control, hint ? h('div.hint', hint) : null);
}

export function switchEl(checked, onchange, label) {
  const input = h('input', { type: 'checkbox', onchange: (e) => onchange(e.target.checked) });
  input.checked = !!checked;
  return h('label.switch', input, h('span.track'), label ? h('span', label) : null);
}

export function segmented(options, value, onchange) {
  const el = h('div.seg');
  const render = (v) => {
    clear(el);
    for (const o of options) {
      el.appendChild(h('button' + (o.value === v ? '.on' : ''), {
        title: o.title || '',
        onclick: () => { render(o.value); onchange(o.value); },
      }, o.icon ? ic(o.icon, 14) : null, o.label || null));
    }
  };
  render(value);
  el.setValue = render;
  return el;
}

export function busy(btn, on, label) {
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '';
    btn.appendChild(h('span.spinner'));
    if (label) btn.appendChild(document.createTextNode(label));
  } else {
    btn.disabled = false;
    if (btn.dataset.html != null) { btn.innerHTML = btn.dataset.html; delete btn.dataset.html; }
  }
}
