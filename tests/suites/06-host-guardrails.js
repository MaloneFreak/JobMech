// The native bridge: what the page is allowed to reach on the computer, and what it is not.
T.run('06-host-guardrails', async () => {
  const { ok, eq, throws, mod } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const info = store.state.info;

  // storage stays inside the data folder
  await throws('reading above the data folder is refused', () => host.store.read('..\\outside.txt'), /outside the data folder/);
  await throws('an absolute path is refused', () => host.store.read('C:\\Windows\\win.ini'), /outside the data folder/);
  await throws('writing above the data folder is refused', () => host.store.write('../../evil.txt', 'x'), /outside the data folder/);
  await throws('the encrypted key file cannot be read by the page', () => host.store.read('secrets.dat'), /managed by JobMech/);
  await throws('nor overwritten', () => host.store.write('secrets.dat', 'x'), /managed by JobMech/);
  await throws('the browser profile is off limits', () => host.store.read('.webview/Local State'), /managed by JobMech/);
  eq('a missing file reads as null, not as an error', await host.store.read('does-not-exist.txt'), null);

  // files outside the data folder need a dialog the user answered
  await throws('saving to a folder the user never chose is refused', () => host.fs.write(info.baseDir + '\\dropped.txt', 'eA=='), /Choose where to save/);
  await throws('printing a PDF there is refused too', () => host.app.printPdf(info.baseDir + '\\dropped.pdf', 8.27, 11.69), /Choose where to save/);
  eq('nothing was written', await host.fs.exists(info.baseDir + '\\dropped.txt'), false);
  await throws('only documents can be opened, never programs', () => host.fs.open(info.baseDir + '\\JobMech.exe'), /only opens documents/);
  await throws('opening a missing file is reported', () => host.fs.open(info.dataDir + '\\nope.pdf'), /no longer there/);

  // API keys
  await host.secrets.set('guard-test', 'sk-test-0123456789abcdef', 'api.example.com');
  const si = await host.secrets.info('guard-test');
  eq('a saved key is only described, never returned', si, { exists: true, hint: 'sk-...cdef', host: 'api.example.com' });
  await throws('a key is not sent to a host it was not saved for', () => host.http({ url: 'http://127.0.0.1:9/x', secret: 'guard-test', headers: { Authorization: 'Bearer {{secret}}' } }), /saved for api\.example\.com and will not be sent to 127\.0\.0\.1/);
  await throws('asking for a key that does not exist fails before any request', () => host.http({ url: 'http://127.0.0.1:9/x', secret: 'never-saved' }), /No API key is saved/);
  await host.secrets.remove('guard-test');
  eq('a removed key is gone', (await host.secrets.info('guard-test')).exists, false);
  const settingsText = await host.store.read('settings.json');
  ok('settings.json has no key field', !/sk-test|apiKey|"key"/.test(settingsText));

  // network and navigation
  await throws('only http and https addresses are requested', () => host.http({ url: 'file:///C:/Windows/win.ini' }), /Invalid address/);
  await throws('unknown bridge calls are rejected', () => host.call('fs.delete', { path: 'x' }), /Unknown host method/);
  const outside = await fetch('/%2e%2e/src/Program.cs');
  const up = await fetch('/..%5C..%5Cdata%5Cprofile.json');
  eq('the page can only load files of the app folder', [outside.status, up.status, (await fetch('/js/util.js')).status], [404, 404, 200]);
  eq('app files are never cached or sniffed', [(await fetch('/index.html')).headers.get('cache-control'), (await fetch('/index.html')).headers.get('x-content-type-options')], ['no-store', 'nosniff']);
});
