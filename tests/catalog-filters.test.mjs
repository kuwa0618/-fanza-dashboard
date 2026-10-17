import test,{afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import search from '../api/search.js';
import {readCatalogFilters,filterCatalogItems,catalogFilterPath} from '../lib/catalog-filters.js';
import {renderCatalogPage,activeCampaigns,selectCatalog} from '../lib/catalog-pages.js';
import {renderProductDetail} from '../lib/product-page.js';
const env={...process.env};afterEach(()=>{process.env={...env};mock.restoreAll();});
const work=(id,actress='出演者')=>({content_id:id,title:'作品 '+id,date:'2026-10-15 00:00:00',affiliateURL:'https://al.fanza.co.jp/?af_id=public',iteminfo:{actress:[{name:actress}],genre:[{name:'ドラマ'}],maker:{name:'メーカー'}},prices:{deliveries:{delivery:[{type:'hd',price:'500',list_price:'1000'}]}}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},send(b){this.body=b;return this;}});
test('public filters normalize names and reject duplicate, oversized and control-character input',()=>{
 assert.deepEqual(readCatalogFilters({actress:' 出演者 ',genre:'',maker:'Ｍａｋｅｒ',view:'page',keyword:'ignored'}),{actress:'出演者',maker:'Maker'});
 for(const value of [['出演者','別人'],'x'.repeat(81),'a\nb',42])assert.throws(()=>readCatalogFilters({actress:value}));
 assert.equal(catalogFilterPath('/sale',{actress:'A&B',maker:'メーカー'}),'/sale?actress=A%26B&maker=%E3%83%A1%E3%83%BC%E3%82%AB%E3%83%BC');
});
test('all filters verify exact upstream metadata with AND, not title mentions or partial names',()=>{
 const match=work('match');const titleOnly={...work('title','別人'),title:'出演者の作品'};
 assert.deepEqual(filterCatalogItems([titleOnly,work('partial','出演者の別名'),match],{actress:'出演者',genre:'ドラマ',maker:'メーカー'}).map(p=>p.content_id),['match']);
 assert.deepEqual(filterCatalogItems([match],{genre:'VR'}),[]);
});
test('filtered catalogs use one narrowed API request and verify names before the 20-card cap',async()=>{
 process.env.DMM_API_ID='secret';process.env.DMM_AFFILIATE_ID='private';let calls=0;
 const items=[...Array.from({length:25},(_,i)=>work('other_'+i,'別人')),work('wanted')];
 mock.method(globalThis,'fetch',async url=>{calls++;const q=new URL(url).searchParams;assert.equal(q.get('keyword'),'出演者 ドラマ メーカー');assert.equal(q.get('hits'),'100');assert.equal(q.get('sort'),'rank');return Response.json({result:{status:200,items}});});
 const r=response();await search({method:'GET',query:{view:'catalog',category:'sale',actress:'出演者',genre:'ドラマ',maker:'メーカー'}},r);
 assert.equal(calls,1);assert.equal(r.code,200);assert(r.body.includes('/product/wanted'));assert(!r.body.includes('/product/other_'));assert.equal(r.headers['x-robots-tag'],'noindex, follow');assert(r.headers.link.includes('actress='));assert(!r.body.includes('secret'));assert(!r.body.includes('private'));
});
test('empty matches remain empty, invalid input makes no API call, and outages remain 503',async()=>{
 process.env.DMM_API_ID='id';process.env.DMM_AFFILIATE_ID='affiliate';let calls=0;
 mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({result:{status:200,items:[work('wrong','別人')]}});});
 const empty=response();await search({method:'HEAD',query:{view:'catalog',category:'new',actress:'出演者'}},empty);assert.equal(empty.code,200);assert(empty.body.includes('作品一覧（0件）'));assert(!empty.body.includes('/product/wrong'));
 const bad=response();await search({method:'GET',query:{view:'catalog',category:'sale',actress:['one','two']}},bad);assert.equal(bad.code,400);assert.equal(calls,1);assert.equal(bad.headers['cache-control'],'no-store');
 mock.restoreAll();mock.method(globalThis,'fetch',async()=>{throw Error('upstream-secret');});const down=response();await search({method:'GET',query:{view:'catalog',category:'vr',actress:'出演者'}},down);assert.equal(down.code,503);assert.equal(down.headers['cache-control'],'no-store');assert(!down.body.includes('upstream-secret'));
});
test('filtered HTML is useful before JS, escapes names and preserves category/sale/internal and affiliate links',()=>{
 for(const key of ['sale','vr','new']){
  const html=renderCatalogPage(key,[work('real')],{filters:{actress:'A"<script>&',maker:'メーカー'}});
  assert(html.includes('id="catalogFilterForm"'));assert(html.includes('method="get"'));assert(html.includes('name="actress"'));assert(html.includes('表示中の条件のリンクをコピー'));assert(html.includes('noindex, follow'));assert(!html.includes('A"<script>'));
  assert(html.includes('/vr?actress=A%22%3Cscript%3E%26&amp;maker='));assert(html.includes('data-link-type="button"'));assert(html.includes('/sale?actress='+encodeURIComponent('出演者')));assert(html.includes('id="ageGate"'));assert(html.includes('inert'));
 }
 const detail=renderProductDetail(work('real'),'real');assert(detail.includes('/sale?actress='+encodeURIComponent('出演者')));assert(detail.includes('data-link-type="button"'));assert(detail.includes('/?actress='+encodeURIComponent('出演者')));
});
test('middleware whitelists public filters without permitting API override or hiding duplicates',async()=>{
 const {default:ts}=await import('typescript');const exports={};const compiled=ts.transpileModule(fs.readFileSync(new URL('../middleware.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(compiled,{exports,URL,URLSearchParams,Response,process,require:()=>({rewrite:u=>new Response(null,{headers:{'x-middleware-rewrite':String(u)}})})});
 const r=exports.default(new Request('https://example.com/sale?actress=one&actress=two&maker=maker&view=product&category=new&keyword=wrong&utm_source=x'));
 const q=new URL(r.headers.get('x-middleware-rewrite')).searchParams;assert.equal(q.get('view'),'catalog');assert.equal(q.get('category'),'sale');assert.deepEqual(q.getAll('actress'),['one','two']);assert.equal(q.get('maker'),'maker');assert(!q.has('keyword'));assert(!q.has('utm_source'));
});
test('copying uses displayed conditions, strips unrelated parameters, retains UTM and has a manual fallback',async()=>{
 for(const denied of [false,true]){
  let click,copied,selected=false,focused=false;const added=[];const field={hidden:true,focus(){focused=true;},select(){selected=true;}};const status={};
  const nodes={copyCatalogLink:{addEventListener:(name,fn)=>click=fn},catalogShareUrl:field,catalogShareStatus:status,catalogFilterForm:{appendChild:n=>added.push(n)}};
  const ctx={URL,location:{href:'https://example.com/sale?actress=one&utm_source=x&utm_content=post_1&secret=private&view=product#hash'},document:{getElementById:id=>nodes[id],createElement:()=>({})},navigator:{clipboard:{writeText:async value=>{if(denied)throw Error('denied');copied=value;}}}};
  vm.runInNewContext(fs.readFileSync(new URL('../catalog-filters.js',import.meta.url),'utf8'),ctx);await click();assert(!field.value.includes('private'));assert(!field.value.includes('view='));assert(!field.value.includes('#'));assert(field.value.includes('utm_content=post_1'));assert.equal(added.length,2);
  if(denied){assert.equal(field.hidden,false);assert(selected&&focused);assert(status.textContent.includes('自動コピーできません'));}else{assert.equal(copied,field.value);assert(status.textContent.includes('コピーしました'));}
 }
});
test('campaign dates are displayed only when complete, real, current and paired with an API title',()=>{
 const now=new Date('2026-10-17T12:00:00+09:00');const valid={title:'取得したキャンペーン',date_begin:'2026-10-16 10:00:00',date_end:'2026-10-19 09:59:59'};
 const bad=[{...valid,date_end:'2026-02-31 09:59:59'},{...valid,date_end:'2026-10-17 11:59:59'},{...valid,date_begin:'2026-10-18 10:00:00'},{...valid,date_end:''},{...valid,title:null}];
 assert.deepEqual(activeCampaigns({campaign:[valid,valid,...bad]},now),[{title:valid.title,end:valid.date_end}]);assert.deepEqual(activeCampaigns({},now),[]);
 assert.equal(selectCatalog('sale',[{...work('cross'),prices:{deliveries:{delivery:[{price:'500'},{price:'1000',list_price:'1000'}]}}}],now).length,0);
});
