import test, {afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import search from '../api/search.js';
import {catalogPages,catalogParams,selectCatalog,discountedPrice,renderCatalogPage,affiliateUrl} from '../lib/catalog-pages.js';
import {normalizeSource} from '../lib/click-analytics.js';
const now=new Date('2026-10-15T00:00:00+09:00');
const work=(id='real',extra={})=>({content_id:id,title:'API確認作品 <script>alert(1)</script>',date:'2026-10-14 10:00:00',affiliateURL:'https://al.dmm.co.jp/?lurl=https%3A%2F%2Fwww.dmm.co.jp%2F',iteminfo:{genre:[{name:'VR専用'}],actress:[{name:'出演者'}],maker:[{name:'メーカー'}]},prices:{deliveries:{delivery:[{type:'hd',price:'500',list_price:'1000'}]}},...extra});
const env={...process.env};afterEach(()=>{mock.restoreAll();process.env={...env};});
const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},send(b){this.body=b;return this;}});
test('catalog selection uses paired exact sale prices, explicit VR genres and JST release window',()=>{
 const cross=work('cross',{prices:{price:'500',list_price:'1000',deliveries:{delivery:[{price:'500'},{price:'1000',list_price:'1000'}]}}});
 assert.equal(discountedPrice(cross),null);assert.equal(discountedPrice(work('range',{prices:{price:'500～1000',list_price:'2000'}})),null);
 assert.deepEqual(selectCatalog('sale',[cross,work(),work()],now).map(p=>p.content_id),['real']);
 assert.equal(selectCatalog('vr',[work('fake',{title:'VR',iteminfo:{genre:[{name:'ドラマ'}]}})],now).length,0);
 const items=[work('old',{date:'2026-09-15 00:00:00'}),work('first',{date:'2026-09-16 00:00:00'}),work('future',{date:'2026-10-16 00:00:00'}),work('today',{date:'2026-10-15 00:00:00'})];
 assert.deepEqual(selectCatalog('new',items,now).map(p=>p.content_id),['today','first']);assert.equal(catalogParams('new',now).get('gte_date'),'2026-09-16T00:00:00');assert.equal(catalogParams('vr',now).get('keyword'),'VR');
});
test('each initial HTML has own metadata, visible real data, internal links, safe structured data and age gate',()=>{
 for(const [key,page] of Object.entries(catalogPages)){
  const html=renderCatalogPage(key,[work()]);assert(html.includes(`<title>${page.title}</title>`));assert(html.includes(`rel="canonical" href="https://fanza-dashboard-omega.vercel.app${page.path}"`));assert.equal((html.match(/<h1>/g)||[]).length,1);assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<script>alert(1)</script>'));
  const graph=JSON.parse(html.match(/id="siteStructuredData" type="application\/ld\+json">(.*?)<\/script>/s)[1]);assert.equal(graph['@graph'][2].itemListElement[0].item.name,work().title);assert(!html.includes('AggregateRating'));assert(html.includes('inert'));assert(html.includes('rating" content="adult'));assert(html.includes('sponsored nofollow'));assert(html.includes('href="/vr"'));assert.equal(html.includes('500円'),key==='sale');
 }
 assert.equal(affiliateUrl('javascript:alert(1)'), '');assert.equal(affiliateUrl('https://dmm.co.jp.evil.test/'), '');assert(!renderCatalogPage('sale',[]).includes('ItemList'));assert(renderCatalogPage('sale',[],{unavailable:true}).includes('noindex, follow'));
});
test('public handlers use upstream API filters and hide secrets; outages are retryable 503, unknown category 404',async()=>{
 process.env.DMM_API_ID='server-secret';process.env.DMM_AFFILIATE_ID='affiliate-secret';
 for(const key of Object.keys(catalogPages)){
  mock.method(globalThis,'fetch',async(url,opts)=>{const q=new URL(url).searchParams;assert.equal(q.get('sort'),key==='sale'?'rank':'date');assert(opts.signal);return Response.json({result:{status:200,items:[work('current',{date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})+' 00:00:00'})]}});});
  const r=response();await search({method:'GET',query:{view:'catalog',category:key}},r);assert.equal(r.code,200);assert(!r.body.includes('server-secret'));assert(!r.body.includes('affiliate-secret'));assert(r.headers.link.includes(catalogPages[key].path));mock.restoreAll();
 }
 mock.method(globalThis,'fetch',async()=>{throw Error('secret upstream')});const r=response();await search({method:'HEAD',query:{view:'catalog',category:'sale'}},r);assert.equal(r.code,503);assert.equal(r.headers['cache-control'],'no-store');assert(!r.body.includes('secret upstream'));
 const missing=response();await search({method:'GET',query:{view:'catalog',category:'__proto__'}},missing);assert.equal(missing.code,404);
});
test('catalog links record once, preserve navigation and history even when storage fails',()=>{
 for(const key of Object.keys(catalogPages)){
  const listeners={},calls=[],stored={};const nodes={mainContent:{inert:true},ageGate:{classList:{add(){}}},enterBtn:{addEventListener(t,fn){listeners.enter=fn}},leaveBtn:{addEventListener(){}},catalogProducts:{textContent:JSON.stringify([{id:'real',title:'API確認作品',url:'https://al.dmm.co.jp/',actresses:[],genres:[],maker:'メーカー'}])}};
  const link={dataset:{product:'0'},addEventListener(t,fn){listeners[t]=fn}};
  const ctx={document:{getElementById:id=>nodes[id],querySelectorAll:()=>[link],body:{dataset:{catalog:key}}},window:{},location:{},localStorage:{getItem:k=>stored[k]||null,setItem:(k,v)=>stored[k]=v},fetch:(url,opts)=>{calls.push(JSON.parse(opts.body));return Promise.resolve({ok:true})}};
  vm.runInNewContext(fs.readFileSync(new URL('../catalog.js',import.meta.url),'utf8'),ctx);listeners.click({type:'click'});assert.equal(calls.length,0);listeners.enter();listeners.click({type:'click'});assert.equal(calls.length,1);assert.equal(normalizeSource(calls[0].link_source),key+'_page');assert.equal(JSON.parse(stored.viewHistory)[0].id,'real');listeners.auxclick({type:'auxclick',button:2});assert.equal(calls.length,1);ctx.localStorage.setItem=()=>{throw Error('private mode')};listeners.auxclick({type:'auxclick',button:1});assert.equal(calls.length,2);
 }
});

test('all category routes stay public and ignore caller supplied API modes',async()=>{
 const {default:ts}=await import('typescript');
 const compiled=ts.transpileModule(fs.readFileSync(new URL('../middleware.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,process,Response,URL,require:name=>name==='@vercel/functions'?{rewrite:u=>new Response(null,{headers:{'x-middleware-rewrite':String(u)}})}:{}});
 delete process.env.ADMIN_USER;delete process.env.ADMIN_PASSWORD;
 for(const key of ['sale','vr','new']){
  assert(exports.config.matcher.includes('/'+key));const r=exports.default(new Request('https://example.com/'+key+'?view=page&category=ignored&keyword=wrong'));
  const target=new URL(r.headers.get('x-middleware-rewrite'));assert.equal(r.status,200);assert.equal(target.pathname,'/api/search');assert.equal(target.searchParams.get('view'),'catalog');assert.equal(target.searchParams.get('category'),key);assert.equal(target.searchParams.size,2);
 }
});
