import {readFile,appendFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {validateSitemap} from './update-sitemap.mjs';

export const REPOSITORY='kuwa0618/-fanza-dashboard';
export const UPDATE_BRANCH='automation/verified-sitemap';
const COMMIT='chore: refresh verified product sitemap [automation]';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sameUrls=(a,b)=>a.length===b.length && a.every(u=>b.includes(u));

export async function proposeSitemap({xml,previous,repository,baseSha,token,fetcher=fetch}) {
  const next=validateSitemap(xml),old=validateSitemap(previous);
  if(repository!==REPOSITORY || !/^[a-f0-9]{40}$/.test(baseSha||''))throw Error('Unexpected repository or base commit');
  if(sameUrls(next.urls,old.urls))return {status:'unchanged'};
  if(!token)throw Error('GitHub token is required for a changed sitemap');
  const api=async(path,{method='GET',body,optional=false}={})=>{
    const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
    if(optional && response.status===404)return null;
    // Never include API response bodies, request headers or token values in logs.
    if(!response.ok)throw Error(`GitHub API ${method} ${path.split('?')[0]} failed: HTTP ${response.status}`);
    return response.json();
  };
  const base=await api('/git/ref/heads/main');
  if(base.object?.sha!==baseSha)throw Error('main changed during validation; rerun against the new main');
  const pulls=await api('/pulls?state=open&base=main&head='+encodeURIComponent('kuwa0618:'+UPDATE_BRANCH));
  if(!Array.isArray(pulls) || pulls.length>1)throw Error('Unexpected update pull requests');
  const pull=pulls[0];
  if(pull && (pull.user?.login!=='github-actions[bot]' || pull.head?.ref!==UPDATE_BRANCH || pull.base?.ref!=='main'))throw Error('Update PR is not owned by this automation');
  const branch=await api('/git/ref/heads/'+UPDATE_BRANCH,{optional:true});
  if(branch){
    const commit=await api('/git/commits/'+branch.object.sha);
    if(commit.message?.split('\n')[0]!==COMMIT)throw Error('Update branch contains human changes; do not overwrite');
    const content=await api('/contents/sitemap.xml?ref='+encodeURIComponent(UPDATE_BRANCH));
    if(content.encoding!=='base64')throw Error('Unexpected branch sitemap encoding');
    if(pull && sameUrls(validateSitemap(Buffer.from(content.content,'base64').toString('utf8')).urls,next.urls))return {status:'existing',url:pull.html_url};
  }
  const baseCommit=await api('/git/commits/'+baseSha);
  // The tree is based on main and changes exactly one file. No working-tree files are pushed.
  const tree=await api('/git/trees',{method:'POST',body:{base_tree:baseCommit.tree.sha,tree:[{path:'sitemap.xml',mode:'100644',type:'blob',content:xml}]}});
  const parents=[...new Set([branch?.object.sha,baseSha].filter(Boolean))];
  const commit=await api('/git/commits',{method:'POST',body:{message:COMMIT,tree:tree.sha,parents}});
  if(branch)await api('/git/refs/heads/'+UPDATE_BRANCH,{method:'PATCH',body:{sha:commit.sha,force:false}});
  else await api('/git/refs',{method:'POST',body:{ref:'refs/heads/'+UPDATE_BRANCH,sha:commit.sha}});
  const body='公開ページと作品詳細を再検証したサイトマップ更新案です。\n\n- 既存7ページを維持、作品は最大20件。HTTP 200・作品ID・canonical・内部リンクを検証。\n- 404等の不正な作品は除外。一時的なAPI/通信障害があれば更新処理を中止。\n- sitemap.xml以外は変更しません。架空の更新日時は追加しません。\n- 自動マージ・自動承認は実装していません。差分と実行ログを確認し、管理者が手動で判断してください。\n\n現在の掲載URL数: '+next.urls.length+'件。';
  if(pull){await api('/pulls/'+pull.number,{method:'PATCH',body:{body}});return {status:'updated',url:pull.html_url};}
  const created=await api('/pulls',{method:'POST',body:{title:'作品別サイトマップの週次更新案',head:UPDATE_BRANCH,base:'main',body,maintainer_can_modify:true}});
  return {status:'created',url:created.html_url};
}

async function main(){
  if(process.env.GITHUB_REF!=='refs/heads/main')throw Error('Only reviewed main may publish proposals');
  const {stdout:previous}=await promisify(execFile)('git',['show','HEAD:sitemap.xml'],{cwd:ROOT,maxBuffer:1024*1024});
  const result=await proposeSitemap({xml:await readFile(new URL('../sitemap.xml',import.meta.url),'utf8'),previous,repository:process.env.GH_REPOSITORY,baseSha:process.env.GH_BASE_SHA,token:process.env.GH_TOKEN});
  console.log('Sitemap proposal: '+result.status+(result.url?' '+result.url:''));
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Verified sitemap\n\nResult: ${result.status}${result.url?'\n\n'+result.url:''}\n\nNo automatic merge or approval.\n`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
