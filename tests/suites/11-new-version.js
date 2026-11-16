// The new-version note, against the local stand-in for GitHub's "latest release" (tests\fake-ai.ps1).
T.run('11-new-version', async () => {
  const { ok, eq, throws, waitFor, $, byText, mod, sleep } = T;
  const store = await mod('store.js');
  const main = await mod('main.js');
  const up = await mod('update.js');
  const port = window.__fakeAiPort;
  if (!port) { ok('the stand-in server port is known', false, 'run this suite through tests\\run.ps1'); return; }
  const s = store.state.settings;
  const api = (kind) => `http://127.0.0.1:${port}/repos/${kind}/releases/latest`;
  const reset = async () => { s.updates = { check: true, lastCheck: '', latest: '', url: '' }; await store.saveSettings(); };

  try {
    eq('version numbers are compared as numbers', [up.newer('2.1.0', '2.0.9'), up.newer('v2.10.0', '2.9.9'), up.newer('3.0', '2.9.9'), up.newer('2.1.0', '2.1.0'), up.newer('2.0.9', '2.1.0'), up.newer('', '2.1.0')], [true, true, true, false, false, false]);
    eq('in developer mode nothing was asked at start-up', [s.updates.lastCheck, s.updates.latest, up.available()], ['', '', null]);
    ok('the real address is the project\'s own release', up.RELEASES_API === 'https://api.github.com/repos/MaloneFreak/JobMech/releases/latest');

    let r = await up.checkForUpdate({ force: true, url: api('newer') });
    eq('a newer release is found, with its page', r, { version: '9.9.9', url: 'https://github.com/MaloneFreak/JobMech/releases/tag/v9.9.9' });
    ok('the sidebar says so', await waitFor(() => $('.update-chip') && /Version 9\.9\.9 is available/.test($('.update-chip').textContent)));
    eq('the result is remembered in the settings', [(await (await mod('host.js')).store.readJson('settings.json')).updates.latest, s.updates.lastCheck.length], ['9.9.9', 10]);
    eq('on the same day the answer comes from memory, not from the network', await up.checkForUpdate({ url: 'http://127.0.0.1:9/nothing-here' }), r);

    await main.navigate('settings', { tab: 'data' });
    ok('Settings shows the new version and a download button', await waitFor(() => /Version 9\.9\.9 is available\./.test($('.split-body').textContent) && byText('.split-body .btn', 'Open the download page').style.display !== 'none'));

    r = await up.checkForUpdate({ force: true, url: api('evil') });
    eq('a link that leaves the project is never used', r.url, up.RELEASES_PAGE);
    r = await up.checkForUpdate({ force: true, url: api('pre') });
    eq('a pre-release is ignored', r.version, '9.9.9');
    r = await up.checkForUpdate({ force: true, url: api('older') });
    eq('an older release is not offered', [r, up.available()], [null, null]);
    ok('the sidebar note disappears', await waitFor(() => !$('.update-chip')));

    await throws('a manual check that fails says why', () => up.checkForUpdate({ force: true, url: api('missing') }), /GitHub answered with error 404/);
    s.updates.lastCheck = '';
    eq('an automatic check that fails stays silent', await up.checkForUpdate({ url: 'http://127.0.0.1:9/nothing-here' }), null);
    s.updates.check = false;
    s.updates.lastCheck = '';
    eq('switched off means no request at all', [await up.checkForUpdate({ url: api('newer') }), s.updates.lastCheck], [null, '']);

    await reset();
    await main.navigate('settings', { tab: 'data' });
    ok('Settings offers the daily check as a switch that is on by default', await waitFor(() => { const sw = byText('.split-body label.switch', 'Look for a new version once a day'); return sw && sw.querySelector('input').checked && /Not checked yet\./.test($('.split-body').textContent); }));
  } finally {
    await reset();
    await sleep(30);
  }
});
