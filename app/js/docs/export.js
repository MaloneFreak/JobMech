// Saving documents. PDF pages are the very same sheets as the preview, printed by the app's own
// engine (no browser print dialog). Word files are built natively (see docx.js).
import { renderDoc, LAYOUT_SCALE } from './render.js';
import { buildDocx } from './docx.js';
import { dialog, fs, app as hostApp } from '../host.js';
import { state, saveApp, saveSettings } from '../store.js';
import { docNames } from '../doclang.js';
import { paper } from '../countries.js';
import { fileSlug, bytesToBase64 } from '../util.js';

function fileNames(app, ext) {
  const who = fileSlug(state.profile.fullName || 'Candidate', 40);
  const co = fileSlug(app.company || app.title || 'Application', 30);
  const n = docNames(app);
  return {
    cv: `${who}_${n.cvFile}_${co}.${ext}`,
    letter: `${who}_${n.letterFile}_${co}.${ext}`,
    combined: `${who}_Application_${co}.${ext}`,
  };
}

let printing = Promise.resolve();

/** Prints the given sheets to a PDF file. Calls are queued: the engine prints one job at a time. */
function printPdf(app, pages, path, title) {
  const job = async () => {
    const root = document.getElementById('print-root');
    const pg = paper(app.country);
    // The sheets are laid out at LAYOUT_SCALE times their size; the print engine scales them back.
    document.getElementById('print-page').textContent = '@page { margin: 0; }';
    root.replaceChildren(...pages);
    const prevTitle = document.title;
    document.title = title;
    try {
      await document.fonts.ready;
      await Promise.all([...root.querySelectorAll('img')].map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return await hostApp.printPdf(path, pg.wIn, pg.hIn, 1 / LAYOUT_SCALE);
    } finally {
      document.title = prevTitle;
      root.replaceChildren();
    }
  };
  const run = printing.then(job, job);
  printing = run.catch(() => {});
  return run;
}

const pagesOf = (app, kind) => renderDoc(app, kind, { editable: false }).pages;

async function writeOne(app, kind, format, path) {
  const who = state.profile.fullName || 'Candidate';
  const n = docNames(app);
  if (format === 'pdf') {
    if (kind === 'combined') return printPdf(app, [...pagesOf(app, 'letter'), ...pagesOf(app, 'cv')], path, `${who} - ${app.title || 'Application'}`);
    return printPdf(app, pagesOf(app, kind), path, `${who} - ${kind === 'cv' ? n.cv : n.letter}`);
  }
  const bytes = await buildDocx(app, kind);
  return fs.write(path, bytesToBase64(bytes));
}

/**
 * exportDocs(app, { kind: 'both' | 'cv' | 'letter' | 'combined', format: 'pdf' | 'docx', dir? })
 * Asks where to save (one dialog), writes the file(s) and remembers them on the application.
 * Returns null when the user cancels, else { files: [{ name, path }], dirName }.
 */
export async function exportDocs(app, { kind, format, dir = null }) {
  const names = fileNames(app, format);
  const startDir = state.settings.export.lastDir || state.info.downloadsDir;
  const jobs = [];
  let folder = dir;

  if (kind === 'both') {
    if (!folder) {
      const r = await dialog.folder({ title: `Choose the folder for your CV and cover letter (${format.toUpperCase()})`, dir: startDir });
      if (r.cancelled) return null;
      folder = r.path;
    }
    const sep = folder.endsWith('\\') ? '' : '\\';
    jobs.push({ kind: 'cv', path: folder + sep + names.cv, name: names.cv });
    jobs.push({ kind: 'letter', path: folder + sep + names.letter, name: names.letter });
  } else {
    let path;
    if (folder) path = folder + (folder.endsWith('\\') ? '' : '\\') + names[kind];
    else {
      const r = await dialog.save({
        title: 'Save ' + (kind === 'cv' ? 'CV' : kind === 'letter' ? 'cover letter' : 'application'),
        defaultName: names[kind], ext: format, filterName: format === 'pdf' ? 'PDF document' : 'Word document', dir: startDir,
      });
      if (r.cancelled) return null;
      path = r.path;
      folder = r.dir;
    }
    jobs.push({ kind, path, name: path.split('\\').pop() });
  }

  const files = [];
  for (const j of jobs) {
    await writeOne(app, j.kind, format, j.path);
    files.push({ name: j.name, path: j.path });
  }

  const at = new Date().toISOString();
  app.exports = [...files.map((f) => ({ name: f.name, path: f.path, dir: folder, at })), ...(app.exports || []).filter((e) => !files.some((f) => f.path === e.path))].slice(0, 12);
  await saveApp(app, { touch: false });
  if (state.settings.export.lastDir !== folder) { state.settings.export.lastDir = folder; await saveSettings(); }
  return { files, dirName: folder.replace(/\\+$/, '').split('\\').pop() || folder };
}
