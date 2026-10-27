import { createSiteHandler } from '../netlify/functions/site.mjs';
import index from '../index.html';
import analysis from '../analysis.html';
import dashboard from '../dashboard.html';
import postForm from '../post-form.html';
import clickAnalysis from '../click-analysis.html';

// Admin templates are Worker modules, never public static assets.
const templates = {
  'index.html': index, 'analysis.html': analysis, 'dashboard.html': dashboard,
  'post-form.html': postForm, 'click-analysis.html': clickAnalysis,
};
const site = createSiteHandler({ readTemplate: async name => {
  if (!Object.hasOwn(templates, name)) throw new Error('Unknown template');
  return templates[name];
} });

function cacheableRequest(request) {
  const path = new URL(request.url).pathname;
  const publicRoute = path === '/' || /^\/(sale|new|vr)\/?$/.test(path) ||
    /^\/product\/[a-zA-Z0-9_]{3,80}$/.test(path) ||
    /^\/api\/(search|rankings|favorite-rankings|actress-rankings|maker-rankings|genre-rankings)\/?$/.test(path);
  return request.method === 'GET' && !request.headers.has('authorization') &&
    !/\bTwitterbot(?:\/[\d.]+)?\b/i.test(request.headers.get('user-agent') || '') &&
    publicRoute;
}

function browserResponse(response, status) {
  const headers = new Headers(response.headers);
  // Preserve the existing browser policy; the Cache API copy uses its own TTL.
  const browserPolicy = headers.get('X-Worker-Browser-Cache');
  if (browserPolicy !== null) {
    headers.set('Cache-Control', browserPolicy);
    headers.delete('X-Worker-Browser-Cache');
  }
  headers.delete('Netlify-CDN-Cache-Control');
  headers.set('X-Site-Cache', status);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env, context) {
    const canRead = cacheableRequest(request);
    // Full query and User-Agent remain in the cache key. Never drop search,
    // pagination or period inputs, or mix Twitterbot's response with visitors.
    const key = new Request(request.url, { headers: request.headers });
    const cache = caches.default;
    if (canRead) {
      try {
        const hit = await cache.match(key);
        if (hit) return browserResponse(hit, 'HIT');
      } catch { /* Cache availability must not prevent normal navigation. */ }
    }
    const response = await site(request);
    const policy = response.headers.get('Netlify-CDN-Cache-Control') || '';
    const maxAge = /\b(?:s-maxage|max-age)=(\d+)/.exec(policy)?.[1];
    if (canRead && response.status === 200 && /\bpublic\b/.test(policy) && maxAge &&
        !response.headers.has('set-cookie') && !/\bprivate\b/.test(response.headers.get('Cache-Control') || '')) {
      const headers = new Headers(response.headers);
      headers.set('X-Worker-Browser-Cache', headers.get('Cache-Control') || 'no-store');
      headers.set('Cache-Control', 'public, max-age=' + maxAge);
      const stored = new Response(response.clone().body, { status: 200, headers });
      context.waitUntil(cache.put(key, stored).catch(() => {}));
    }
    return browserResponse(response, canRead ? 'MISS' : 'BYPASS');
  },
};
