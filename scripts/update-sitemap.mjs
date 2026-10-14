import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {SITE_URL} from '../lib/seo.js';
import {PRODUCT_ID} from '../lib/product-page.js';

export const PUBLIC_PATHS=Object.freeze(['/','/privacy.html','/disclaimer.html','/contact.html','/sale','/vr','/new']);
export const MAX_PRODUCTS=20;
export const MAX_DETAIL_CHECKS=30;
const ORIGIN=new URL(SITE_URL).origin;
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1].toLowerCase(),m[3]]));
export function productPath(value) {
  if(typeof value!=='string')return null;
  try {
    const url=new URL(value,SITE_URL);
    const id=url.pathname.match(/^\/product\/([^/]+)$/)?.[1];
    return url.origin===ORIGIN && !url.username && !url.password && !url.search && !url.hash && id && PRODUCT_ID.test(id) ? url.pathname : null;
  }catch{return null;}
}
export function detailLinks(html) {
  return [...new Set([...html.matchAll(/<a\b[^>]*>/gi)].map(m=>productPath(attrs(m[0]).href)).filter(Boolean))];
}
export function pageIsIndexable(response,html,path) {
  const expected=new URL(path,SITE_URL).href;
  if(response.status!==200 || (response.url && response.url!==expected) || !/text\/html/i.test(response.headers.get('content-type')||'') || /noindex/i.test(response.headers.get('x-robots-tag')||''))return false;
  const canonical=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>(a.rel||'').split(/\s+/).includes('canonical'));
  if(canonical.length!==1 || canonical[0].href!==expected)return false;
  if([...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>attrs(m[0])).some(a=>/^(robots|googlebot)$/i.test(a.name||'') && /noindex/i.test(a.content||'')))return false;
  return true;
}
export function validDetail(response,html,path) {
  if(!productPath(path) || !pageIsIndexable(response,html,path))return false;
  const id=path.slice('/product/'.length);
  const article=[...html.matchAll(/<article\b[^>]*>/gi)].map(m=>attrs(m[0])).some(a=>a['data-content-id']===id);
  const headings=[...html.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gis)];
  const catalog=[...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].find(m=>attrs(m[0].slice(0,m[0].indexOf('>')+1)).id==='catalogProducts');
  try {
    const products=JSON.parse(catalog?.[0].replace(/^<script\b[^>]*>|<\/script>$/gi,'')||'null');
    if(!Array.isArray(products) || products.length!==1 || products[0]?.id!==id || typeof products[0]?.title!=='string' || !products[0].title.trim())return false;
  }catch{return false;}
  const backLink=[...html.matchAll(/<a\b[^>]*>/gi)].some(m=>['/','/sale','/vr','/new'].includes(attrs(m[0]).href));
  return article && headings.length===1 && Boolean(headings[0][1].replace(/<[^>]*>/g,'').trim()) && backLink;
}
export function renderSitemap(paths) {
  const unique=[...new Set(paths)];
  if(unique.length!==paths.length || !PUBLIC_PATHS.every(p=>unique.includes(p)) || unique.some(p=>!PUBLIC_PATHS.includes(p)&&!productPath(p)))throw Error('Invalid sitemap URLs');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map(p=>`  <url><loc>${new URL(p,SITE_URL).href}</loc></url>`).join('\n')}\n</urlset>\n`;
  validateSitemap(xml);return xml;
}
export function validateSitemap(xml) {
  if(!/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(xml))throw Error('Invalid XML envelope');
  const urls=[...xml.matchAll(/<url><loc>([^<]+)<\/loc><\/url>/g)].map(m=>m[1]);
  if(urls.length<7 || urls.length>7+MAX_PRODUCTS || new Set(urls).size!==urls.length || /<lastmod\b|<changefreq\b|<priority\b/i.test(xml))throw Error('Invalid sitemap metadata or count');
  const body=xml.replace(/^<\?xml[^>]*>\s*<urlset[^>]*>|<\/urlset>\s*$/g,'').replace(/\s*<url><loc>[^<]+<\/loc><\/url>\s*/g,'');
  if(body.trim())throw Error('Unexpected sitemap XML');
  const paths=urls.map(value=>{const u=new URL(value);if(value!==new URL(u.pathname,SITE_URL).href || u.origin!==ORIGIN || u.search || u.hash || (!PUBLIC_PATHS.includes(u.pathname)&&!productPath(value)))throw Error('Invalid sitemap URL');return u.pathname;});
  if(!PUBLIC_PATHS.every(p=>paths.includes(p)))throw Error('Existing public pages must remain');
  return {urls,products:paths.filter(p=>productPath(p)).length};
}
// Round-robin discovery gives sale, VR and new releases a place without duplicate checks.
function candidates(groups) {
  const result=[],seen=new Set();
  for(let i=0;i<Math.max(...groups.map(g=>g.length),0);i++)for(const group of groups){const path=group[i];if(path&&!seen.has(path)){seen.add(path);result.push(path);}}
  return result;
}
export async function collectSitemap({fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),interval=1200,onProgress=()=>{}}={}) {
  let requests=0;
  const get=async path=>{
    if(requests++)await wait(interval);
    const response=await fetcher(new URL(path,SITE_URL).href,{redirect:'manual',signal:AbortSignal.timeout(8000)});
    const html=await response.text();return {response,html};
  };
  const groups=[];
  // Check all seven existing pages. Category HTML is reused for discovery (no extra list API calls).
  for(const path of PUBLIC_PATHS){const {response,html}=await get(path);if(!pageIsIndexable(response,html,path))throw Error(`Public page unavailable: ${path}`);if(['/sale','/vr','/new'].includes(path)){const links=detailLinks(html);if(!links.length)throw Error(`Catalog has no valid detail links: ${path}`);groups.push(links);}}
  const products=[],skipped=[];
  let checked=0;
  for(const path of candidates(groups).slice(0,MAX_DETAIL_CHECKS)){
    if(products.length===MAX_PRODUCTS)break;
    checked++;
    try{const {response,html}=await get(path);if(validDetail(response,html,path)){products.push(path);onProgress({path,status:'verified'});}else{skipped.push(path);onProgress({path,status:'excluded'});}}catch{skipped.push(path);onProgress({path,status:'excluded'});}
  }
  if(!products.length)throw Error('No verified products; keep the previous sitemap');
  const paths=[...PUBLIC_PATHS,...products];
  return {xml:renderSitemap(paths),products:products.length,checked,requests,skipped};
}
export async function refreshSitemap(file,{collect=collectSitemap,...options}={}) {
  // Write only a complete validated document, then rename atomically on the same filesystem.
  const result=await collect(options);validateSitemap(result.xml);
  const temporary=new URL('.sitemap-'+process.pid+'.tmp',pathToFileURL(file));
  try{await writeFile(temporary,result.xml,{flag:'wx'});await rename(temporary,file);}catch(error){await unlink(temporary).catch(()=>{});throw error;}
  return result;
}
async function main() {
  const file=new URL('../sitemap.xml',import.meta.url).pathname;
  if(process.argv.includes('--check')){const result=validateSitemap(await readFile(file,'utf8'));console.log(`Valid sitemap: ${result.urls.length} URLs / ${result.products} products. No API calls.`);return;}
  const options={onProgress:({path,status})=>console.log(`${status}: ${path}`)};
  const result=process.argv.includes('--write')?await refreshSitemap(file,options):await collectSitemap(options);
  console.log(`${process.argv.includes('--write')?'Saved':'Dry run'}: 7 public pages + ${result.products} products; ${result.requests} requests / ${result.checked} detail checks.`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(`Sitemap refresh failed; existing file unchanged: ${error.message}`);process.exitCode=1;});
