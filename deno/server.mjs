import { readFile } from 'node:fs/promises';
import { createSiteHandler } from '../netlify/functions/site.mjs';
import { publicFiles, siteOrigin } from '../scripts/build-netlify.mjs';

const publicAssets = new Set(publicFiles.map(name => '/' + name));
const types = { js:'application/javascript; charset=utf-8', css:'text/css; charset=utf-8',
  html:'text/html; charset=utf-8', txt:'text/plain; charset=utf-8', xml:'application/xml; charset=utf-8',
  jpg:'image/jpeg', png:'image/png' };
const privatePath = /^\/(analysis|dashboard|post-form|click-analysis)(?:[/.]|$)/;
const publicPath = /^(?:\/$|\/(sale|new|vr)\/?$|\/product\/[a-zA-Z0-9_]{3,80}$|\/api\/(search|rankings|favorite-rankings|actress-rankings|maker-rankings|genre-rankings)\/?$)/;

export function createServerHandler({ clock = Date.now, maxEntries = 128, maxBytes = 4 * 1024 * 1024 } = {}) {
  const site = createSiteHandler();
  const cache = new Map(), assets = new Map();
  let bytes = 0;
  const remove = key => { const old = cache.get(key); if (old) {bytes -= old.body.byteLength;cache.delete(key);} };
  function send(entry, status, method) {
    const headers = new Headers(entry.headers);
    headers.delete('Netlify-CDN-Cache-Control');
    // A local hit must not restart freshness at the shared CDN.
    headers.set('Deno-CDN-Cache-Control', `public, s-maxage=${Math.max(0, Math.floor((entry.until-clock())/1000))}`);
    headers.set('X-Site-Cache', status);
    return new Response(method === 'HEAD' ? null : entry.body.slice(), {status:entry.status,headers});
  }
  return async function handle(request) {
    const url = new URL(request.url), path = url.pathname;
    // Only these public assets are readable. No filesystem path is built from
    // untrusted input outside this exact allowlist, including percent escapes.
    if (publicAssets.has(path)) {
      if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
      try {
        let body = assets.get(path);
        if (!body) {
          const raw = await readFile(new URL('..' + path, import.meta.url));
          const ext = path.split('.').at(-1);
          body = /^(js|css|html|txt|xml)$/.test(ext)
            ? new TextEncoder().encode(new TextDecoder().decode(raw).replaceAll('https://fanza-dashboard-omega.vercel.app', siteOrigin(process.env.SITE_URL || '')))
            : raw;
          assets.set(path,body);
        }
        return new Response(request.method === 'HEAD' ? null : body.slice(),{headers:{
          'Content-Type':types[path.split('.').at(-1)] || 'application/octet-stream',
          'Cache-Control':'public, max-age=0, must-revalidate',
          'Deno-CDN-Cache-Control':'public, s-maxage=3600',
          'X-Content-Type-Options':'nosniff',
        }});
      } catch {return new Response('一時的に利用できません。',{status:503,headers:{'Cache-Control':'no-store'}});}
    }
    const canCache = request.method === 'GET' && publicPath.test(path) && !privatePath.test(path) &&
      !request.headers.has('authorization') && !/\bTwitterbot(?:\/[\d.]+)?\b/i.test(request.headers.get('user-agent') || '');
    // Preserve the entire query and user-agent variant; don't mix user search
    // conditions, pagination, period or social-preview variants.
    const key = request.url + '\n' + (request.headers.get('user-agent') || '');
    if (canCache) {
      const hit = cache.get(key);
      if (hit && hit.until > clock()) return send(hit,'HIT',request.method);
      remove(key);
    }
    const response = await site(request);
    const policy = response.headers.get('Netlify-CDN-Cache-Control') || '';
    const ttl = Number(/\b(?:s-maxage|max-age)=(\d+)/.exec(policy)?.[1] || 0);
    if (canCache && response.status === 200 && /\bpublic\b/.test(policy) && ttl &&
        !response.headers.has('set-cookie') && !/\bprivate\b/.test(response.headers.get('Cache-Control') || '')) {
      const body = new Uint8Array(await response.arrayBuffer());
      const entry = {body,status:200,headers:[...response.headers],until:clock()+ttl*1000};
      if (body.byteLength <= Math.min(maxBytes,512*1024) && maxEntries > 0) {
        // Drop expired entries, then evict the oldest. Random query strings
        // cannot grow the cache beyond either configured bound.
        for (const [oldKey,value] of cache) if (value.until <= clock()) remove(oldKey);
        remove(key);
        while (cache.size >= maxEntries || bytes+body.byteLength > maxBytes) remove(cache.keys().next().value);
        cache.set(key,entry);bytes += body.byteLength;
      }
      return send(entry,'MISS',request.method);
    }
    const headers = new Headers(response.headers);
    headers.delete('Netlify-CDN-Cache-Control');headers.set('X-Site-Cache',canCache?'MISS':'BYPASS');
    headers.set('Deno-CDN-Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers});
  };
}

if (import.meta.main) {
  siteOrigin(process.env.SITE_URL || '');
  Deno.serve({port:Number(process.env.PORT || 8000)},createServerHandler());
}
