// The real network path, against the local stand-in provider (tests\fake-ai.ps1): model lists,
// streaming, the key that only the host knows, retries, errors and cancelling.
T.run('07-ai-network', async () => {
  const { ok, eq, throws, mod, sleep } = T;
  const store = await mod('store.js');
  const host = await mod('host.js');
  const client = await mod('ai/client.js');
  const prov = await mod('ai/providers.js');
  const port = window.__fakeAiPort;
  if (!port) { ok('the stand-in provider port is known', false, 'run this suite through tests\\run.ps1'); return; }
  const s = store.state.settings;
  const keep = JSON.parse(JSON.stringify(s.ai));
  const use = async (id, model) => { s.ai.provider = id; s.ai.models[id] = model; await store.saveSettings(); };

  try {
    s.ai.endpoints.custom = `http://127.0.0.1:${port}/v1`;
    s.ai.endpoints.ollama = `http://127.0.0.1:${port}`;
    await use('custom', 'fake-small');

    // ---- without a key
    eq('an optional key is not required to be ready', (await client.readiness()).ok, true);
    await throws('the model list reports a rejected key in plain words', () => prov.listModels('custom', s, false), /rejected the API key/);
    const anon = JSON.parse((await client.chat({ system: 's', user: 'u' })).text);
    eq('no Authorization header is sent when no key is saved', anon.auth, '');

    // ---- with a key
    await host.secrets.set('custom', 'test-key-123', '127.0.0.1');
    const models = await prov.listModels('custom', s, true);
    eq('chat models are listed, embedding models are left out', models.map((m) => m.id).sort(), ['fake-large', 'fake-small']);
    const deltas = [];
    const r = await client.chat({ system: 's', user: 'u', onDelta: (t) => deltas.push(t.length) });
    const answer = JSON.parse(r.text);
    eq('the host injects the saved key into the request', answer.auth, 'Bearer test-key-123');
    ok('the answer streams in several pieces', deltas.length >= 2 && deltas[0] < r.text.length, deltas);
    ok('the page itself never holds the key', !JSON.stringify(store.state).includes('test-key-123') && !(await host.store.read('settings.json')).includes('test-key-123'));
    ok('the connection test returns the model answer', (await client.ping()).startsWith('{"ok":true'));
    eq('a JSON answer is parsed', (await client.chatJson({ system: 's', user: 'u' })).ok, true);

    // the key is tied to the host it was saved for
    s.ai.endpoints.custom = `http://localhost:${port}/v1`;
    const moved = JSON.parse((await client.chat({ system: 's', user: 'u' })).text);
    eq('after the address changes the key is no longer sent', moved.auth, '');
    s.ai.endpoints.custom = `http://127.0.0.1:${port}/v1`;

    // ---- provider trouble
    const status = [];
    await use('custom', 'fake-429');
    const t0 = performance.now();
    const again = JSON.parse((await client.chat({ system: 's', user: 'u', onStatus: (m) => status.push(m) })).text);
    ok('a rate limit is waited out and retried', again.call === 2 && status.some((m) => /busy\. Trying again in 1 s/.test(m)) && performance.now() - t0 > 900, { again, status });
    await use('custom', 'fake-400');
    const lean = JSON.parse((await client.chat({ system: 's', user: 'u', temperature: 0.4, json: true })).text);
    eq('a model that rejects optional parameters gets a plain second request', lean.call, 2);
    await use('custom', 'fake-think');
    eq('private reasoning is stripped from the answer', (await client.chat({ system: 's', user: 'u' })).text.startsWith('{"ok":true'), true);
    await use('custom', 'fake-nostream');
    let plain = null;
    try { plain = JSON.parse((await client.chat({ system: 's', user: 'u' })).text); } catch (e) { plain = { error: e.message }; }
    eq('a server that ignores streaming still gets its answer read', plain.ok, true);

    await use('custom', 'fake-401');
    let err = null;
    try { await client.chat({ system: 's', user: 'u' }); } catch (e) { err = e; }
    ok('a wrong key is an "auth" error that points to Settings', err && err.kind === 'auth' && /rejected the API key\. Check it in Settings\. \(Invalid key\)/.test(err.message), err && err.message);
    await use('custom', 'fake-404');
    await throws('an unknown model is explained', () => client.chat({ system: 's', user: 'u' }), /does not know this model/);

    await use('custom', 'fake-slow');
    const ctrl = new AbortController();
    const started = performance.now();
    setTimeout(() => ctrl.abort(), 400);
    let aborted = null;
    try { await client.chat({ system: 's', user: 'u', signal: ctrl.signal }); } catch (e) { aborted = e; }
    ok('Cancel stops a running request at once', aborted && aborted.name === 'AbortError' && performance.now() - started < 3000, aborted && aborted.message);

    s.ai.endpoints.custom = 'http://127.0.0.1:9/v1';
    await use('custom', 'fake-small');
    await throws('a server that is not running is named clearly', () => client.chat({ system: 's', user: 'u' }), /Nothing is answering at 127\.0\.0\.1:9\. Is the local AI app running\?/);

    // ---- Ollama protocol
    await use('ollama', '');
    const local = await prov.listModels('ollama', s, false);
    eq('installed Ollama models are listed with their size', [local[0].id, local[0].label], ['fake-local:latest', 'fake-local:latest  ·  1B']);
    await use('ollama', 'fake-local:latest');
    eq('an Ollama answer is assembled from its stream', JSON.parse((await client.chat({ system: 's', user: 'u', json: true })).text), { engine: 'ollama', ok: true });
  } finally {
    await host.secrets.remove('custom').catch(() => {});
    s.ai = keep;
    await store.saveSettings();
    await sleep(30);
  }
  eq('the test engine is active again', (await client.readiness()).ok && s.ai.provider, 'mock');
});
