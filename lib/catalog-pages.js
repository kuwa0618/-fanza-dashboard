import { SITE_URL, escapeHtml as h, jsonLd, publicProducts } from './seo.js';

export const catalogPages = Object.freeze({
  sale: { path: '/sale', name: 'セール作品', title: 'FANZAセール作品一覧｜割引中の作品を探す｜FANZA作品ナビ', description: 'FANZA APIの販売価格と通常価格を同じ配信形式で比較し、割引を確認できたセール作品を掲載。出演者・メーカー・配信日から気になる作品を探せます。18歳以上向け。', intro: '同じ配信形式の販売価格が通常価格を下回る作品を掲載しています。APIの人気順上位100件から、割引を確認できた作品を最大20件表示します。', note: '価格は取得時点の情報です。配信形式によって価格・割引の有無が異なります。セールの終了日時は推測せず、FANZAの販売ページで確認してください。' },
  vr: { path: '/vr', name: 'VR作品', title: 'FANZA VR作品一覧｜VR専用作品を新着順で探す｜FANZA作品ナビ', description: 'FANZA APIのジャンル情報でVR作品と確認できた作品を新着順に掲載。出演者・メーカー・配信日を確認し、対応機器や視聴条件はFANZAで確認できます。18歳以上向け。', intro: 'APIの「VR」検索結果の新着上位100件から、ジャンル情報にVRを含む作品を最大20件表示します。作品名にVRという文字があるだけの作品は対象にしません。', note: 'VR作品は対応する視聴機器や再生環境が必要です。解像度・対応機器・配信形式をFANZAの販売ページで確認してください。' },
  new: { path: '/new', name: '新作', title: 'FANZA新作一覧｜直近30日間の配信作品を探す｜FANZA作品ナビ', description: 'FANZA APIの配信日に基づき、直近30日間に配信された新作を新しい順に掲載。出演者・メーカー・配信日を確認して作品を探せます。18歳以上向け。', intro: '日本時間の今日を含む直近30日間に配信された作品を、新しい順に最大20件掲載します。配信日が不明な作品や配信前の予約作品は含めません。', note: '「新作」はAPIの配信日を基準にしています。メーカーの発売日や他サービスの公開日とは異なる場合があります。販売・配信状況はFANZAで確認してください。' },
});
const array = value => Array.isArray(value) ? value : value ? [value] : [];
const amount = value => /^\d+$/.test(String(value ?? '').replace(/,/g, '')) ? Number(String(value).replace(/,/g, '')) : 0;
export function discountedPrice(product) {
  const deliveries = array(product?.prices?.deliveries?.delivery);
  // Never compare different delivery formats. Only exact monetary values are printed.
  return (deliveries.length ? deliveries : [product?.prices]).map(p => ({price:amount(p?.price), listPrice:amount(p?.list_price), format:typeof p?.type==='string'?p.type:''})).find(p => p.price > 0 && p.listPrice > p.price) || null;
}
export function jstWindow(now = new Date()) {
  const today = now.toLocaleDateString('sv-SE', {timeZone:'Asia/Tokyo'});
  return {today, from:new Date(Date.parse(today+'T00:00:00Z')-29*86400000).toISOString().slice(0,10)};
}
export function catalogParams(key, now = new Date()) {
  const q = new URLSearchParams({site:'FANZA',service:'digital',floor:'videoa',hits:key==='new'?'20':'100',offset:'1',sort:key==='sale'?'rank':'date',output:'json',lte_date:now.toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}).replace(' ','T')});
  if(key==='vr') q.set('keyword','VR');
  if(key==='new') q.set('gte_date',jstWindow(now).from+'T00:00:00');
  return q;
}
export function selectCatalog(key, items, now = new Date()) {
  const {today,from}=jstWindow(now);
  const seen=new Set();
  return array(items).filter(p=>{
    if(!p || typeof p.title!=='string' || !p.title.trim() || typeof p.content_id!=='string' || seen.has(p.content_id)) return false;
    const date=String(p.date||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date>today) return false;
    if(key==='sale' && !discountedPrice(p)) return false;
    if(key==='vr' && !array(p.iteminfo?.genre).some(g=>/VR/i.test(String(g?.name||'')))) return false;
    if(key==='new' && date<from) return false;
    seen.add(p.content_id);return true;
  }).sort((a,b)=>key==='sale'?0:String(b.date).localeCompare(String(a.date))).slice(0,20);
}
export function affiliateUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && ['dmm.co.jp','dmm.com','fanza.co.jp'].some(host=>u.hostname===host || u.hostname.endsWith('.'+host)) ? u.href : ''; } catch { return ''; }
}
// Only API-provided cover URLs; never synthesize image paths from product IDs.
export function productImages(product) {
  return [...new Set(['large', 'list', 'small'].map(size => product?.imageURL?.[size]).filter(value => typeof value === 'string' && affiliateUrl(value)))];
}
function renderProductImage(product, index) {
  if (!product.images.length) return '';
  const image = `<img class="catalog-image" src="${h(product.images[0])}" alt="${h(product.title)}" loading="lazy" decoding="async">`;
  return product.url
    ? `<a class="catalog-image-link" data-product="${index}" data-link-type="image" href="${h(product.url)}" aria-label="${h(product.title)}をFANZAで見る" target="_blank" rel="sponsored nofollow noopener noreferrer">${image}</a>`
    : `<div class="catalog-image-link">${image}</div>`;
}
export function renderCatalogPage(key, items, {unavailable=false}={}) {
  const page=catalogPages[key], url=new URL(page.path,SITE_URL).href;
  const products=publicProducts(items);
  const tracking=items.map((p,i)=>({id:p.content_id,title:products[i].title,date:products[i].date,maker:products[i].maker,actresses:products[i].actresses,genres:array(p.iteminfo?.genre).map(g=>String(g?.name||'')).filter(Boolean),url:affiliateUrl(p.affiliateURL || p.URL),images:productImages(p),tags:[],price:0,listPrice:0,review:null,description:'作品情報'}));
  const graph={'@context':'https://schema.org','@graph':[
    {'@type':'CollectionPage','@id':url+'#webpage',url,name:page.title,description:page.description,inLanguage:'ja',isFamilyFriendly:false,isPartOf:{'@id':SITE_URL+'#website'},...(products.length?{mainEntity:{'@id':url+'#catalog'}}:{})},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'FANZA作品ナビ',item:SITE_URL},{'@type':'ListItem',position:2,name:page.name,item:url}]},
    ...(products.length?[{'@type':'ItemList','@id':url+'#catalog',name:page.name,numberOfItems:products.length,itemListElement:products.map((p,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'CreativeWork',name:p.title,isFamilyFriendly:false}}))}]:[])
  ]};
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(page.title)}</title><meta name="description" content="${h(page.description)}"><link rel="canonical" href="${url}"><meta name="robots" content="${unavailable?'noindex, follow':'index, follow, max-image-preview:large'}"><meta name="rating" content="adult"><meta property="og:title" content="${h(page.title)}"><meta property="og:description" content="${h(page.description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:image" content="${SITE_URL}ogp-v2.png"><link rel="stylesheet" href="/styles.css"><style>#mainContent.catalog-main{max-width:1080px;margin:auto;padding:20px;box-sizing:border-box}.catalog-main *{min-width:0;overflow-wrap:anywhere}.catalog-nav{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.catalog-nav a,.catalog-link{display:inline-block;padding:12px 16px;border-radius:10px;background:#2c1740;color:#fff}.catalog-nav [aria-current]{outline:2px solid #ed72a9}.catalog-list{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}.catalog-list li{border:1px solid #5c3b58;border-radius:14px;padding:18px;background:#fff}.catalog-image-link{display:block;margin-bottom:14px}.catalog-image-link[hidden]{display:none}.catalog-image{display:block;width:100%;max-width:100%;height:auto;object-fit:contain;border-radius:8px}.catalog-list h3{font-size:1.05rem;line-height:1.6;margin-top:0}.catalog-list p{line-height:1.8}.catalog-price{font-weight:bold;color:#a31332}.catalog-main h1{font-size:clamp(1.5rem,5vw,2.1rem)}.catalog-main a:focus-visible{outline:3px solid #ffb9d8;outline-offset:3px}</style><script id="siteStructuredData" type="application/ld+json">${jsonLd(graph)}</script><script id="catalogProducts" type="application/json">${jsonLd(tracking)}</script><script src="/catalog.js" defer></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-RK6R5HVKZC"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-RK6R5HVKZC');</script></head><body data-catalog="${key}"><div id="ageGate" class="age-gate"><div class="age-card"><p class="eyebrow">年齢確認</p><h2>18歳以上ですか？</h2><p>当サイトは成人向け作品を紹介しています。18歳未満の方は利用できません。</p><button id="enterBtn" class="primary">18歳以上です</button><button id="leaveBtn" class="secondary">退出する</button><noscript>年齢確認にはJavaScriptを有効にしてください。</noscript></div></div><main id="mainContent" class="catalog-main" inert><header><a href="/">FANZA作品ナビ</a><h1>FANZAの${h(page.name)}一覧</h1><p>${h(page.description)}</p></header><nav class="catalog-nav" aria-label="作品カテゴリ"><a href="/">トップ・作品検索</a>${Object.entries(catalogPages).map(([k,p])=>`<a href="${p.path}"${k===key?' aria-current="page"':''}>${h(p.name)}</a>`).join('')}</nav><section aria-labelledby="catalogHeading"><h2 id="catalogHeading">${h(page.name)}の掲載条件</h2><p>${h(page.intro)}</p><p>${h(page.note)}</p><p>当サイトはアフィリエイト広告を利用しています。</p></section><section aria-labelledby="worksHeading"><h2 id="worksHeading">${h(page.name)}の作品一覧（${products.length}件）</h2>${unavailable?'<p role="status">現在、作品情報を取得できません。時間をおいて再読み込みしてください。</p>':!products.length?'<p>現在の取得範囲では条件に一致する作品がありません。時間をおいてご確認ください。</p>':''}<ul class="catalog-list">${products.map((p,i)=>{const price=key==='sale'?discountedPrice(items[i]):null;return `<li>${renderProductImage(tracking[i],i)}<h3>${h(p.title)}</h3><p>配信日：<time datetime="${h(p.date)}">${h(p.date)}</time>${p.maker?'<br>メーカー：'+h(p.maker):''}</p>${p.actresses.length?`<p>出演：${p.actresses.map(a=>`<a href="/?actress=${encodeURIComponent(a)}#searchPanel">${h(a)}</a>`).join('、')}</p>`:''}${price?`<p class="catalog-price">${price.price.toLocaleString('ja-JP')}円 <s>${price.listPrice.toLocaleString('ja-JP')}円</s>（同一配信形式${price.format?'：'+h(price.format):''}）</p>`:''}${tracking[i].url?`<a class="catalog-link" data-product="${i}" data-link-type="button" href="${h(tracking[i].url)}" target="_blank" rel="sponsored nofollow noopener noreferrer">FANZAで作品・販売状況を見る</a>`:'<p>販売リンクを取得できませんでした。</p>'}</li>`;}).join('')}</ul></section><footer class="catalog-nav"><a href="/#searchPanel">出演者・ジャンルで検索する</a><a href="/privacy.html">プライバシーポリシー</a><a href="/disclaimer.html">免責事項</a><a href="/contact.html">お問い合わせ</a></footer></main></body></html>`;
}
