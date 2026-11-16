// New versions. Once a day JobMech asks GitHub for the number of the latest release and, when it is
// newer than this program, shows a quiet note with a link to the download page. Nothing is downloaded
// or installed by itself, and nothing about the user is sent.
import { http } from './host.js';
import { state, saveSettings } from './store.js';
import { isoDate } from './util.js';

export const RELEASES_API = 'https://api.github.com/repos/MaloneFreak/JobMech/releases/latest';
export const RELEASES_PAGE = 'https://github.com/MaloneFreak/JobMech/releases/latest';

const parts = (v) => String(v || '').trim().replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);

/** true when version `a` is newer than version `b` ("2.1.0" vs "v2.0.9"). */
export function newer(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/** { version, url } of a newer release that an earlier check found, else null. Never touches the network. */
export function available() {
  const u = state.settings.updates || {};
  if (!u.latest || !newer(u.latest, state.info.version)) return null;
  return { version: u.latest, url: u.url || RELEASES_PAGE };
}

/**
 * Asks for the latest release, at most once a day unless `force` is set.
 * A failed automatic check stays silent; a forced one throws with a readable message.
 */
export async function checkForUpdate({ force = false, url = RELEASES_API } = {}) {
  const u = state.settings.updates;
  const today = isoDate();
  if (!force && (u.check === false || u.lastCheck === today)) return available();
  try {
    const r = await http({ url, headers: { Accept: 'application/vnd.github+json' }, timeoutMs: 8000 });
    if (r.status !== 200) throw new Error(`GitHub answered with error ${r.status}. Try again later.`);
    const j = JSON.parse(r.body || '{}');
    if (!j.tag_name) throw new Error('GitHub did not name a release.');
    if (!j.draft && !j.prerelease) {
      u.latest = String(j.tag_name).trim().replace(/^v/i, '').slice(0, 20);
      // only ever link to the project's own pages
      u.url = /^https:\/\/github\.com\/MaloneFreak\/JobMech\//.test(String(j.html_url || '')) ? j.html_url : RELEASES_PAGE;
    }
    u.lastCheck = today;
    await saveSettings();
  } catch (e) {
    if (force) throw e;
  }
  return available();
}
