import test, {afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import search from '../api/search.js';
import {productPage,renderProductDetail,productPriceRows,productUrl} from '../lib/product-page.js';
import {normalizeSource} from '../lib/click-analytics.js';
const env={...process.env};afterEach(()=>{mock.restoreAll();process.env={...env};});
const work={content_id:'h_123real001',title:'API作品 <script>alert(1)</script>',date:'2026-10-15 00:00:00',affiliateURL:'https://al.fanza.co.jp/?lurl=https%3A%2F%2Fvideo.dmm.co.jp%2F',imageURL:{large:'https://pics.dmm.co.jp/real.jpg'},iteminfo:{maker:[{name:'メーカー'}],actress:[{name:'出演者&名前'}],genre:[{name:'VR専用'}]},prices:{price:'500~',deliveries:{delivery:[{type:'hd',price:'500',list_price:'1,000'},{type:'stream',price:'300~'}]}},privateSecret:'never publish'};
const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},send(b){this.body=b;return this;}});
const configured=()=>{process.env.DMM_API_ID='secret-api';process.env.DMM_AFFILIATE_ID='secret-affiliate';};
test('detail initial HTML contains only real facts with unique SEO and escaped markup, shared image/button tracking and age gate',()=>{
 const html=renderProductDetail(work,work.content_id);assert(html.includes('<h1>API作品 &lt;script&gt;'));assert(html.includes('rel="canonical" href="https://fanza-dashboard-omega.vercel.app/product/h_123real001"'));assert(html.includes('data-content-id="h_123real001"'));assert(html.includes('メーカー'));assert(html.includes('出演者&amp;名前'));assert(html.includes('2026-10-15'));assert(html.includes('500円'));assert(html.includes('1,000円'));assert(html.includes('300円〜'));assert(html.includes('data-link-type="image"'));assert(html.includes('data-link-type="button"'));assert(html.includes('inert'));assert(html.includes('rating" content="adult'));assert(!html.includes('privateSecret'));assert(!html.includes('never publish'));assert(!html.includes('<script>alert'));assert(!html.includes('AggregateRating'));
 const graph=JSON.parse(html.match(/id="siteStructuredData" type="application\/ld\+json">(.*?)<\/script>/s)[1]);assert.equal(graph['@graph'][1].name,work.title);assert.equal(graph['@graph'][1].isFamilyFriendly,false);
 const missing=renderProductDetail({...work,imageURL:{},iteminfo:{},prices:{},affiliateURL:'javascript:alert(1)'},work.content_id);assert(!missing.includes('<img '));assert(missing.includes('情報なし'));assert(missing.includes('価格はFANZAで'));assert(!missing.includes('data-link-type='));
 assert.deepEqual(productPriceRows({prices:{price:'500～1000',list_price:'2000'}}),[]);assert.equal(productUrl('../bad'),'');assert.equal(normalizeSource('product_page'),'product_page');
});
test('detail sends exact cid with timeout and validates returned content_id; no keyword fallback',async()=>{
 configured();mock.method(globalThis,'fetch',async(url,opts)=>{const q=new URL(url).searchParams;assert.equal(q.get('cid'),work.content_id);assert.equal(q.get('hits'),'1');assert.equal(q.get('keyword'),null);assert(opts.signal);return Response.json({result:{status:200,items:[work]}});});
 for(const method of ['GET','HEAD']){const r=response();await search({method,query:{view:'product',id:work.content_id}},r);assert.equal(r.code,200);assert(r.headers.link.includes('/product/'+work.content_id));assert(r.headers['cache-control'].includes('s-maxage=300'));assert(!r.headers['x-robots-tag']);assert(!r.body.includes('secret-api'));assert(!r.body.includes('secret-affiliate'));}
});
test('invalid IDs do not call upstream, missing and mismatched IDs are 404, upstream failures are retryable 503',async()=>{
 configured();let calls=0;mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({result:{status:200,items:[work]}});});
 for(const id of ['../bad','a', 'x'.repeat(81),['valid'],null]){const r=response();await productPage({query:{id}},r);assert.equal(r.code,404);assert.match(r.headers['x-robots-tag'],/noindex/);}assert.equal(calls,0);
 const mismatch=response();await productPage({query:{id:'another001'}},mismatch);assert.equal(mismatch.code,404);assert(!mismatch.body.includes(work.title));mock.restoreAll();
 for(const data of [{result:{status:200,items:[]}},{result:{status:401,items:[]}},{}]){
  mock.method(globalThis,'fetch',async()=>Response.json(data));const r=response();await productPage({query:{id:work.content_id}},r);assert.equal(r.code,data.result?.status===200?404:503);assert.equal(r.headers['cache-control'],'no-store');assert(!r.body.includes('secret-api'));mock.restoreAll();
 }
 mock.method(globalThis,'fetch',async()=>{throw Error('API secret')});const r=response();await productPage({query:{id:work.content_id}},r);assert.equal(r.code,503);assert.equal(r.headers['retry-after'],'60');assert(!r.body.includes('API secret'));
});
test('detail routes are public, exact paths override query input, aliases redirect and malformed routes never ask for admin auth',async()=>{
 const {default:ts}=await import('typescript');const compiled=ts.transpileModule(fs.readFileSync(new URL('../middleware.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,process,Response,URL,require:name=>name==='@vercel/functions'?{rewrite:u=>new Response(null,{headers:{'x-middleware-rewrite':String(u)}})}:{}});delete process.env.ADMIN_USER;delete process.env.ADMIN_PASSWORD;
 const r=exports.default(new Request('https://example.com/product/'+work.content_id+'?id=bad&view=page'));const target=new URL(r.headers.get('x-middleware-rewrite'));assert.equal(target.pathname,'/api/search');assert.equal(target.searchParams.get('view'),'product');assert.equal(target.searchParams.get('id'),work.content_id);assert.equal(target.searchParams.size,2);
 for(const path of ['/product','/product/bad-id','/product/abc/extra','/product/%3Cscript%3E']){const r=exports.default(new Request('https://example.com'+path));assert.equal(r.status,404);assert(!r.headers.get('www-authenticate'));}
 const slash=exports.default(new Request('https://example.com/product/'+work.content_id+'/'));assert.equal(slash.status,308);assert.equal(new URL(slash.headers.get('location')).pathname,'/product/'+work.content_id);
});
test('all four app card renderers link titles safely, without changing outbound bindings or increasing API function count',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.equal((app.match(/setProductTitle\(node, product\);/g)||[]).length,4);
 const elements={h3:{textContent:'',replaceChildren(a){this.child=a;}}};const ctx={document:{createElement:()=>({})}};vm.runInNewContext(app.slice(app.indexOf('function setProductTitle'),app.indexOf('function bindFanzaProductLink')),ctx);
 ctx.setProductTitle({querySelector:()=>elements.h3},{id:work.content_id,title:work.title});assert.equal(elements.h3.child.href,'/product/'+work.content_id);assert.equal(elements.h3.child.textContent,work.title);
 assert.equal(fs.readdirSync(new URL('../api/',import.meta.url)).filter(p=>p.endsWith('.js')).length,12);
 const cat=fs.readFileSync(new URL('../lib/catalog-pages.js',import.meta.url),'utf8');assert(cat.includes('<h3><a href="/product/'));assert(cat.includes('data-link-type="image"'));assert(cat.includes('data-link-type="button"'));
});
