// Public metadata only. No environment variables or management data in HTML.
export const SITE_URL = 'https://fanza-dashboard-omega.vercel.app/';
export const SITE_TITLE = 'FANZA作品ナビ｜セール・人気作品を出演者やジャンルから検索';
export const SITE_DESCRIPTION = 'FANZAの作品を出演者・メーカー・ジャンルで検索。セール作品、人気ランキング、実レビューによる高評価作品を探せます。お気に入りと閲覧履歴で気になる作品を保存。18歳以上向け。';
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function publicProducts(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 20).filter(p => p && typeof p.title === 'string' && p.title.trim()).map(p => ({
    title: p.title,
    date: typeof p.date === 'string' ? p.date.slice(0,10) : '',
    maker: (Array.isArray(p.iteminfo?.maker) ? p.iteminfo.maker : [p.iteminfo?.maker]).filter(Boolean).map(m => String(m.name || '')).filter(Boolean).join('、'),
    actresses: (Array.isArray(p.iteminfo?.actress) ? p.iteminfo.actress : [p.iteminfo?.actress]).filter(Boolean).map(a => String(a.name || '')).filter(Boolean),
  }));
}
export function siteGraph(products = []) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': SITE_URL+'#website', url: SITE_URL, name: 'FANZA作品ナビ', inLanguage: 'ja', isFamilyFriendly: false },
      { '@type': 'CollectionPage', '@id': SITE_URL+'#webpage', url: SITE_URL, name: SITE_TITLE, description: SITE_DESCRIPTION, inLanguage: 'ja', isFamilyFriendly: false, isPartOf: {'@id': SITE_URL+'#website'}, ...(products.length ? { mainEntity: {'@id':SITE_URL+'#catalog'} } : {}) },
      ...(products.length ? [{ '@type': 'ItemList', '@id': SITE_URL+'#catalog', name: '掲載作品の一部', numberOfItems: products.length, itemListOrder: 'https://schema.org/ItemListOrderDescending', itemListElement: products.map((p,i) => ({ '@type': 'ListItem', position: i+1, item: {'@type':'CreativeWork', name:p.title, isFamilyFriendly:false} })) }] : []),
    ],
  };
}
export function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
export function renderSeoPage(template, items) {
  const products = publicProducts(items);
  // This visible, progressively enhanced list is identical for visitors and crawlers.
  // Links go to this site's search, so all outbound FANZA clicks still use the existing bindings.
  const list = products.length ? `<section id="initialCatalog" class="initial-catalog" aria-labelledby="initialCatalogHeading"><h2 id="initialCatalogHeading">掲載作品の一部</h2><p>FANZA APIから取得した新着作品です。最新の価格・販売状況は作品のリンク先で確認してください。</p><ul>${products.map(p=>`<li><h3>${escapeHtml(p.title)}</h3><p>${p.maker ? 'メーカー：'+escapeHtml(p.maker)+' ' : ''}${p.date ? '配信日：'+escapeHtml(p.date) : ''}</p>${p.actresses.length ? `<a href="/?actress=${encodeURIComponent(p.actresses[0])}#searchPanel">${escapeHtml(p.actresses[0])}の作品を探す</a>` : '<a href="#searchPanel">このページの作品検索を使う</a>'}</li>`).join('')}</ul></section>` : '';
  return template.replace('<!-- SERVER_CATALOG -->', list).replace(/<script id="siteStructuredData" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="siteStructuredData" type="application/ld+json">${jsonLd(siteGraph(products))}</script>`);
}
