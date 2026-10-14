import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import search from '../api/search.js';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function asArray'),source.indexOf('function updateSelectOptions'));
const ctx=vm.createContext({Date,Number,String,Math});vm.runInContext(helpers,ctx);
const normalize=(p)=>ctx.normalizeProduct({content_id:'a',...p});
const env={...process.env};afterEach(()=>{mock.restoreAll();process.env={...env};});
test('sale uses paired delivery prices, recognizes actual discounts and rejects malformed ranges',()=>{
 let p=normalize({prices:{price:'500',deliveries:{delivery:[{price:'500'},{price:'1000',list_price:'1000'}]}}});
 assert(!p.tags.includes('セール'));
 p=normalize({prices:{price:'500~',list_price:'1,000~'}});assert(p.tags.includes('セール'));assert.equal(p.price,500);
 p=normalize({prices:{price:'500～1000',list_price:'2000'}});assert(!p.tags.includes('セール'));assert.equal(p.price,0);
 p=normalize({prices:{deliveries:{delivery:{type:'hd',price:'700',list_price:'1000'}}}});assert(p.tags.includes('セール'));assert.equal(p.listPrice,1000);
});
test('high ratings use actual decimal average and positive review count; missing data creates no rating',()=>{
 for(const review of [null,{}, {average:'4.9',count:0},{average:'6',count:4},{average:'invalid',count:3},{average:'4.8',count:1.5}]){const p=normalize({review});assert.equal(p.review,null);assert(!p.tags.includes('高評価'));}
 for(const [average,expected]of [['3.99',false],['4.0',true],['4.75',true]]){const p=normalize({review:{average,count:'12'}});assert.equal(p.tags.includes('高評価'),expected);assert.equal(p.review.average,Number(average));}
});
test('search forwards allowlisted sort and pagination to upstream and returns genuine rank positions',async()=>{
 process.env.DMM_API_ID='test';process.env.DMM_AFFILIATE_ID='test';
 for(const [requested,expected]of [['rank','rank'],['price','price'],['date','date'],['injected','date']]){
 mock.method(globalThis,'fetch',async url=>{const p=new URL(url).searchParams;assert.equal(p.get('sort'),expected);assert.equal(p.get('offset'),'21');assert.equal(p.get('keyword'),'sample');return Response.json({result:{status:200,total_count:50,first_position:21,result_count:2,items:[{content_id:'b'},{content_id:'a'}]}});});
 const r={status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
 await search({method:'GET',query:{sort:requested,offset:'21',keyword:'sample'}},r);
 assert.equal(r.code,200);assert.deepEqual(r.body.products.map(x=>x.content_id),['b','a']);assert.equal(r.body.products[0].catalogRank,expected==='rank'?21:undefined);mock.restoreAll();
 }
});
test('sale API does not infer a discount by comparing unrelated formats',async()=>{
 process.env.DMM_API_ID='test';process.env.DMM_AFFILIATE_ID='test';
 const items=[{content_id:'false',prices:{price:'500',list_price:'1000',deliveries:{delivery:[{price:'500'},{price:'1000',list_price:'1000'}]}}},{content_id:'sale',prices:{deliveries:{delivery:{price:'500',list_price:'1000'}}}}];
 mock.method(globalThis,'fetch',async()=>Response.json({result:{status:200,result_count:2,items}}));
 const r={status(){return this;},json(b){this.body=b;return this;}};await search({method:'GET',query:{mode:'sale'}},r);assert.deepEqual(r.body.products.map(p=>p.content_id),['sale']);
});
