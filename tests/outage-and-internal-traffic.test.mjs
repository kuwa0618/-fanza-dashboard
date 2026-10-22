import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import search from '../api/search.js';
import { renderCatalogPage } from '../lib/catalog-pages.js';
import { renderProductError } from '../lib/product-page.js';

const originalEnv = {...process.env};
afterEach(() => { process.env = {...originalEnv}; mock.restoreAll(); });
const response = () => ({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}});
const configure = () => {process.env.DMM_API_ID='test';process.env.DMM_AFFILIATE_ID='test';};

test('maintenance HTML, rejected JSON and malformed success are unavailable, not zero results or upstream text',async()=>{
 configure();
 for(const upstream of [new Response('<html>maintenance-private-detail</html>',{status:503}), Response.json({result:{status:503,message:'<img onerror=privateDetail>'}}),Response.json({result:{status:200}})]){
  mock.method(globalThis,'fetch',async()=>upstream);
  const r=response();await search({method:'GET',query:{}},r);
  assert.equal(r.code,503);assert.equal(r.body.success,false);
  assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers['Retry-After'],'60');
  assert(!JSON.stringify(r.body).includes('private'));assert(!JSON.stringify(r.body).includes('<img'));
  mock.restoreAll();
 }
 mock.method(globalThis,'fetch',async()=>Response.json({result:{status:200,items:[],total_count:0,result_count:0}}));
 const empty=response();await search({method:'GET',query:{}},empty);
 assert.equal(empty.code,200);assert.equal(empty.body.success,true);assert.deepEqual(empty.body.products,[]);
});

test('an unresponsive upstream request is aborted and becomes a retryable 503',async()=>{
 configure();const timeout=AbortSignal.timeout.bind(AbortSignal);
 mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,5000);return timeout(5);});
 mock.method(globalThis,'fetch',(_,options)=>new Promise((resolve,reject)=>{
  const keepAlive=setTimeout(()=>reject(Error('request failed to abort')),500);
  options.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(options.signal.reason);},{once:true});
 }));
 const r=response();await search({method:'GET',query:{}},r);
 assert.equal(r.code,503);assert.equal(r.headers['Retry-After'],'60');
});

test('failed searches show an unavailable count, reset controls, and do not render upstream HTML',async()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const controls={keyword:{value:'test'},sortFilter:{value:'date'},searchBtn:{},resultCount:{}};
 const messages=[];
 const ctx=vm.createContext({fetch:async()=>({ok:false,json:async()=>({success:false,error:'<img src=x onerror=alert(1)>'})}),AbortSignal,URLSearchParams,
  $:id=>controls[id],showMessage:m=>messages.push(m),searchRequestId:0,nextOffset:1,isLoadingMore:false,console:{error(){}},
 });
 vm.runInContext(app.slice(app.indexOf('async function fetchProducts('),app.indexOf('async function fetchRecommendations(')),ctx);
 await ctx.fetchProducts();
 assert.equal(controls.resultCount.textContent,'—');assert.equal(controls.searchBtn.disabled,false);assert.equal(controls.searchBtn.textContent,'検索');
 assert.match(messages.at(-1),/取得できません/);assert(!messages.at(-1).includes('<img'));
});

function internalContext(search,stored={}) {
 const ctx={URL,URLSearchParams,Object,window:{location:{search,href:'https://example.test/'+search}},
  sessionStorage:{getItem:k=>stored[k]||null,setItem:(k,v)=>stored[k]=v,removeItem:k=>delete stored[k]},
  document:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(new URL('../analytics-context.js',import.meta.url),'utf8'),ctx);
 return ctx;
}
test('internal checks persist across same-tab navigation and can explicitly resume normal collection',()=>{
 const stored={};const entered=internalContext('?internal_test=1',stored);
 assert.equal(entered.window.FanzaAnalytics.isInternal,true);assert.equal(entered.window['ga-disable-G-RK6R5HVKZC'],true);
 assert.equal(internalContext('',stored).window.FanzaAnalytics.isInternal,true);
 assert.equal(internalContext('?internal_test=0',stored).window.FanzaAnalytics.isInternal,false);
 assert.equal(internalContext('',stored).window.FanzaAnalytics.isInternal,false);
 assert.equal(internalContext('?utm_source=x&utm_medium=social').window.FanzaAnalytics.isInternal,false);
});

test('internal homepage and catalog clicks preserve links/history without writing either analytics system',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');let calls=0;
 const homepage=vm.createContext({window:{FanzaAnalytics:{isInternal:true},gtag:()=>calls++},fetch:()=>calls++});
 vm.runInContext(app.slice(0,app.indexOf('// Internal detail navigation')),homepage);
 homepage.trackFanzaClick({id:'test001',url:'https://example.test/'});assert.equal(calls,0);
 const handlers={},stored={};const link={dataset:{product:'0'},addEventListener:(name,fn)=>handlers[name]=fn,href:'https://example.test/'};
 const nodes={mainContent:{inert:false},ageGate:{classList:{add(){}}},enterBtn:{addEventListener(){}},leaveBtn:{addEventListener(){}},catalogProducts:{textContent:JSON.stringify([{id:'test001',url:link.href,actresses:[],genres:[]}])}};
 vm.runInNewContext(fs.readFileSync(new URL('../catalog.js',import.meta.url),'utf8'),{window:{FanzaAnalytics:{isInternal:true},gtag:()=>calls++},fetch:()=>calls++,localStorage:{getItem:k=>stored[k]||null,setItem:(k,v)=>stored[k]=v},document:{getElementById:id=>nodes[id],querySelectorAll:s=>s==='[data-product]'?[link]:[],body:{dataset:{catalog:'sale'}}}});
 handlers.click({type:'click'});assert.equal(calls,0);assert.equal(link.href,'https://example.test/');assert.equal(JSON.parse(stored.viewHistory)[0].id,'test001');
});

test('every measured page initializes opt-out before Google tag configuration',()=>{
 const pages=[fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),renderCatalogPage('sale',[]),renderProductError('一時的に取得できません')];
 for(const html of pages){assert(html.indexOf('/analytics-context.js')>0);assert(html.indexOf('/analytics-context.js')<html.indexOf('googletagmanager.com'));}
});

test('ranking failure is explained and price ranges are not concatenated into fictitious prices',async()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),list={innerHTML:''};
 const ctx=vm.createContext({document:{querySelectorAll:()=>[],getElementById:()=>list},AbortSignal,console:{error(){}},fetch:async()=>{throw Error('maintenance');}});
 vm.runInContext(html.slice(html.indexOf('let currentPeriod ='),html.indexOf('function renderSimpleRanking')),ctx);
 await ctx.loadRankings();assert.match(list.innerHTML,/ランキングを取得できませんでした/);
 assert.equal(ctx.formatRankingPrice('500～1000'),'');assert.equal(ctx.formatRankingPrice('1,000~'),'1,000');
});
