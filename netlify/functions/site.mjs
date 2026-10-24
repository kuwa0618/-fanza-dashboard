import { readFile } from 'node:fs/promises';
import search from '../../api/search.js';
import click from '../../api/click.js';
import favorite from '../../api/favorite.js';
import rankings from '../../api/rankings.js';
import favoriteRankings from '../../api/favorite-rankings.js';
import actressRankings from '../../api/actress-rankings.js';
import makerRankings from '../../api/maker-rankings.js';
import genreRankings from '../../api/genre-rankings.js';
import post from '../../api/post.js';
import posts from '../../api/posts.js';
import insights from '../../api/insights.js';
import stats from '../../api/stats.js';
import { adminHeaders, isAdminAuthorized } from '../../lib/admin-auth.js';

const handlers = {
  search, click, favorite, rankings, 'favorite-rankings': favoriteRankings,
  'actress-rankings': actressRankings, 'maker-rankings': makerRankings,
  'genre-rankings': genreRankings, post, posts, insights, stats,
};
const privateApis = new Set(['post', 'posts', 'insights', 'stats']);
const cachedPublicApis = new Set([
  'search', 'rankings', 'favorite-rankings', 'actress-rankings', 'maker-rankings', 'genre-rankings',
]);

function setCdnCache(request, headers, status) {
  // Keep browser caching and public CDN caching separate. Never cache writes,
  // errors, authenticated responses, or a response that creates a cookie.
  headers.set('Netlify-CDN-Cache-Control', 'no-store');
  if (request.method !== 'GET' || status !== 200 || request.headers.has('authorization') ||
      headers.has('set-cookie') || /(?:^|,)\s*private\b/i.test(headers.get('Cache-Control') || '')) return;
  const path = new URL(request.url).pathname;
  const api = path.match(/^\/api\/([a-z-]+)\/?$/)?.[1];
  if (cachedPublicApis.has(api) && /^application\/json\b/i.test(headers.get('Content-Type') || '')) {
    // Full URL queries remain in the cache key, including keyword, offset,
    // sort and period. Public data can be up to 60 seconds old.
    headers.set('Netlify-CDN-Cache-Control', 'public, durable, max-age=60');
    return;
  }
  const cache = headers.get('Cache-Control') || '';
  if (!api && /(?:^|,)\s*public\b/i.test(cache) && !/\bno-store\b/i.test(cache) && /\bs-maxage=\d+\b/.test(cache)) {
    headers.set('Netlify-CDN-Cache-Control', cache + ', durable');
  }
}
const privatePages = {
  analysis: 'analysis.html', dashboard: 'dashboard.html',
  'post-form': 'post-form.html', 'click-analysis': 'click-analysis.html',
};
const oldOrigin = 'https://fanza-dashboard-omega.vercel.app';

function queryObject(entries) {
  const query = Object.create(null);
  for (const [key, value] of entries) {
    if (Object.hasOwn(query, key)) query[key] = [...(Array.isArray(query[key]) ? query[key] : [query[key]]), value];
    else query[key] = value;
  }
  return query;
}

function origin() {
  const value = process.env.SITE_URL;
  const url = new URL(value || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL must be an HTTPS origin');
  }
  return url.origin;
}

function authorize(request) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return new Response('管理用の認証設定がありません。', { status: 503, headers: adminHeaders });
  }
  if (!isAdminAuthorized(request.headers.get('authorization'))) {
    return new Response('管理者としてログインしてください。', {
      status: 401, headers: { ...adminHeaders, 'WWW-Authenticate': 'Basic realm="FANZA Admin", charset="UTF-8"' },
    });
  }
}

async function invoke(handler, request, query, extraHeaders, site) {
  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1024 * 1024) return new Response('Payload too large', { status: 413 });
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { return new Response('Invalid JSON', { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
    }
  }
  let status = 200, output = '', sent = false;
  const headers = new Headers(extraHeaders);
  const res = {
    setHeader(key, value) { headers.set(key, String(value)); return this; },
    status(value) { status = value; return this; },
    json(value) { headers.set('Content-Type', 'application/json; charset=utf-8'); return this.send(JSON.stringify(value)); },
    send(value) { output = String(value ?? ''); sent = true; return this; },
    end(value) { return this.send(value); },
  };
  await handler({ method: request.method, query, body, headers: Object.fromEntries(request.headers), url: request.url }, res);
  if (!sent) throw new Error('Handler did not send a response');
  // Existing renderers retain their Vercel defaults; only the new host adapter changes metadata.
  output = output.replaceAll(oldOrigin, site);
  for (const [key, value] of headers) if (value.includes(oldOrigin)) headers.set(key, value.replaceAll(oldOrigin, site));
  setCdnCache(request, headers, status);
  return new Response(request.method === 'HEAD' || status === 204 ? null : output, { status, headers });
}

export default async function handler(request) {
  try {
    const site = origin();
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/index' || path === '/index.html') {
      return new Response(null, { status: 308, headers: { Location: '/' + url.search } });
    }
    const pageMatch = path.match(/^\/(analysis|dashboard|post-form|click-analysis)(?:\.html)?(?:\/.*)?$/);
    const apiMatch = path.match(/^\/api\/([a-z-]+)\/?$/);
    if (pageMatch || privateApis.has(apiMatch?.[1])) {
      const denied = authorize(request);
      if (denied) return denied;
    }
    if (pageMatch) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...adminHeaders, Allow: 'GET, HEAD' } });
      const html = await readFile(`${process.cwd()}/${privatePages[pageMatch[1]]}`, 'utf8');
      return new Response(request.method === 'HEAD' ? null : html.replaceAll(oldOrigin, site), {
        headers: { ...adminHeaders, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    let selected, query = queryObject(url.searchParams);
    if (path === '/') {
      selected = search; query.view = 'page';
    } else if (/^\/(sale|new|vr)\/?$/.test(path)) {
      selected = search;
      query = queryObject([...url.searchParams].filter(([key]) => ['actress', 'genre', 'maker'].includes(key)));
      query.view = 'catalog'; query.category = path.split('/')[1];
    } else if (path === '/product' || path.startsWith('/product/')) {
      const match = path.match(/^\/product\/([a-zA-Z0-9_]{3,80})(\/?)$/);
      if (!match) return new Response('作品が見つかりません。', { status: 404 });
      if (match[2]) return new Response(null, { status: 308, headers: { Location: '/product/' + match[1] } });
      selected = search; query = { view: 'product', id: match[1] };
    } else if (apiMatch && Object.hasOwn(handlers, apiMatch[1])) selected = handlers[apiMatch[1]];
    else return new Response('Not found', { status: 404 });
    if (!apiMatch && !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    return await invoke(selected, request, query, privateApis.has(apiMatch?.[1]) ? adminHeaders : {}, site);
  } catch {
    // Never return environment values or upstream error details.
    console.error('Hosting adapter request failed');
    return new Response('一時的に利用できません。', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const config = {
  path: [
    '/', '/index', '/index.html', '/sale', '/sale/', '/new', '/new/', '/vr', '/vr/',
    '/product', '/product/*', '/api/*',
    '/analysis', '/analysis/*', '/analysis.html', '/analysis.html/*',
    '/dashboard', '/dashboard/*', '/dashboard.html', '/dashboard.html/*',
    '/post-form', '/post-form/*', '/post-form.html', '/post-form.html/*',
    '/click-analysis', '/click-analysis/*', '/click-analysis.html', '/click-analysis.html/*',
  ],
};

