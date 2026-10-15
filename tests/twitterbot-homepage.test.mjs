import test, {afterEach, mock} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import search from '../api/search.js';

const env = {...process.env};
afterEach(() => {mock.restoreAll();process.env = {...env};});
const response = () => ({headers:{},setHeader(k,v){this.headers[k.toLowerCase()] = v;},status(code){this.code=code;return this;},send(body){this.body=body;return this;}});
const configure = () => {process.env.DMM_API_ID='private-api';process.env.DMM_AFFILIATE_ID='private-affiliate';process.env.GOOGLE_SITE_VERIFICATION='verify"<value>';};
const ogp = html => [...html.matchAll(/<meta\b[^>]*(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/g)].map(m=>m[0]);
const upstream = () => Response.json({result:{status:200,items:[{content_id:'qa_001',title:'実データの確認作品',date:'2026-10-15 00:00:00'}]}});

test('Twitterbot GET returns its full OGP without waiting for an unresolved DMM request', async () => {
  configure();let release;let calls=0;
  const blocked=new Promise(resolve=>{release=resolve;});
  mock.method(globalThis,'fetch',()=>{calls++;return blocked;});
  const r=response();let completed=false;
  const handling=search({method:'GET',headers:{'user-agent':'Twitterbot/1.0'},query:{view:'page'}},r).then(()=>{completed=true;});
  try {
    // Let readFile finish without ever resolving the upstream request.
    await Promise.race([handling,new Promise(resolve=>setTimeout(resolve,1000))]);
    assert.equal(calls,0,'social metadata must not depend on the external catalog');
    assert.equal(completed,true);
    assert.equal(r.code,200);
    assert.match(r.headers['content-type'],/text\/html/);
    assert.match(r.headers['cache-control'],/private, no-store/);
    assert.equal(r.headers.vary,'User-Agent');
    assert.equal(ogp(r.body).length,11);
    assert(!r.body.includes('id="initialCatalog"'));
    assert(r.body.includes('id="ageGate"'));
    assert(r.body.includes('id="searchPanel"'));
    assert(r.body.includes('src="app.js"'));
    assert(r.body.includes('verify&quot;&lt;value&gt;'));
    assert(!r.body.includes('private-api'));assert(!r.body.includes('private-affiliate'));
    assert(!r.headers['x-robots-tag']);
  } finally {release(upstream());await handling;}
});

test('normal visitors and Googlebot keep genuine SSR and public CDN caching; OGP remains identical',async()=>{
  configure();let calls=0;mock.method(globalThis,'fetch',async()=>{calls++;return upstream();});
  const social=response();await search({method:'GET',headers:{'user-agent':'Twitterbot/1.0'},query:{view:'page'}},social);
  for(const agent of ['Mozilla/5.0','Googlebot/2.1','NotTwitterbot/1.0']) {
    const r=response();await search({method:'GET',headers:{'user-agent':agent},query:{view:'page'}},r);
    assert.equal(r.code,200);assert(r.body.includes('実データの確認作品'));
    assert(r.body.includes('id="initialCatalog"'));assert.match(r.headers['cache-control'],/s-maxage=300/);
    assert.equal(r.headers.vary,'User-Agent');assert.deepEqual(ogp(r.body),ogp(social.body));
  }
  assert.equal(calls,3);
});

test('Twitterbot HEAD does not call DMM and does not create a cacheable reduced catalog response',async()=>{
  configure();mock.method(globalThis,'fetch',()=>{throw Error('Twitterbot must not call upstream');});
  const r=response();await search({method:'HEAD',headers:{'user-agent':'Twitterbot/1.0'},query:{view:'page'}},r);
  assert.equal(r.code,200);assert.equal(r.headers['link'],'<https://fanza-dashboard-omega.vercel.app/>; rel="canonical"');
  assert.match(r.headers['cache-control'],/no-store/);assert.equal(r.headers.vary,'User-Agent');
  assert(r.body.includes('name="twitter:image"'));assert(r.body.includes('name="twitter:card" content="summary_large_image"'));
});
