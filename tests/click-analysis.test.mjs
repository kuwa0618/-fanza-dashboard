import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isAdminAuthorized } from '../lib/admin-auth.js';
import { getPeriod, aggregateClicks, normalizeSource } from '../lib/click-analytics.js';
import { clickAnalysis as analysis } from '../api/stats.js';
import click from '../api/click.js';

const env = { ...process.env };
afterEach(() => { mock.restoreAll(); process.env = { ...env }; });
const authorization = 'Basic ' + Buffer.from('test-admin:test-password:with-colon').toString('base64');
function configure() { process.env.ADMIN_USER = 'test-admin'; process.env.ADMIN_PASSWORD = 'test-password:with-colon'; process.env.SUPABASE_URL = 'https://database.invalid'; process.env.SUPABASE_ANON_KEY = 'test-server-key'; }
function res() { return { code: 200, headers: {}, setHeader(k,v) {this.headers[k.toLowerCase()]=v;}, status(code) {this.code=code; return this;}, json(body) {this.body=body; return this;} }; }
const request = (query={}) => ({method:'GET', headers:{authorization}, query});
const jsonResponse = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json',...headers}});

test('auth rejects absent, malformed, wrong and missing-config credentials; accepts UTF-8 and password colon', () => {
 configure();
 for (const value of [undefined, '', 'Bearer x', 'Basic !!!', 'Basic '+Buffer.from('test-admin').toString('base64'), 'Basic '+Buffer.from('wrong:test-password:with-colon').toString('base64'), 'Basic '+Buffer.from('test-admin:wrong').toString('base64')]) assert.equal(isAdminAuthorized(value),false);
 assert.equal(isAdminAuthorized(authorization),true);
 assert.equal(isAdminAuthorized(authorization,{}),false);
 assert.equal(isAdminAuthorized('Basic '+Buffer.from('管理者:日本語').toString('base64'),{ADMIN_USER:'管理者',ADMIN_PASSWORD:'日本語'}),true);
});
test('JST inclusive calendar range includes midnight boundaries, zero days and legacy rows', () => {
 const p=getPeriod({from:'2026-10-13',to:'2026-10-14'},new Date('2026-10-14T10:00Z'));
 assert.equal(p.start,'2026-10-12T15:00:00.000Z');
 const data=aggregateClicks([
 {content_id:'a',title:'旧作品',clicked_at:'2026-10-12T15:00:00Z'},
 {content_id:'a',clicked_at:'2026-10-13T14:59:59Z',link_source:'search',link_type:'image'},
 {content_id:'b',clicked_at:'2026-10-13T15:00:00Z',link_source:'search',link_type:'button'},
 {content_id:'x',clicked_at:'2026-10-12T14:59:59Z'},
 {content_id:'x',clicked_at:p.end},
 {clicked_at:'invalid'},
 ],p);
 assert.deepEqual(data.daily,[{date:'2026-10-13',clicks:2},{date:'2026-10-14',clicks:1}]);
 assert.equal(data.total,3);assert.equal(data.uniqueProducts,2);assert.equal(data.products[0].clicks,2);
 assert.equal(data.sources.find(x=>x.source==='unknown').clicks,1);
 assert.equal(data.sources.find(x=>x.source==='search').clicks,2);
 assert.deepEqual(data.linkTypes,{image:1,button:1,unknown:1});
 const empty=aggregateClicks([],p);assert.equal(empty.daily.length,2);assert(empty.daily.every(x=>x.clicks===0));
});
test('period validates date ranges and presets', () => {
 for (const q of [{days:'1000'},{days:['7','30']},{from:'2026-02-30',to:'2026-03-01'},{from:'2026-01-01',to:'2026-10-01'},{from:'2026-10-14',to:'2026-10-13'},{from:'2027-01-01',to:'2027-01-02'},{from:['2026-10-13'],to:'2026-10-14'}]) assert.throws(()=>getPeriod(q,new Date('2026-10-14T10:00Z')));
 assert.equal(getPeriod({days:'7'},new Date('2026-10-14T10:00Z')).from,'2026-10-08');
 assert.equal(normalizeSource('__proto__'),'unknown'); assert.equal(normalizeSource({toString:'broken'}),'unknown');
});
test('analysis API refuses unauthorized access before any database query',async()=>{
 configure(); let queries=0;mock.method(globalThis,'fetch',async()=>{queries++;throw Error('should not query')});
 for(const value of [undefined,'Basic bad']){const r=res();await analysis({...request(),headers:{authorization:value}},r);assert.equal(r.code,401);assert.match(r.headers['www-authenticate'],/Basic/);assert.match(r.headers['cache-control'],/no-store/);}
 assert.equal(queries,0);
 delete process.env.ADMIN_PASSWORD;const r=res();await analysis(request(),r);assert.equal(r.code,503);assert.equal(queries,0);
});
test('analysis uses exact pagination even if DB page size is below 1000',async()=>{
 configure();const now=new Date();const row={content_id:'a',title:'Title',clicked_at:new Date(now.getTime()-60000).toISOString(),link_source:'sale',link_type:'image'};
 const offsets=[];mock.method(globalThis,'fetch',async(url,opts)=>{const u=new URL(url);offsets.push(u.searchParams.get('offset'));assert.equal(u.searchParams.getAll('clicked_at').length,2);assert.match(opts.headers.Authorization,/test-server-key/);return jsonResponse([row],200,{'content-range':`${offsets.length-1}-${offsets.length-1}/3`});});
 const r=res();await analysis(request(),r);assert.equal(r.code,200);assert.deepEqual(offsets,['0','1','2']);assert.equal(r.body.total,3);assert.equal(r.body.sourceTrackingAvailable,true);assert(!JSON.stringify(r.body).includes('test-server-key'));
});
test('analysis falls back only for missing source columns and reports migration status',async()=>{
 configure();let queries=0;mock.method(globalThis,'fetch',async(url)=>{queries++;if(queries===1)return jsonResponse({code:'42703',message:'column click_logs.link_source does not exist'},400);assert(!new URL(url).searchParams.get('select').includes('link_source'));return jsonResponse([{content_id:'old',clicked_at:new Date(Date.now()-60000).toISOString()}],200,{'content-range':'0-0/1'});});
 const r=res();await analysis(request(),r);assert.equal(r.code,200);assert.equal(r.body.sourceTrackingAvailable,false);assert.equal(r.body.sources.find(s=>s.source==='unknown').clicks,1);assert.equal(queries,2);
});
test('analysis masks DB errors, rejects excessive counts and invalid inputs',async()=>{
 configure();mock.method(globalThis,'fetch',async()=>jsonResponse({message:'secret database SQL detail'},403));let r=res();await analysis(request(),r);assert.equal(r.code,502);assert(!JSON.stringify(r.body).includes('secret'));
 mock.restoreAll();mock.method(globalThis,'fetch',async()=>jsonResponse([],200,{'content-range':'0-0/100001'}));r=res();await analysis(request(),r);assert.equal(r.code,422);
 r=res();await analysis(request({from:'bad'}),r);assert.equal(r.code,400);
 r=res();await analysis({...request(),method:'POST'},r);assert.equal(r.code,405);
});
test('legacy and new click payloads are accepted, sanitized, and metadata stays server-side',async()=>{
 configure();const bodies=[];mock.method(globalThis,'fetch',async(_,options)=>{bodies.push(JSON.parse(options.body));return new Response(null,{status:201});});
 for(const input of [{content_id:'old'},{content_id:'new',link_source:'search',link_type:'image',title:'作品'},{content_id:'bad-source',link_source:'<script>',link_type:'<script>'}]){const r=res();await click({method:'POST',body:input},r);assert.equal(r.code,200);assert.equal(r.body.source_recorded,true);}
 assert.equal(bodies[0].link_source,'unknown');assert.equal(bodies[1].link_source,'search');assert.equal(bodies[1].link_type,'image');assert.equal(bodies[2].link_source,'unknown');
 const r=res();await click({method:'POST',body:{content_id:{}}},r);assert.equal(r.code,400);
});
test('missing-column insert is retried once without new fields; other failures are not retried',async()=>{
 configure();const bodies=[];mock.method(globalThis,'fetch',async(_,options)=>{bodies.push(JSON.parse(options.body));if(bodies.length===1)return jsonResponse({code:'PGRST204',message:"Could not find the 'link_type' column"},400);return new Response(null,{status:201});});
 let r=res();await click({method:'POST',body:{content_id:'test',link_source:'ranking'}},r);assert.equal(r.code,200);assert.equal(r.body.source_recorded,false);assert.equal(bodies.length,2);assert(!('link_source' in bodies[1]));
 mock.restoreAll();let attempts=0;mock.method(globalThis,'fetch',async()=>{attempts++;throw new Error('timeout secret');});r=res();await click({method:'POST',body:{content_id:'test'}},r);assert.equal(r.code,502);assert.equal(attempts,1);assert(!JSON.stringify(r.body).includes('secret'));
});
test('all link placements, including images, use a single non-blocking keepalive record per activation',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');const calls=[];const ga=[];
 const context=vm.createContext({fetch:(url,options)=>{calls.push(JSON.parse(options.body));assert.equal(options.keepalive,true);return Promise.resolve({ok:true});},console,window:{gtag:(...args)=>ga.push(args)},localStorage:{getItem:()=> '[]',setItem:()=>{}},saveRelatedSource:()=>{}});
 vm.runInContext(app.slice(0,app.indexOf('let products =')),context);
 for(const source of ['search','recommendation','sale','related','ranking','favorites','history'])for(const type of ['image','button']){const link={listeners:{},addEventListener(name,fn){this.listeners[name]=fn}};const product={id:'x',title:'作品',url:'https://example.com',actresses:[],genres:[]};context.bindFanzaProductLink(link,product,source,type);const count=calls.length;link.listeners.click({type:'click'});assert.equal(calls.length,count+1);assert.equal(calls.at(-1).link_source,source);assert.equal(calls.at(-1).link_type,type);link.listeners.auxclick({type:'auxclick',button:2});assert.equal(calls.length,count+1);link.listeners.auxclick({type:'auxclick',button:1});assert.equal(calls.length,count+2);}
 assert.equal(ga.length,28);
 // Ensure each image renderer passes its actual placement rather than generic "image".
 assert.match(app,/bindFanzaProductLink\(imageLink, product, source, "image"\)/);
 for(const source of ['recommendation','sale','related'])assert(app.includes(`node.querySelector(".placeholder"),\n      "${source}"`));
});

test('middleware protects HTML and aliases, preserves no-store headers on success, fails closed',async()=>{
 const { default: ts } = await import('typescript');
 const { adminHeaders } = await import('../lib/admin-auth.js');
 const source=fs.readFileSync(new URL('../middleware.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};const sandbox={exports,process,Response,URL,require:(name)=>name==='@vercel/functions'?{next:({headers})=>new Response('next',{headers})}:{isAdminAuthorized,adminHeaders}};
 vm.runInNewContext(compiled,sandbox);
 configure();const unauth=exports.default(new Request('https://example.com/click-analysis.html'));assert.equal(unauth.status,401);
 const auth=exports.default(new Request('https://example.com/click-analysis.html',{headers:{authorization}}));assert.equal(auth.status,200);assert.match(auth.headers.get('cache-control'),/private, no-store/);
 for(const route of ['/click-analysis.html','/click-analysis/:path*','/api/stats'])assert(exports.config.matcher.includes(route));
 delete process.env.ADMIN_USER;assert.equal(exports.default(new Request('https://example.com/click-analysis.html',{headers:{authorization}})).status,503);
});
