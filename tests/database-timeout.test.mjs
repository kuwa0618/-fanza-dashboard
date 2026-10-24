import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import site from '../netlify/functions/site.mjs';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; mock.restoreAll(); });
const routes = [
  ['rankings'], ['favorite-rankings'], ['actress-rankings'], ['maker-rankings'], ['genre-rankings'],
  ['favorite', 'POST'], ['posts'], ['post', 'POST'], ['insights'], ['stats'],
];

for (const stage of ['headers', 'body']) {
  test(`database stalls during ${stage} abort without retries, successful empty results or shared error caching`, async () => {
    Object.assign(process.env, {
      SITE_URL: 'https://recovery.example', ADMIN_USER: 'test-user', ADMIN_PASSWORD: 'test-password',
      SUPABASE_URL: 'https://database.example', SUPABASE_ANON_KEY: 'test-key',
    });
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    mock.method(AbortSignal, 'timeout', ms => { assert.equal(ms, 10000); return timeout(5); });
    mock.method(console, 'error', () => {});
    let calls = 0;
    mock.method(globalThis, 'fetch', (url, options) => {
      calls++;
      assert.equal(new URL(url).origin, 'https://database.example');
      assert(options.signal instanceof AbortSignal);
      const stalled = () => new Promise((resolve, reject) => {
        const watchdog = setTimeout(() => reject(new Error('Abort did not terminate database wait')), 500);
        const abort = () => { clearTimeout(watchdog); reject(options.signal.reason); };
        if (options.signal.aborted) abort();
        else options.signal.addEventListener('abort', abort, { once: true });
      });
      return stage === 'headers' ? stalled() : Promise.resolve({ ok: true, json: stalled });
    });
    for (const [route, method = 'GET'] of routes) {
      // Post saves request return=minimal and complete at the response headers.
      if (stage === 'body' && route === 'post') continue;
      const before = calls;
      const response = await site(new Request(`https://recovery.example/api/${route}`, {
        method, headers: { Authorization: 'Basic ' + Buffer.from('test-user:test-password').toString('base64') },
        ...(method === 'POST' ? { body: JSON.stringify({ content_id: 'test001', title: 'test' }) } : {}),
      }));
      assert.equal(response.status, 500, route);
      assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'no-store', route);
      assert.equal(calls - before, route === 'stats' ? 2 : 1, route + ' must not retry');
      const body = await response.json();
      assert(body.error, route);
      assert.notEqual(body.success, true, route);
    }
  });
}
