// First-run guide: choose an AI engine, enter your details, add your background. Three short steps.
import { state, saveSettings, saveMemory, saveProfile } from '../store.js';
import { h, ic, mount, clear, toast } from '../ui.js';
import { aiPanel } from './settings.js';
import { profileForm, photoPicker, storyEditor } from './parts.js';
import { readiness } from '../ai/client.js';

export function run(shell) {
  return new Promise((resolve) => {
    let step = 0;
    let story = null;
    let form = null;
    const bodyEl = h('div.onb-body');
    const foot = h('div.onb-foot');
    const dots = h('div.steps');

    const steps = [
      {
        title: 'Choose your AI engine',
        text: 'JobMech uses a language model to read job postings and write your documents. Use a cloud service with your own key, or a model that runs on this computer.',
        draw: () => aiPanel({ compact: true, onChange: () => shell.refreshAi() }),
      },
      {
        title: 'About you',
        text: 'These details head every CV and letter. Fill in what you have; you can complete the rest later under Memory.',
        draw: () => {
          form = profileForm();
          const photo = photoPicker();
          return h('div.col.gap-16', h('div.card.card-pad', form.el), h('div.card.card-pad', photo.el));
        },
        leave: async () => { if (form) await form.flush(); await saveProfile(); },
      },
      {
        title: 'Your background',
        text: 'Paste your current CV or tell your story in your own words. Attach old CVs or cover letters if you have them. This becomes your memory: you only do this once.',
        draw: () => {
          story = storyEditor({ value: state.memory.story });
          story.textarea.style.minHeight = '250px';
          return h('div.col', story.textarea, story.zone, story.chips, story.input);
        },
        leave: async () => { if (story) { state.memory.story = story.value.trim(); await saveMemory(); } },
      },
    ];

    const finish = async () => {
      state.settings.onboarded = true;
      await saveSettings();
      ov.remove();
      resolve();
    };

    const go = async (n) => {
      const cur = steps[step];
      if (cur && cur.leave) await cur.leave();
      if (n >= steps.length) { await finish(); return; }
      step = Math.max(0, n);
      draw();
    };

    function draw() {
      const s = steps[step];
      mount(dots, steps.map((x, i) => [i ? h('span.bar') : null, h('div.step' + (i === step ? '.on' : i < step ? '.done' : ''), h('span.n', i < step ? ic('check', 11) : String(i + 1)))]));
      mount(bodyEl, h('div', { style: { maxWidth: '760px' } }, h('div.display', s.title), h('p.soft.mt-8.mb-16', { style: { maxWidth: '620px', lineHeight: '1.55' } }, s.text), s.draw()));
      bodyEl.scrollTop = 0;
      const next = h('button.btn.btn-accent.btn-lg', step === steps.length - 1 ? 'Start using JobMech' : 'Continue', ic('arrowRight', 16));
      next.addEventListener('click', async () => {
        if (step === 0) {
          const r = await readiness();
          if (!r.ok) { toast(r.reason + ' You can also skip this and set it up later in Settings.', { type: 'info' }); }
        }
        go(step + 1);
      });
      mount(foot,
        step > 0 ? h('button.btn.btn-ghost', { onclick: () => go(step - 1) }, ic('arrowLeft', 16), 'Back') : null,
        dots, h('div.grow'),
        h('button.btn.btn-ghost', { onclick: finish }, 'Skip for now'), next);
    }

    const point = (icon, text) => h('div.pt', ic(icon, 16), h('div', text));
    const ov = h('div.onb',
      h('div.onb-side',
        h('div.row', h('img', { src: 'assets/icon-256.png', width: 34, height: 34, alt: '' }), h('div', { style: { fontWeight: 700, fontSize: '17px', color: '#fff' } }, 'JobMech')),
        h('div.display', 'Applications written for the job, formatted for the country.'),
        h('p', 'Paste a job posting. JobMech compares it with your background, asks only what it still needs, and writes a CV and cover letter the way employers in that country expect them.'),
        h('div.pts',
          point('shield', 'Only your real experience. Nothing is invented, and every figure is checked against what you provided.'),
          point('globe', 'German tabular Lebenslauf, American one-page resume, British CV, and 20 more markets.'),
          point('lock', 'Your data stays on this computer, in files you can open and read.'))),
      h('div.onb-main', bodyEl, foot));
    document.body.appendChild(ov);
    draw();
  });
}
