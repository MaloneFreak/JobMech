// Building blocks shared by several screens: the career-story editor with attachments,
// the personal details form and the portrait picker.
import { h, ic, toast, clear, field } from '../ui.js';
import { state, saveProfile, setPhoto } from '../store.js';
import { extractText, normalizePhoto, ACCEPT } from '../extract.js';
import { debounce } from '../util.js';

/** Textarea + "attach a file" zone. Attached files are read locally and appended as text. */
export function storyEditor({ value = '', onInput = () => {}, placeholder } = {}) {
  const ta = h('textarea.textarea.selectable', {
    placeholder: placeholder || 'Paste your CV here, or simply tell your story in your own words: where you worked, what you did there, what you studied, which tools and languages you know. Any language is fine.',
    spellcheck: 'false',
  });
  ta.value = value;
  ta.addEventListener('input', () => onInput(ta.value));
  const chips = h('div.file-chips');
  const input = h('input', { type: 'file', accept: ACCEPT, multiple: true, style: { display: 'none' } });
  const zone = h('div.dropzone', ic('upload', 18), h('div.grow', h('b', 'Attach a file'), ' or drop it here: an old CV, a cover letter, notes'), h('span.tiny.muted', 'PDF · Word · Markdown · text'));
  const attached = [];

  const renderChips = () => {
    clear(chips);
    for (const a of attached) {
      chips.appendChild(h('span.file-chip', ic('file', 12), a.name, h('button', {
        title: 'Remove this file\'s text',
        onclick: () => {
          const i = attached.indexOf(a);
          if (i >= 0) attached.splice(i, 1);
          ta.value = ta.value.replace(a.block, '').replace(/\n{3,}/g, '\n\n').trim();
          onInput(ta.value);
          renderChips();
        },
      }, ic('x', 12))));
    }
  };

  async function addFiles(files) {
    for (const f of files) {
      try {
        zone.classList.add('over');
        const r = await extractText(f);
        const block = `--- From ${r.name} ---\n${r.text}`;
        ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + block;
        attached.push({ name: r.name, block });
        onInput(ta.value);
        renderChips();
        toast(r.note || `Added the text of ${r.name}.`, { type: r.note ? 'info' : 'ok' });
      } catch (e) {
        toast(e.message || String(e), { type: 'bad' });
      } finally {
        zone.classList.remove('over');
      }
    }
  }

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
  const over = (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('over'); };
  const leave = (e) => { e.preventDefault(); zone.classList.remove('over'); };
  for (const el of [zone, ta]) {
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  }

  return { textarea: ta, zone, chips, input, get value() { return ta.value; }, set value(v) { ta.value = v; }, addFiles };
}

/** Portrait box with upload and remove. */
export function photoPicker(onChange = () => {}) {
  const box = h('div.photo-box');
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', style: { display: 'none' } });
  const remove = h('button.btn.btn-sm.btn-ghost.btn-danger', ic('trash', 14), 'Remove');
  const draw = () => {
    clear(box);
    if (state.photo) box.appendChild(h('img', { src: state.photo, alt: 'Your portrait' }));
    else box.appendChild(ic('user', 34));
    remove.style.display = state.photo ? '' : 'none';
  };
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    try {
      await setPhoto(await normalizePhoto(f));
      draw();
      onChange();
      toast('Portrait saved. It is only used where a photo is customary.');
    } catch (e) { toast(e.message, { type: 'bad' }); }
  });
  remove.addEventListener('click', async () => { await setPhoto(''); draw(); onChange(); });
  draw();
  const el = h('div.row-top.gap-16', box, input,
    h('div.col',
      h('div.h3', 'Portrait photo'),
      h('div.small.muted', { style: { maxWidth: '330px' } }, 'Used on CVs for countries where a photo is customary (Germany, Austria, Switzerland and others) and left out where it is not (United States, United Kingdom, Canada...).'),
      h('div.row', h('button.btn.btn-sm', { onclick: () => input.click() }, ic('image', 14), state.photo ? 'Replace' : 'Choose a photo'), remove)));
  return { el, draw };
}

const PROFILE_FIELDS = [
  ['fullName', 'Name as it should appear on your documents', 'Alex Martin', 2],
  ['headline', 'Current role or status', 'Business student, Finance and Compliance', 2],
  ['email', 'Email', 'you@example.com', 1],
  ['phone', 'Phone', '+49 151 2345678', 1],
  ['street', 'Street and number', 'Musterstraße 12', 1],
  ['postalCity', 'Postal code and city', '10115 Berlin', 1],
  ['location', 'City and country', 'Berlin, Germany', 1],
  ['nationality', 'Nationality', 'Brazilian', 1],
  ['workPermit', 'Work permit or visa status', 'Student residence permit, work allowed', 1],
  ['birthDate', 'Date of birth', '', 1, 'date'],
  ['linkedin', 'LinkedIn', 'linkedin.com/in/you', 1],
  ['website', 'Website or portfolio', 'github.com/you', 1],
  ['languages', 'Languages and levels', 'Portuguese (native), English (C2), German (B1)', 2],
];

/** Personal details form. Saves by itself a moment after typing stops. */
export function profileForm(onSaved = () => {}) {
  const p = state.profile;
  const save = debounce(async () => { await saveProfile(); onSaved(); }, 500);
  const grid = h('div.grid-2');
  for (const [key, label, ph, span, type] of PROFILE_FIELDS) {
    const input = h('input.input', { type: type || 'text', placeholder: ph, value: p[key] || '', spellcheck: 'false' });
    input.addEventListener('input', () => { p[key] = input.value.trim(); save(); });
    const f = field(label, input);
    if (span === 2) f.style.gridColumn = '1 / -1';
    grid.appendChild(f);
  }
  return { el: grid, flush: () => save.flush() };
}
