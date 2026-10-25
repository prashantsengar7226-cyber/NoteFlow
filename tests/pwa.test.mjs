import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';

test('installation manifest references real icons at the required sizes', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, '/');
  assert.equal(new URL(manifest.start_url, 'https://test.example').origin, 'https://test.example');
  for (const icon of manifest.icons) {
    const metadata = await sharp(await readFile('public' + icon.src)).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
    assert.equal(metadata.format, 'png');
  }
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
});

async function worker() {
  const handlers = {},
    stored = new Map(),
    removed = [];
  let offline = false;
  let redirect = false;
  let calls = 0;
  runInNewContext(await readFile('public/sw.js', 'utf8'), {
    Request: class extends Request {
      constructor(input, init) {
        super(new URL(input, 'https://test.example'), init);
      }
    },
    Response,
    URL,
    self: {
      location: { origin: 'https://test.example' },
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => ({
        put: async (key, value) => stored.set(key, value),
        match: async (key) => stored.get(key)?.clone(),
      }),
      keys: async () => ['another-app-cache', 'noteflow-offline-v0', 'noteflow-offline-v1'],
      delete: async (key) => {
        removed.push(key);
      },
    },
    fetch: async (request) => {
      calls++;
      if (offline) throw new TypeError('offline');
      if (request.url.endsWith('/offline')) {
        assert.equal(request.credentials, 'omit');
        const response = new Response('<h1>Reconnect</h1>', {
          headers: { 'content-type': 'text/html' },
        });
        if (redirect) Object.defineProperty(response, 'redirected', { value: true });
        return response;
      }
      return new Response('Private account content', { headers: { 'cache-control': 'no-store' } });
    },
  });
  return {
    handlers,
    stored,
    removed,
    calls: () => calls,
    offline: () => {
      offline = true;
    },
    redirect: () => {
      redirect = true;
    },
    async lifecycle(name) {
      let pending;
      handlers[name]({
        waitUntil: (promise) => {
          pending = promise;
        },
      });
      await pending;
    },
    async request(path, method = 'GET', mode = 'navigate') {
      let result;
      handlers.fetch({
        request: { url: new URL(path, 'https://test.example').href, method, mode },
        respondWith: (promise) => {
          result = promise;
        },
      });
      return result ? await result : undefined;
    },
  };
}

test('offline support never stores private pages or intercepts API and authentication requests', async () => {
  const w = await worker();
  await w.lifecycle('install');
  assert.deepEqual([...w.stored.keys()], ['/offline']);
  assert.equal(await (await w.request('/')).text(), 'Private account content');
  assert.deepEqual([...w.stored.keys()], ['/offline']);
  const before = w.calls();
  for (const path of [
    '/api/notes',
    '/api/actions',
    '/signin-with-chatgpt',
    '/signout-with-chatgpt',
    '/callback',
    'https://other.example/',
  ])
    assert.equal(await w.request(path), undefined);
  assert.equal(await w.request('/', 'POST'), undefined);
  assert.equal(await w.request('/', 'GET', 'cors'), undefined);
  assert.equal(w.calls(), before);
  w.offline();
  assert.match(await (await w.request('/?source=installed')).text(), /Reconnect/);
  await w.lifecycle('activate');
  assert.deepEqual(w.removed, ['noteflow-offline-v0']);
});

test('a redirected sign-in response cannot be saved as the offline page', async () => {
  const w = await worker();
  w.redirect();
  await assert.rejects(w.lifecycle('install'), /Offline page unavailable/);
  assert.equal(w.stored.size, 0);
});
