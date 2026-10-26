import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PUBLIC_PATHS,renderSitemap} from '../scripts/update-sitemap.mjs';
import {proposeSitemap,REPOSITORY,UPDATE_BRANCH} from '../scripts/propose-sitemap.mjs';
const previous=renderSitemap([...PUBLIC_PATHS,'/product/old001']);
const xml=renderSitemap([...PUBLIC_PATHS,'/product/new001']);
const baseSha='a'.repeat(40),branchSha='b'.repeat(40);
const title='chore: refresh verified product sitemap [automation]';
const options={xml,previous,repository:REPOSITORY,baseSha,token:'test-only-token'};
const pull={number:11,html_url:'https://github.com/'+REPOSITORY+'/pull/11',user:{login:'github-actions[bot]'},head:{ref:UPDATE_BRANCH},base:{ref:'main'}};
function fixture({branch=false,open=false,content=previous,moved=false,human=false,denied=false}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url);assert.equal(u.origin,'https://api.github.com');assert(opts.signal);assert.equal(opts.headers.authorization,'Bearer test-only-token');const path=u.pathname.slice(('/repos/'+REPOSITORY).length),body=opts.body?JSON.parse(opts.body):null;calls.push({path,method:opts.method,body});
  if(denied)return Response.json({message:'secret response must not be logged'},{status:403});
  if(path==='/git/ref/heads/main')return Response.json({object:{sha:moved?'c'.repeat(40):baseSha}});
  if(path==='/pulls' && opts.method==='GET')return Response.json(open?[pull]:[]);
  if(path==='/git/ref/heads/'+UPDATE_BRANCH)return branch?Response.json({object:{sha:branchSha}}):Response.json({}, {status:404});
  if(path==='/git/commits/'+branchSha)return Response.json({message:human?'Human edit':title});
  if(path==='/contents/sitemap.xml')return Response.json({encoding:'base64',content:Buffer.from(content).toString('base64')});
  if(path==='/git/commits/'+baseSha)return Response.json({tree:{sha:'tree-main'}});
  if(path==='/git/trees')return Response.json({sha:'tree-proposed'});
  if(path==='/git/commits')return Response.json({sha:'d'.repeat(40)});
  if(path==='/pulls' && opts.method==='POST')return Response.json(pull,{status:201});
  return Response.json({});
 };return {fetcher,calls};
}
test('unchanged URLs, including order-only differences, cause zero GitHub requests',async()=>{
 let calls=0;const result=await proposeSitemap({...options,xml:previous,fetcher:async()=>calls++});assert.equal(result.status,'unchanged');assert.equal(calls,0);
});
test('a changed snapshot creates one PR on a dedicated branch and writes only sitemap.xml, never main',async()=>{
 const f=fixture();const result=await proposeSitemap({...options,...f});assert.equal(result.status,'created');const writes=f.calls.filter(c=>c.method!=='GET');assert.equal(writes.length,4);
 assert.deepEqual(writes[0].body,{base_tree:'tree-main',tree:[{path:'sitemap.xml',mode:'100644',type:'blob',content:xml}]});assert.deepEqual(writes[1].body.parents,[baseSha]);assert.equal(writes[2].body.ref,'refs/heads/'+UPDATE_BRANCH);assert.equal(writes[3].body.base,'main');assert.equal(writes[3].body.head,UPDATE_BRANCH);assert(!f.calls.some(c=>/merge|review|auto_merge/.test(c.path)));
});
test('existing bot PR is reused without force push, and identical pending proposals create no writes',async()=>{
 const f=fixture({branch:true,open:true});const result=await proposeSitemap({...options,...f});assert.equal(result.status,'updated');assert.deepEqual(f.calls.find(c=>c.path==='/git/commits').body.parents,[branchSha,baseSha]);const update=f.calls.find(c=>c.path==='/git/refs/heads/'+UPDATE_BRANCH);assert.equal(update.method,'PATCH');assert.equal(update.body.force,false);assert(!f.calls.some(c=>c.path==='/pulls'&&c.method==='POST'));
 const same=fixture({branch:true,open:true,content:xml});assert.equal((await proposeSitemap({...options,...same})).status,'existing');assert(same.calls.every(c=>c.method==='GET'));
});
test('moved main, human branch edits, wrong repositories, malformed XML and permission failures fail safely',async()=>{
 for(const mode of [{moved:true},{branch:true,human:true},{denied:true}]){const f=fixture(mode);await assert.rejects(proposeSitemap({...options,...f}),error=>!error.message.includes('test-only-token')&&!error.message.includes('secret response'));assert(f.calls.every(c=>c.method==='GET'));}
 for(const extra of [{repository:'someone/fork'},{baseSha:'bad'},{xml:'broken'},{token:''}]){let calls=0;await assert.rejects(proposeSitemap({...options,...extra,fetcher:async()=>calls++}));assert.equal(calls,0);}
});
test('workflow is weekly and main-only, bounded, pinned, least-scoped and contains no automatic merge or deployment',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/weekly-sitemap.yml',import.meta.url),'utf8');assert(workflow.includes("cron: '17 21 * * 0'"));assert(workflow.includes('workflow_dispatch:'));assert(workflow.includes("github.ref == 'refs/heads/main'"));assert(workflow.includes("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'"));assert(workflow.includes('timeout-minutes: 10'));assert(workflow.includes('cancel-in-progress: false'));assert(workflow.includes('persist-credentials: false'));assert(workflow.includes('--ignore-scripts'));assert.equal((workflow.match(/uses: [^\n]+@[a-f0-9]{40}/g)||[]).length,4);assert.equal((workflow.match(/GH_TOKEN:/g)||[]).length,1);assert(!/pull_request_target:|auto-merge|gh pr merge|vercel deploy|secrets\./.test(workflow));
 const validation=workflow.split('  validate:')[1].split('  propose:')[0];assert(!/contents: write|pull-requests: write|GH_TOKEN/.test(validation));assert(!validation.includes('node scripts/propose-sitemap.mjs'));
});

test('a verified migrated snapshot can be proposed against an old-host base and pending bot branch',async()=>{
 const old=previous.replaceAll(new URL((await import('../lib/seo.js')).SITE_URL).origin,'https://fanza-works-navi.netlify.app');
 const f=fixture({branch:true,open:true,content:old});
 assert.equal((await proposeSitemap({...options,previous:old,...f})).status,'updated');
 assert(!f.calls.some(c=>/merge|review|auto_merge/.test(c.path)));
 const bad=fixture();await assert.rejects(proposeSitemap({...options,xml:old,...bad}),/Invalid sitemap URL/);
 assert.equal(bad.calls.length,0);
});
