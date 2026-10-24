import { Miniflare, createFetchMock } from 'miniflare';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const fetchMock = createFetchMock();
fetchMock.disableNetConnect();
let dmmCalls = 0, writes = 0, failDmm = false;
const work = { content_id: 'check001', title: '動作確認作品', date: '2026-10-24 00:00:00',
  affiliateURL: 'https://al.fanza.co.jp/?test', prices: { price: '500', list_price: '1000' },
  iteminfo: { genre: [{name:'VR専用'}], actress: [{name:'検証出演者'}], maker: [{name:'検証メーカー'}] } };
fetchMock.get('https://api.dmm.com').intercept({ method: 'GET', path: /.*/ }).reply(options => {
  dmmCalls++;
  if (failDmm) return { statusCode: 503, data: 'maintenance' };
  const url = new URL(options.path, 'https://api.dmm.com');
  const items = url.searchParams.get('keyword') === 'empty' ? [] : [work];
  return { statusCode: 200, data: JSON.stringify({ result: { status: 200, items, total_count: items.length } }),
    responseOptions: { headers: { 'Content-Type': 'application/json' } } };
}).persist();
for (const method of ['GET', 'POST']) {
  fetchMock.get('https://database.example').intercept({ method, path: /.*/ }).reply(() => {
    if (method === 'POST') writes++;
    return { statusCode: method === 'POST' ? 201 : 200, data: '[]',
      responseOptions: { headers: { 'Content-Type': 'application/json' } } };
  }).persist();
}

const mf = new Miniflare({
  modules: true, scriptPath: resolve('.cf-dry-run/worker.js'), modulesRoot: resolve('.cf-dry-run'),
  modulesRules: [{type:'Text',include:['**/*.html'],fallthrough:true}],
  compatibilityDate: '2026-07-30', compatibilityFlags: ['nodejs_compat'],
  bindings: { SITE_URL:'https://migration.example', ADMIN_USER:'test-user', ADMIN_PASSWORD:'test-password',
    DMM_API_ID:'test-secret', DMM_AFFILIATE_ID:'test-affiliate',
    SUPABASE_URL:'https://database.example', SUPABASE_ANON_KEY:'test-key' },
  assets: { directory: resolve('dist-cloudflare'), binding:'ASSETS',
    routerConfig:{has_user_worker:true},
    assetConfig:{html_handling:'none',not_found_handling:'none'} },
  fetchMock,
});
const auth = { Authorization:'Basic '+Buffer.from('test-user:test-password').toString('base64') };
let checks = 0;
async function check(path, options, status = 200) {
  const response = await mf.dispatchFetch('https://migration.example'+path, options);
  assert.equal(response.status,status,path);
  const body = await response.text();
  assert(!body.includes('test-secret') && !body.includes('test-key'),path+' leaked secret');
  checks++;
  return { response, body };
}
try {
  for (const path of ['/', '/sale','/new','/vr','/product/check001']) {
    const {body} = await check(path);
    assert(body.includes('https://migration.example'));
    assert(!body.includes('https://fanza-dashboard-omega.vercel.app'));
    assert(body.includes('ageGate') && body.includes('G-RK6R5HVKZC'));
  }
  for (const path of ['/app.js','/analytics-context.js','/styles.css','/ogp-v2-light.jpg','/robots.txt','/sitemap.xml']) await check(path);
  for (const path of ['/api/search?keyword=first&offset=21','/api/search?mode=sale','/api/search?mode=recommend',
    '/api/rankings','/api/actress-rankings','/api/maker-rankings','/api/genre-rankings','/api/favorite-rankings']) await check(path);
  const empty = await check('/api/search?keyword=empty');
  assert.deepEqual(JSON.parse(empty.body).products,[]);
  for (const path of ['/dashboard','/dashboard.html','/analysis','/post-form','/click-analysis',
    '/api/stats','/api/posts','/api/insights','/api/post']) await check(path,undefined,401);
  for (const path of ['/dashboard','/analysis','/post-form','/click-analysis','/api/stats','/api/posts','/api/insights']) {
    const {response} = await check(path,{headers:auth});
    assert.match(response.headers.get('Cache-Control'),/no-store/);
    assert.equal(response.headers.get('X-Site-Cache'),'BYPASS');
  }
  for (const path of ['/api/click','/api/favorite']) await check(path,{method:'POST',
    body:JSON.stringify({content_id:'check001',title:'動作確認'})});
  assert.equal(writes,2);
  await check('/api/click',{method:'POST',body:'{'},400);
  await check('/api/search',{method:'POST'},405);
  const beforeBot = dmmCalls;
  const bot = await check('/?botcheck=1',{headers:{'User-Agent':'Twitterbot/1.0'}});
  assert.equal(dmmCalls,beforeBot);
  assert.equal(bot.response.headers.get('X-Site-Cache'),'BYPASS');
  assert.match(bot.response.headers.get('Cache-Control'),/private/);
  const head = await check('/',{method:'HEAD'});
  assert.equal(head.body,'');
  // Cache writes happen in waitUntil. A bounded local-only check observes a hit.
  let hit;
  for (let i=0;i<5;i++) {
    hit = await check('/api/search?keyword=cache-check');
    if (hit.response.headers.get('X-Site-Cache') === 'HIT') break;
  }
  assert.equal(hit.response.headers.get('X-Site-Cache'),'HIT');
  assert.equal(hit.response.headers.get('Cache-Control'),'no-store');
  const beforeHit = dmmCalls;
  await check('/api/search?keyword=cache-check');
  assert.equal(dmmCalls,beforeHit);
  assert.equal(JSON.parse((await check('/api/search?keyword=empty&different=1')).body).products.length,0);
  failDmm = true;
  for (const path of ['/api/search?keyword=outage','/sale?actress=outage','/product/outage001']) {
    const {response} = await check(path,undefined,503);
    assert.notEqual(response.headers.get('X-Site-Cache'),'HIT');
  }
  failDmm = false;
  await check('/api/search?keyword=outage');
  for (const path of ['/.env','/api/search.js','/netlify.toml','/package.json','/cloudflare/worker.mjs']) await check(path,undefined,404);
  console.log(`Cloudflare workerd runtime: ${checks} route checks passed; public cache HIT and two database writes verified; no external connections.`);
} finally {
  await mf.dispose();
  await fetchMock.close();
}
