import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SITE_URL} from '../lib/seo.js';
import {renderProductDetail} from '../lib/product-page.js';
import {PUBLIC_PATHS,MAX_PRODUCTS,MAX_DETAIL_CHECKS,detailLinks,pageIsIndexable,validDetail,renderSitemap,validateSitemap,collectSitemap,refreshSitemap} from '../scripts/update-sitemap.mjs';

const response=(status=200,headers={})=>new Response('',{status,headers:{'content-type':'text/html; charset=utf-8',...headers}});
const id='actual001';
const detail=(value=id)=>renderProductDetail({content_id:value,title:'API title',affiliateURL:'https://al.fanza.co.jp/'},value);
const page=(path,links=[])=>`<link rel="canonical" href="${new URL(path,SITE_URL).href}"><h1>Catalog</h1>${links.map(p=>`<a href="${p}">detail</a>`).join('')}`;
const fixtureFetch=(ids,{broken=new Map(),calls=[]}={})=>async(url,options)=>{
 const path=new URL(url).pathname;calls.push(path);assert.equal(options.redirect,'manual');assert(options.signal);
 if(PUBLIC_PATHS.includes(path))return new Response(page(path,ids.map(i=>'/product/'+i)),{headers:{'content-type':'text/html'}});
 if(broken.has(path)){const value=broken.get(path);if(value instanceof Error)throw value;return value;}
 return new Response(detail(path.slice(9)),{headers:{'content-type':'text/html'}});
};

test('only exact product anchors are discovered, with unique canonical URLs and seven public pages',()=>{
 assert.deepEqual(detailLinks(page('/sale',['/product/'+id,'/product/'+id,'/product/bad-id','/product/'+id+'?x=1','https://evil.example/product/'+id,'https://user@fanza-dashboard-omega.vercel.app/product/'+id,'/api/search'])),['/product/'+id]);
 const xml=renderSitemap([...PUBLIC_PATHS,'/product/'+id]);assert.equal(validateSitemap(xml).urls.length,8);assert(!xml.includes('lastmod'));
 for(const invalid of [xml.replace('<url><loc>', '<lastmod>2026-01-01</lastmod><url><loc>'),xml.replace('/product/'+id,'/api/search'),xml.replace('/product/'+id,'/product/'+id+'?page=2'),xml.replace('/product/'+id,'/product/bad-id'),xml.replace('https://fanza-dashboard-omega.vercel.app/product/','https://user@fanza-dashboard-omega.vercel.app/product/'),xml.replace('</urlset>','<unexpected/></urlset>')])assert.throws(()=>validateSitemap(invalid));
 assert.throws(()=>renderSitemap([...PUBLIC_PATHS,PUBLIC_PATHS[0]]));assert.throws(()=>renderSitemap(PUBLIC_PATHS.slice(1)));
});

test('details require HTTP 200, one self canonical, matching product data, H1 and internal return links',()=>{
 const html=detail();assert(validDetail(response(),html,'/product/'+id));
 for(const status of [302,404,503])assert(!validDetail(response(status),html,'/product/'+id));
 for(const headers of [{'x-robots-tag':'noindex'},{'content-type':'text/plain'}])assert(!validDetail(response(200,headers),html,'/product/'+id));
 for(const bad of [html.replace('/product/'+id,'/product/wrong001'),html.replace('data-content-id="'+id+'"','data-content-id="wrong001"'),html.replace('"id":"'+id+'"','"id":"wrong001"'),html.replace('<h1>','<h2>'),html.replace('</head>','<meta name="robots" content="noindex"></head>'),html.replaceAll('href="/sale"','href="/missing"').replaceAll('href="/vr"','href="/missing"').replaceAll('href="/new"','href="/missing"').replaceAll('href="/"','href="/missing"')])assert(!validDetail(response(),bad,'/product/'+id));
 assert(!pageIsIndexable({...response(),status:200,url:SITE_URL+'/redirected',headers:response().headers},html,'/product/'+id));
});

test('refresh checks at most 20 products, deduplicates category links and spaces all requests',async()=>{
 const ids=Array.from({length:60},(_,i)=>'actual'+String(i).padStart(3,'0'));const calls=[],waits=[];
 const result=await collectSitemap({fetcher:fixtureFetch(ids,{calls}),wait:async ms=>waits.push(ms)});
 assert.equal(result.products,MAX_PRODUCTS);assert.equal(result.checked,30);assert.equal(result.requests,37);assert.equal(new Set(calls).size,37);assert.equal(waits.length,36);assert(waits.every(ms=>ms===1200));assert.equal(validateSitemap(result.xml).urls.length,27);
});

test('404 and redirects are excluded, bounded to 30 detail checks; temporary failures abort',async()=>{
 const ids=Array.from({length:50},(_,i)=>'actual'+String(i).padStart(3,'0'));const broken=new Map(ids.slice(0,15).map((value,i)=>['/product/'+value,new Response('unavailable',{status:[404,302][i%2],headers:{'content-type':'text/html'}})]));
 const result=await collectSitemap({fetcher:fixtureFetch(ids,{broken}),wait:async()=>{}});
 assert.equal(result.checked,MAX_DETAIL_CHECKS);assert.equal(result.requests,37);assert.equal(result.products,15);assert.equal(result.skipped.length,15);for(const p of broken.keys())assert(!result.xml.includes(p));
 await assert.rejects(collectSitemap({fetcher:fixtureFetch(ids,{broken:new Map(ids.map(value=>['/product/'+value,new Response('missing',{status:404})]))}),wait:async()=>{}}),/No verified products/);
 for(const value of [Error('upstream'),new Response('temporary',{status:503}),new Response('limited',{status:429})])await assert.rejects(collectSitemap({fetcher:fixtureFetch(ids,{broken:new Map([['/product/'+ids[5],value]])}),wait:async()=>{}}),/Temporary product failure/);
 await assert.rejects(collectSitemap({fetcher:async()=>new Response('unavailable',{status:503}),wait:async()=>{}}),/Public page unavailable/);
});

test('existing products are all revalidated before new candidates and invalid slots are replenished',async()=>{
 const existing=Array.from({length:20},(_,i)=>'/product/old'+String(i).padStart(3,'0'));const calls=[];
 const result=await collectSitemap({existingPaths:existing,fetcher:fixtureFetch(['fresh001','fresh002'],{calls,broken:new Map([[existing[0],new Response('missing',{status:404})]])}),wait:async()=>{}});
 assert.deepEqual(calls.slice(7,27),existing);assert.equal(result.requests,29);const urls=validateSitemap(result.xml).urls;assert(!urls.some(u=>u.endsWith(existing[0])));assert(urls.some(u=>u.endsWith('/product/fresh001')));assert.equal(result.products,20);
});

test('healthy existing 20 products survive newly discovered candidates without rewriting the sitemap',async()=>{
 const existing=Array.from({length:20},(_,i)=>'/product/old'+String(i).padStart(3,'0'));
 const discovered=Array.from({length:30},(_,i)=>'fresh'+String(i).padStart(3,'0'));
 const dir=await mkdtemp(join(tmpdir(),'sitemap-priority-'));const file=join(dir,'sitemap.xml');
 const previous=renderSitemap([...PUBLIC_PATHS,...existing]);await writeFile(file,previous);
 try{
  const calls=[];const result=await refreshSitemap(file,{fetcher:fixtureFetch(discovered,{calls}),wait:async()=>{}});
  assert.equal(result.changed,false);assert.equal(result.products,20);assert.equal(result.requests,37);
  assert.deepEqual(calls.slice(7,27),existing);assert.equal(new Set(calls).size,calls.length);
  assert.deepEqual(validateSitemap(result.xml).urls.map(u=>new URL(u).pathname),[...PUBLIC_PATHS,...existing]);
  assert.equal(await readFile(file,'utf8'),previous);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('only the invalid existing slot is filled, skipping invalid new candidates and retaining all other existing URLs',async()=>{
 const existing=Array.from({length:20},(_,i)=>'/product/old'+String(i).padStart(3,'0'));
 const invalid=existing[5];const broken=new Map([[invalid,new Response('missing',{status:404})],['/product/fresh001',new Response('missing',{status:404})]]);
 const result=await collectSitemap({existingPaths:existing,fetcher:fixtureFetch(['fresh001','fresh002','fresh003'],{broken}),wait:async()=>{}});
 const paths=validateSitemap(result.xml).urls.map(u=>new URL(u).pathname);
 assert.equal(result.products,20);assert.deepEqual(paths.slice(0,7),PUBLIC_PATHS);
 assert.deepEqual(paths.slice(7).sort(),[...existing.filter(p=>p!==invalid),'/product/fresh002'].sort());
 assert(!paths.includes('/product/fresh003'));assert.deepEqual(result.skipped,[invalid,'/product/fresh001']);
});

test('zero healthy existing or replacement products leave the previous sitemap unchanged',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sitemap-empty-'));const file=join(dir,'sitemap.xml');
 const previous=renderSitemap([...PUBLIC_PATHS,'/product/old001']);await writeFile(file,previous);
 try{
  const broken=new Map(['/product/old001','/product/fresh001'].map(p=>[p,new Response('missing',{status:404})]));
  await assert.rejects(refreshSitemap(file,{fetcher:fixtureFetch(['fresh001'],{broken}),wait:async()=>{}}),/No verified products/);
  assert.equal(await readFile(file,'utf8'),previous);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('unchanged URL sets do not rewrite files or cause order-only proposals; partial outage preserves bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sitemap-test-'));const file=join(dir,'sitemap.xml');const previous=renderSitemap([...PUBLIC_PATHS,'/product/old001','/product/old002']);await writeFile(file,previous);
 try{
  let seen;
  const result=await refreshSitemap(file,{collect:async options=>{seen=options.existingPaths;return {xml:renderSitemap([...PUBLIC_PATHS,'/product/old002','/product/old001'])};}});assert.deepEqual(seen,['/product/old001','/product/old002']);assert.equal(result.changed,false);assert.equal(await readFile(file,'utf8'),previous);
  await assert.rejects(refreshSitemap(file,{fetcher:fixtureFetch(['old001','old002'],{broken:new Map([['/product/old002',new Response('outage',{status:503})]])}),wait:async()=>{}}),/Temporary product failure/);assert.equal(await readFile(file,'utf8'),previous);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an unavailable or malformed refresh preserves the previous complete sitemap, successful writes replace atomically',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sitemap-test-'));const file=join(dir,'sitemap.xml');const previous=renderSitemap(PUBLIC_PATHS);await writeFile(file,previous);
 try{
  for(const collect of [async()=>{throw Error('network')},async()=>({xml:'<urlset>broken</urlset>'})]){await assert.rejects(refreshSitemap(file,{collect}));assert.equal(await readFile(file,'utf8'),previous);}
  const xml=renderSitemap([...PUBLIC_PATHS,'/product/'+id]);await refreshSitemap(file,{collect:async()=>({xml})});assert.equal(await readFile(file,'utf8'),xml);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('checked-in snapshot is bounded, unique and contains verified products without invented dates',async()=>{
 const result=validateSitemap(await readFile(new URL('../sitemap.xml',import.meta.url),'utf8'));assert(result.products>0 && result.products<=MAX_PRODUCTS);assert.equal(result.urls.length,7+result.products);
});
