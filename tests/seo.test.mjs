import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import search from '../api/search.js';
import { renderSeoPage, publicProducts, siteGraph, SITE_TITLE } from '../lib/seo.js';
const template=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const env={...process.env};afterEach(()=>{mock.restoreAll();process.env={...env};});
const raw={content_id:'a',title:'確認作品 <script>alert(1)</script>',date:'2026-10-14 10:00:00',iteminfo:{maker:[{name:'メーカー'}],actress:[{name:'出演者&名前'}]},apiSecret:'never copy'};
const res=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},send(v){this.body=v;return this;},json(v){this.body=v;return this;}});
test('SSR outputs actual readable works without scripts, escapes HTML and JSON-LD, and no untracked outbound links',()=>{
 const html=renderSeoPage(template,[raw]);assert(html.includes('id="initialCatalog"'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 const json=JSON.parse(html.match(/<script id="siteStructuredData" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(json['@graph'][2].itemListElement[0].item.name,raw.title);
 assert(!html.includes('apiSecret'));assert(!html.includes('never copy'));assert(html.includes('/?actress='));assert(!html.includes('<script>alert(1)</script>'));
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert(html.includes(`<title>${SITE_TITLE}</title>`));
});
test('empty or malformed upstream items do not generate fictional catalog data',()=>{
 for(const items of [null,[],[null,{}, {title:1}]]){const html=renderSeoPage(template,items);assert(!html.includes('id="initialCatalog"'));assert(!html.includes('ItemList'));}
 assert.equal(publicProducts(Array.from({length:30},()=>raw)).length,20);assert.equal(siteGraph()['@graph'].length,2);
});
test('homepage gets genuine products with timeout and keeps canonical and secrets server-side',async()=>{
 process.env.DMM_API_ID='private-api';process.env.DMM_AFFILIATE_ID='private-affiliate';process.env.GOOGLE_SITE_VERIFICATION='verification"<test>';
 mock.method(globalThis,'fetch',async(url,opts)=>{const q=new URL(url).searchParams;assert.equal(q.get('sort'),'date');assert.equal(q.get('hits'),'20');assert(opts.signal);return Response.json({result:{status:200,items:[raw]}});});
 const r=res();await search({method:'GET',url:'/',query:{view:'page',keyword:'ignored'}},r);assert.equal(r.code,200);assert.match(r.headers['content-type'],/text\/html/);assert.match(r.headers['cache-control'],/s-maxage=300/);assert(!r.headers['x-robots-tag']?.includes('noindex'));assert(!r.body.includes('private-api'));assert(!r.body.includes('private-affiliate'));assert(r.body.includes('verification&quot;&lt;test&gt;'));
});
test('homepage falls back to real site introduction on API failure without fake works',async()=>{
 process.env.DMM_API_ID='private-api';process.env.DMM_AFFILIATE_ID='private-affiliate';mock.method(globalThis,'fetch',async()=>{throw Error('secret upstream token')});
 const r=res();await search({method:'GET',query:{view:'page'}},r);assert.equal(r.code,200);assert.match(r.headers['cache-control'],/s-maxage=30/);assert(!r.body.includes('id="initialCatalog"'));assert(!r.body.includes('secret upstream token'));assert(r.body.includes('作品を探す'));
});
test('robots and sitemap keep public JS crawlable and admin URLs out; redirect aliases preserve canonical',()=>{
 const robots=fs.readFileSync(new URL('../robots.txt',import.meta.url),'utf8');assert(robots.includes('Sitemap: https://fanza-dashboard-omega.vercel.app/sitemap.xml'));assert(!/^Disallow: \/api\/$/m.test(robots));assert(!/^Disallow: \/app.js$/m.test(robots));
 const xml=fs.readFileSync(new URL('../sitemap.xml',import.meta.url),'utf8');const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);assert.equal(urls.length,7);assert(urls.every(u=>!/(api|analysis|dashboard|post-form|\?)/.test(new URL(u).pathname)));assert(!xml.includes('<lastmod>'));
 for(const f of ['click-analysis.html','analysis.html','dashboard.html','post-form.html'])assert.match(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'),/name="robots" content="noindex/);
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));assert.equal(config.redirects.find(r=>r.source==='/index.html').destination,'/');
});

test('root middleware rewrites before static files without authentication and preserves actress query',async()=>{
 const {default:ts}=await import('typescript');const vm=await import('node:vm');
 const source=fs.readFileSync(new URL('../middleware.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(compiled,{exports,process,Response,URL,require:name=>name==='@vercel/functions'?{rewrite:url=>new Response(null,{headers:{'x-middleware-rewrite':String(url)}})}:{}});
 delete process.env.ADMIN_USER;delete process.env.ADMIN_PASSWORD;
 const r=exports.default(new Request('https://example.com/?actress=sample&view=ignored'));const target=new URL(r.headers.get('x-middleware-rewrite'));
 assert.equal(r.status,200);assert.equal(target.pathname,'/api/search');assert.equal(target.searchParams.get('view'),'page');assert.equal(target.searchParams.get('actress'),'sample');assert(!r.headers.get('x-robots-tag'));
});
