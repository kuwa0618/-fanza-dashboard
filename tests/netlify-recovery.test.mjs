import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import site from '../netlify/functions/site.mjs';
import { build, publicFiles, siteOrigin } from '../scripts/build-netlify.mjs';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; mock.restoreAll(); });
function configured() {
  Object.assign(process.env, {
    SITE_URL: 'https://recovery.example', ADMIN_USER: 'test-user', ADMIN_PASSWORD: 'test-password',
    DMM_API_ID: 'test-api-secret', DMM_AFFILIATE_ID: 'test-affiliate',
    SUPABASE_URL: 'https://database.example', SUPABASE_ANON_KEY: 'test-database-secret',
  });
}
const auth = () => ({ Authorization: 'Basic ' + Buffer.from('test-user:test-password').toString('base64') });
const request = (path, options) => new Request('https://recovery.example' + path, options);
const work = { content_id: 'test001', title: '接続検証作品', date: '2026-10-15 00:00:00',
  affiliateURL: 'https://al.fanza.co.jp/?test', prices: { price: '500', list_price: '1000' },
  iteminfo: { actress: [{ name: '検証出演者' }], maker: [{ name: '検証メーカー' }] } };

test('public homepage, catalog and details preserve SEO and use the configured origin', async () => {
  configured();
  mock.method(globalThis, 'fetch', async () => Response.json({ result: { status: 200, items: [work] } }));
  for (const path of ['/', '/sale', '/new', '/vr', '/product/test001']) {
    const response = await site(request(path));
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert(!html.includes('https://fanza-dashboard-omega.vercel.app'), path);
    assert(html.includes('https://recovery.example'), path);
    assert(!html.includes('test-api-secret') && !html.includes('test-database-secret'));
  }
  const head = await site(request('/', { method: 'HEAD' }));
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});

test('search preserves query parameters; click POST records metadata through existing API', async () => {
  configured();
  let recorded;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('api.dmm.com')) {
      assert.equal(new URL(url).searchParams.get('keyword'), '検索検証');
      return Response.json({ result: { status: 200, items: [work] } });
    }
    recorded = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  });
  const response = await site(request('/api/search?keyword=' + encodeURIComponent('検索検証')));
  assert.equal(response.status, 200); assert.equal((await response.json()).products[0].content_id, 'test001');
  const click = await site(request('/api/click', { method: 'POST', body: JSON.stringify({ content_id: 'test001', link_type: 'image', link_source: 'product_page' }) }));
  assert.equal(click.status, 200);
  assert.deepEqual([recorded.content_id, recorded.link_type, recorded.link_source], ['test001', 'image', 'product_page']);
  assert.equal((await site(request('/api/click', { method: 'POST', body: '{' }))).status, 400);
});

test('all private page aliases and APIs reject anonymous requests before any upstream call', async () => {
  configured();
  mock.method(globalThis, 'fetch', async () => { throw new Error('Must not call upstream'); });
  for (const name of ['analysis', 'dashboard', 'post-form', 'click-analysis']) {
    for (const suffix of ['', '.html', '/', '.html/extra']) {
      const response = await site(request('/' + name + suffix));
      assert.equal(response.status, 401, name + suffix);
      assert.match(response.headers.get('Cache-Control'), /no-store/);
    }
    const allowed = await site(request('/' + name, { headers: auth() }));
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get('X-Robots-Tag'), /noindex/);
  }
  for (const name of ['post', 'posts', 'insights', 'stats']) {
    assert.equal((await site(request('/api/' + name))).status, 401);
  }
  assert.equal((await site(request('/.netlify/functions/site?view=click-analysis'))).status, 404);
  delete process.env.ADMIN_PASSWORD;
  assert.equal((await site(request('/dashboard'))).status, 503);
});

test('route parameters cannot override public route selection; redirects and invalid paths are safe', async () => {
  configured();
  mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).searchParams.get('cid'), 'test001');
    return Response.json({ result: { status: 200, items: [work] } });
  });
  assert.equal((await site(request('/product/test001?view=page&id=other001'))).status, 200);
  assert.equal((await site(request('/product/bad.dot'))).status, 404);
  assert.equal((await site(request('/api/nonexistent'))).status, 404);
  assert.equal((await site(request('/api/search/extra'))).status, 404);
  assert.equal((await site(request('/sale?actress=one&actress=two'))).status, 400);
  assert.equal((await site(request('/index.html'))).headers.get('Location'), '/');
  assert.equal((await site(request('/product/test001/'))).headers.get('Location'), '/product/test001');
});

test('ranking, favorite and protected analytics routes reach existing handlers', async () => {
  configured();
  mock.method(globalThis, 'fetch', async () => Response.json([]));
  for (const path of ['/api/rankings', '/api/actress-rankings', '/api/genre-rankings', '/api/maker-rankings', '/api/favorite-rankings']) {
    assert.equal((await site(request(path))).status, 200, path);
  }
  for (const path of ['/api/stats', '/api/stats?view=click-analysis', '/api/posts', '/api/insights']) {
    assert.equal((await site(request(path, { headers: auth() }))).status, 200, path);
  }
  const result = await site(request('/api/favorite', { method: 'POST', body: JSON.stringify({ content_id: 'test001', title: '検証' }) }));
  assert.equal(result.status, 200);
});

test('publish output contains only allowlisted assets and no admin/server/config files', async () => {
  configured(); await build();
  const files = await readdir('dist-netlify');
  assert.deepEqual(files.sort(), [...publicFiles, '_headers'].sort());
  for (const blocked of ['api', 'lib', 'netlify', '.env', 'package.json', 'index.html', 'dashboard.html', 'analysis.html', 'post-form.html', 'click-analysis.html']) assert(!files.includes(blocked));
  assert(!(await readFile('dist-netlify/sitemap.xml', 'utf8')).includes('fanza-dashboard-omega.vercel.app'));
  assert.throws(() => siteOrigin('https://recovery.example/path'));
  assert.throws(() => siteOrigin('https://user:password@recovery.example'));
});
