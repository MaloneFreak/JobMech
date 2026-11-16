// Backing up the data folder and bringing data in: from a backup file, or from the data folder of
// another JobMech copy (an older version, another PC, a JobMech 1 folder).
import { state } from '../store.js';
import { h, ic, modal, toast } from '../ui.js';
import { dialog, data, fs } from '../host.js';
import { isoDate } from '../util.js';

/** Asks where to save, writes one .zip with everything except API keys. Returns the result or null. */
export async function backupNow() {
  const r = await dialog.save({
    title: 'Save a backup of your JobMech data', defaultName: `JobMech-backup-${isoDate()}.zip`,
    ext: 'zip', filterName: 'JobMech backup', dir: state.info.documentsDir,
  });
  if (r.cancelled) return null;
  const res = await data.exportBackup(r.path);
  toast(`Backup saved: ${res.files} file${res.files === 1 ? '' : 's'} in ${r.path.split('\\').pop()}.`, {
    action: { label: 'Show in folder', fn: () => fs.reveal(r.path).catch(() => {}) }, ms: 8000,
  });
  return res;
}

/**
 * Lets the user pick a backup file or a data folder and replaces the current data with it.
 * The page reloads afterwards, so the caller only sees `false` (cancelled or failed).
 */
export async function bringOver({ replacing = true } = {}) {
  const body = h('div.col.gap-12',
    h('p.soft', { style: { lineHeight: '1.55' } }, replacing
      ? 'Your profile, memory, applications and settings are replaced by what you choose. A copy of the current state is saved to the "backups" folder first.'
      : 'Used JobMech before? Bring your profile, memory and applications over.'),
    h('div.notice', ic('info', 16), h('div',
      h('div', h('b', 'A backup file: '), 'the .zip made with "Back up now".'),
      h('div.mt-4', h('b', 'A data folder: '), 'the "data" folder of another JobMech copy. Folders written by JobMech 1 are converted.'),
      h('div.mt-4', 'API keys are never in a backup file. From a data folder on this PC they come along, unless a key for the same engine is already saved here.'))));
  const choice = await modal({
    title: replacing ? 'Restore your data' : 'Bring over your JobMech data',
    body,
    actions: [{ label: 'Cancel', value: null }, { label: 'Choose a data folder', value: 'folder' }, { label: 'Choose a backup file', value: 'zip', primary: true }],
  });
  if (!choice) return false;
  let path = '';
  if (choice === 'zip') {
    const r = await dialog.open({ title: 'Choose a JobMech backup', ext: 'zip', filterName: 'JobMech backup', dir: state.info.documentsDir });
    if (r.cancelled) return false;
    path = r.path;
  } else {
    const r = await dialog.folder({ title: 'Choose the "data" folder of your other JobMech copy' });
    if (r.cancelled) return false;
    path = r.path;
  }
  try {
    await data.importFrom(path);
  } catch (e) {
    toast(e.message || String(e), { type: 'bad' });
    return false;
  }
  location.reload();
  return true;
}

/** One sentence saying where the data lives and what that means. */
export function dataPlaceText() {
  const mode = state.info.dataMode;
  if (mode === 'portable') return 'Portable copy: the data folder sits next to the program, so only this copy of JobMech uses it.';
  if (mode === 'custom') return 'This window was started with its own data folder.';
  return 'Stored in your Windows user profile: every JobMech version on this PC finds it here, wherever the program is unzipped.';
}
