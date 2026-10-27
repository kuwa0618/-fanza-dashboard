import assert from 'node:assert/strict';
import { createServerHandler } from '../deno/server.mjs';

Deno.test('existing public/private routes, assets, tracking and bounded cache in the Deno runtime',async () => {
  Object.assign(process.env,{SITE_URL:'https://migration.example',DMM_API_ID:'private-test-secret',
    DMM_AFFILIATE_ID:'affiliate-test',SUPABASE_URL:'https://database.example',SUPABASE_ANON_KEY:'private-db-secret',
    ADMIN_USER:'test-user',ADMIN_PASSWORD:'test-password'});
  const originalFetch = globalThis.fetch;
  let dmmCalls=0,writes=0,fail=false,time=0;
  const work={content_id:'check001',title:'動作確認作品',date:'2026-10-24 00:00:00',
    affiliateURL:'https://al.fanza.co.jp/?test',prices:{price:'500',list_price:'1000'},
    iteminfo:{genre:[{name:'VR専用'}],actress:[{name:'検証出演者'}],maker:[{name:'検証メーカー'}]}};
  globalThis.fetch = async (input,options={}) => {
    const url=new URL(input);
    if(url.hostname==='api.dmm.com') {
      dmmCalls++;
      if(fail)return new Response('maintenance',{status:503});
      const items=url.searchParams.get('keyword')==='empty'?[]:[work];
      return Response.json({result:{status:200,items,total_count:items.length}});
    }
    assert.equal(url.hostname,'database.example','unexpected network destination');
    if(options.method==='POST')writes++;
    return Response.json([],{status:options.method==='POST'?201:200});
  };
  const handle=createServerHandler({clock:()=>time,maxEntries:2});
  const auth={Authorization:'Basic '+btoa('test-user:test-password')};
  let checks=0;
  async function check(path,options,status=200) {
    const response=await handle(new Request('https://migration.example'+path,options));
    assert.equal(response.status,status,path);
    const body=await response.text();
    assert(!body.includes('private-test-secret')&&!body.includes('private-db-secret'),path+' secret leak');
    checks++;
    return {response,body};
  }
  try {
    for(const path of ['/','/sale','/new','/vr','/product/check001']) {
      const {body}=await check(path);assert(body.includes('ageGate'));assert(body.includes('https://migration.example'));
    }
    for(const path of ['/app.js','/catalog.js','/analytics-context.js','/styles.css','/ogp-v2-light.jpg','/robots.txt','/sitemap.xml']) {
      const {response}=await check(path);assert.equal(response.headers.get('Deno-CDN-Cache-Control'),'public, s-maxage=3600');
    }
    for(const path of ['/api/search?keyword=first','/api/search?mode=sale','/api/search?mode=recommend',
      '/api/rankings','/api/favorite-rankings','/api/actress-rankings','/api/maker-rankings','/api/genre-rankings'])await check(path);
    for(const path of ['/dashboard','/dashboard.html','/analysis','/post-form','/click-analysis','/api/post','/api/posts','/api/stats','/api/insights'])await check(path,undefined,401);
    for(const path of ['/dashboard','/analysis','/post-form','/click-analysis','/api/posts','/api/stats','/api/insights']) {
      const {response}=await check(path,{headers:auth});assert.equal(response.headers.get('X-Site-Cache'),'BYPASS');
      assert.equal(response.headers.get('Deno-CDN-Cache-Control'),'no-store');
    }
    for(const path of ['/api/click','/api/favorite'])await check(path,{method:'POST',body:JSON.stringify({content_id:'check001',title:'検証'})});
    assert.equal(writes,2);
    const botBefore=dmmCalls;
    const bot=await check('/?bot=1',{headers:{'User-Agent':'Twitterbot/1.0'}});
    assert.equal(dmmCalls,botBefore);assert.equal(bot.response.headers.get('X-Site-Cache'),'BYPASS');
    assert.equal(bot.response.headers.get('Deno-CDN-Cache-Control'),'no-store');
    assert.equal((await check('/',{method:'HEAD'})).body,'');
    await check('/api/search?keyword=cached&offset=21');const beforeHit=dmmCalls;
    const hit=await check('/api/search?keyword=cached&offset=21');
    assert.equal(hit.response.headers.get('X-Site-Cache'),'HIT');assert.equal(dmmCalls,beforeHit);
    assert.equal(hit.response.headers.get('Cache-Control'),'no-store');
    assert.equal(hit.response.headers.get('Deno-CDN-Cache-Control'),'public, s-maxage=60');
    time=59_000;
    const nearlyStale=await check('/api/search?keyword=cached&offset=21');
    assert.equal(nearlyStale.response.headers.get('Deno-CDN-Cache-Control'),'public, s-maxage=1');
    time=0;
    assert.deepEqual(JSON.parse((await check('/api/search?keyword=empty')).body).products,[]);
    await check('/api/search?keyword=third');
    assert.equal((await check('/api/search?keyword=cached&offset=21')).response.headers.get('X-Site-Cache'),'MISS');
    time=61_000;
    assert.equal((await check('/api/search?keyword=cached&offset=21')).response.headers.get('X-Site-Cache'),'MISS');
    fail=true;
    for(const path of ['/api/search?keyword=outage','/sale?actress=outage','/product/outage001'])await check(path,undefined,503);
    fail=false;await check('/api/search?keyword=outage');
    for(const path of ['/.env','/package.json','/api/search.js','/deno/server.mjs','/node_modules/typescript/package.json'])await check(path,undefined,404);
    console.log(`Deno runtime: ${checks} route checks passed, cache expiry/eviction/query separation and two writes verified. External requests mocked.`);
  } finally {globalThis.fetch=originalFetch;}
});
