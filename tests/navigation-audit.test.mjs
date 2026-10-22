import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const noop = () => {};

function searchContext(fetch) {
  const elements = {keyword:{value:'VR'}, sortFilter:{value:'popular'}, searchBtn:{}, resultCount:{}};
  const messages = [];
  const ctx = vm.createContext({fetch, URLSearchParams, AbortSignal, console:{error:noop},
    $:id=>elements[id], asArray:v=>Array.isArray(v)?v:[], normalizeProduct:p=>p,
    localStorage:{setItem:noop}, updateFilters:noop, render:noop, updateLoadMoreButton:noop,
    showMessage:message=>messages.push(message), renderRecommendations:message=>messages.push(message),
    searchRequestId:0, nextOffset:1, products:[], recommendationProducts:[], favorites:[],
    favoriteProducts:{}, isLoadingMore:false,
  });
  vm.runInContext(app.slice(app.indexOf('async function fetchProducts('), app.indexOf('function renderRecommendations(')), ctx);
  return {ctx, elements, messages};
}

test('recommendations survive both initial response orders, searches, append and failed searches', async () => {
  for (const recommendFirst of [true, false]) {
    const pending = [];
    const {ctx} = searchContext(url=>new Promise(resolve=>pending.push({url, resolve})));
    const searching = ctx.fetchProducts();
    const recommending = ctx.fetchRecommendations();
    const response = item=>({ok:true,json:async()=>item});
    const search = pending.find(p=>!p.url.includes('mode='));
    const recommend = pending.find(p=>p.url.includes('mode=recommend'));
    const finishSearch = async()=>{search.resolve(response({success:true,products:[{id:'result'}],recommendations:[],totalCount:1}));await searching;};
    const finishRecommend = async()=>{recommend.resolve(response({success:true,products:[{id:'recommended'}]}));await recommending;};
    if (recommendFirst) {await finishRecommend();await finishSearch();} else {await finishSearch();await finishRecommend();}
    assert.equal(ctx.recommendationProducts[0].id, 'recommended');
    ctx.fetch=async()=>response({success:true,products:[{id:'next'}],recommendations:[]});
    await ctx.fetchProducts();await ctx.fetchProducts(true);
    assert.equal(ctx.recommendationProducts[0].id,'recommended');
    ctx.fetch=async()=>({ok:false,json:async()=>({success:false,error:'failure'})});
    await ctx.fetchProducts();
    assert.equal(ctx.recommendationProducts[0].id,'recommended');
  }
});

test('recommendation failure provides a visible explanation without exposing upstream errors',async()=>{
  const {ctx,messages}=searchContext(async()=>{throw Error('private upstream detail');});
  await ctx.fetchRecommendations();
  assert.match(messages[0],/おすすめ作品を取得できませんでした/);
  assert(!messages[0].includes('private'));
});

test('empty recommendations have a status and disabled carousel controls',()=>{
  const elements={recommendSection:{},recommendResults:{children:[],set innerHTML(v){this.children=[];},appendChild(p){this.children.push(p);}},recommendPrevBtn:{},recommendNextBtn:{},recommendMoreBtn:{style:{}}};
  const ctx=vm.createContext({document:{getElementById:id=>elements[id],createElement:()=>({setAttribute(k,v){this[k]=v;}})},recommendationProducts:[],recommendationVisibleCount:6});
  vm.runInContext(app.slice(app.indexOf('function renderRecommendations('),app.indexOf('async function fetchSaleProducts(')),ctx);
  ctx.renderRecommendations();
  assert.equal(elements.recommendResults.children[0].role,'status');
  assert.equal(elements.recommendResults.children[0].textContent,'おすすめ作品は現在ありません。');
  assert.equal(elements.recommendPrevBtn.disabled,true);assert.equal(elements.recommendNextBtn.disabled,true);
  assert.equal(elements.recommendMoreBtn.style.display,'none');
});

test('hash shortcuts and Back/Forward preserve filters, while actress query navigation still reloads',()=>{
  const handlers={};const keyword={value:'VR'};const calls=[];
  const location={search:''};
  const ctx=vm.createContext({window:{location,addEventListener:(name,fn)=>handlers[name]=fn},history:{pushState:(_,__,url)=>{location.search=new URL(url,'https://example.com').search;}},URLSearchParams,
    $:()=>keyword, fetchProducts:()=>calls.push('fetch'),renderRecommendations:noop,
    applyActressPageState:(name,push)=>{calls.push([name,push]);keyword.value=name;},setDefaultPageState:()=>calls.push('default'),navigationSearch:''});
  vm.runInContext(app.slice(app.indexOf('function pushSearchHistory('),app.indexOf('const $ =')),ctx);
  const start=app.lastIndexOf('window.addEventListener(');
  vm.runInContext(app.slice(start,app.indexOf('\nif (\n  localStorage',start)),ctx);
  handlers.popstate();assert.equal(keyword.value,'VR');assert.deepEqual(calls,[]);
  ctx.pushSearchHistory({actress:'出演者'},'', '/?actress=performer');keyword.value='performer';
  handlers.popstate();assert.deepEqual(calls,[]);
  location.search='';handlers.popstate();assert.equal(keyword.value,'');assert.deepEqual(calls,['default','fetch']);
  calls.length=0;location.search='?actress=performer';handlers.popstate();assert.deepEqual(calls,[['performer',false],'fetch']);
  calls.length=0;handlers.popstate();assert.deepEqual(calls,[]);
  assert.equal((app.match(/history\.pushState\(/g)||[]).length,1);
});

test('ranking titles link to valid actual IDs, escape titles and make no unmeasured growth claim',async()=>{
  const list={innerHTML:''};let invalid=false;
  const ctx=vm.createContext({document:{querySelectorAll:()=>[],getElementById:()=>list},encodeURIComponent,AbortSignal,console,
    fetch:async url=>({json:async()=>url.startsWith('/api/rankings')?{rankings:[{content_id:'actual_001',clicks:3,title:'sample'}]}:{products:[{content_id:invalid?'bad/id':'actual_001',title:'Title <script> & "',affiliateURL:'https://example.com/',imageURL:{large:'https://example.com/cover.jpg'},prices:{price:'500'}}]}})});
  vm.runInContext(html.slice(html.indexOf('let currentPeriod ='),html.indexOf('function renderSimpleRanking')),ctx);
  await ctx.loadRankings();assert.match(list.innerHTML,/href="\/product\/actual_001"/);assert(list.innerHTML.includes('Title &lt;script&gt; &amp; &quot;'));
  assert(!list.innerHTML.includes('急上昇'));assert(!list.innerHTML.includes('<script>'));
  assert(list.innerHTML.includes('ranking-image-link'));assert(list.innerHTML.includes('ranking-card-button'));
  invalid=true;await ctx.loadRankings();assert(!list.innerHTML.includes('href="/product/'));
  for(const [id,label]of [['genreFilter','ジャンルで絞り込む'],['makerFilter','メーカーで絞り込む'],['sortFilter','作品の並び順']])assert(html.includes(`id="${id}" aria-label="${label}"`));
});

