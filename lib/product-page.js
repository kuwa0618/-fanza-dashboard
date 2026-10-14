import { SITE_URL, escapeHtml as h, jsonLd, publicProducts } from './seo.js';
import { affiliateUrl, productImages } from './catalog-pages.js';

export const PRODUCT_ID = /^[a-zA-Z0-9_]{3,80}$/;
export const productUrl = id => PRODUCT_ID.test(String(id)) ? '/product/' + encodeURIComponent(id) : '';
const array = value => Array.isArray(value) ? value : value ? [value] : [];
const money = value => {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim().replace(/,/g, '') : '';
  if (!/^\d+(?:[~〜～])?$/.test(text)) return '';
  const amount = Number(text.replace(/[~〜～]/g, ''));
  return amount > 0 && Number.isSafeInteger(amount) ? amount.toLocaleString('ja-JP') + '円' + (/[~〜～]$/.test(text) ? '〜' : '') : '';
};
export function productPriceRows(item) {
  const labels = {hd:'HD版',stream:'ストリーミング',download:'ダウンロード',android:'Android版',ios:'iOS版'};
  const deliveries = array(item?.prices?.deliveries?.delivery);
  const rows = (deliveries.length ? deliveries : [item?.prices]).map(p => ({
    label: labels[p?.type] || (typeof p?.type === 'string' ? p.type : '参考価格'),
    price: money(p?.price), listPrice: money(p?.list_price),
  })).filter(p => p.price);
  return rows;
}
function shell({title,description,url,content,graph,tracking=[],index=true,image=''}) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><meta name="description" content="${h(description)}"><meta name="robots" content="${index?'index, follow, max-image-preview:large':'noindex, follow'}"><meta name="rating" content="adult">${url?`<link rel="canonical" href="${h(url)}">`:''}<meta property="og:type" content="article"><meta property="og:title" content="${h(title)}"><meta property="og:description" content="${h(description)}">${url?`<meta property="og:url" content="${h(url)}">`:''}${image?`<meta property="og:image" content="${h(image)}">`:''}<meta property="og:locale" content="ja_JP"><link rel="stylesheet" href="/styles.css"><style>#mainContent.product-main{max-width:850px;margin:auto;padding:24px 18px}.product-main *{min-width:0;overflow-wrap:anywhere}.product-main h1{font-size:clamp(1.35rem,5vw,2rem);line-height:1.6}.product-nav{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}.product-nav a,.product-buy{display:inline-block;padding:12px 16px;border-radius:10px}.product-buy{background:#301640;color:white;text-decoration:none;font-weight:bold;margin:12px 0}.catalog-image-link{display:block;max-width:600px;margin:20px auto}.catalog-image-link[hidden]{display:none}.catalog-image{display:block;width:100%;height:auto;object-fit:contain;border-radius:12px}.product-facts{display:grid;grid-template-columns:minmax(5em,auto) minmax(0,1fr);gap:12px;line-height:1.8}.product-facts dt{font-weight:bold}.product-facts dd{margin:0}.product-prices{padding-left:20px;line-height:1.9}.product-main a:focus-visible{outline:3px solid #a31332;outline-offset:3px}</style>${graph?`<script id="siteStructuredData" type="application/ld+json">${jsonLd(graph)}</script>`:''}<script id="catalogProducts" type="application/json">${jsonLd(tracking)}</script><script src="/catalog.js" defer></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-RK6R5HVKZC"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-RK6R5HVKZC');</script></head><body data-catalog="product"><div id="ageGate" class="age-gate"><div class="age-card"><p class="eyebrow">年齢確認</p><h2>18歳以上ですか？</h2><p>当サイトは成人向け作品を紹介しています。18歳未満の方は利用できません。</p><button id="enterBtn" class="primary">18歳以上です</button><button id="leaveBtn" class="secondary">退出する</button><noscript>年齢確認にはJavaScriptを有効にしてください。</noscript></div></div><main id="mainContent" class="product-main" inert><nav class="product-nav" aria-label="作品ナビゲーション"><a href="/">トップ・作品検索</a><a href="/sale">セール作品</a><a href="/vr">VR作品</a><a href="/new">新作</a></nav>${content}<footer class="product-nav"><a href="/privacy.html">プライバシーポリシー</a><a href="/disclaimer.html">免責事項</a><a href="/contact.html">お問い合わせ</a></footer></main></body></html>`;
}
export function renderProductDetail(item, id) {
  const product = publicProducts([item])[0];
  if (!product || item.content_id !== id) throw new Error('Invalid product');
  const url = new URL(productUrl(id), SITE_URL).href;
  const affiliate = affiliateUrl(item.affiliateURL || item.URL), images = productImages(item);
  const genres = array(item.iteminfo?.genre).map(g => String(g?.name || '')).filter(Boolean);
  const prices = productPriceRows(item);
  const description = `${product.title}の作品情報。出演者・メーカー・配信日・配信形式別の参考価格を確認できます。最新の販売条件はFANZAでご確認ください。18歳以上向け。`;
  const work = {'@type':'CreativeWork','@id':url+'#work',name:product.title,url,isFamilyFriendly:false,inLanguage:'ja',...(images.length?{image:images[0]}:{})};
  if (/^\d{4}-\d{2}-\d{2}$/.test(product.date)) work.datePublished = product.date;
  const graph = {'@context':'https://schema.org','@graph':[
    {'@type':'WebPage','@id':url+'#webpage',url,name:product.title,description,isFamilyFriendly:false,inLanguage:'ja',isPartOf:{'@id':SITE_URL+'#website'},mainEntity:{'@id':url+'#work'}},work,
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'FANZA作品ナビ',item:SITE_URL},{'@type':'ListItem',position:2,name:product.title,item:url}]},
  ]};
  const tracking = [{id,title:product.title,date:product.date,maker:product.maker,actresses:product.actresses,genres,url:affiliate,images,tags:[],price:0,listPrice:0,review:null,description:'作品情報'}];
  const picture = images.length ? `<img class="catalog-image" src="${h(images[0])}" alt="${h(product.title)}" loading="eager" decoding="async">` : '';
  const cover = picture ? affiliate ? `<a class="catalog-image-link" data-product="0" data-link-type="image" href="${h(affiliate)}" aria-label="${h(product.title)}をFANZAで見る" target="_blank" rel="sponsored nofollow noopener noreferrer">${picture}</a>` : `<div class="catalog-image-link">${picture}</div>` : '';
  const content = `<article data-content-id="${h(id)}"><h1>${h(product.title)}</h1>${cover}<dl class="product-facts"><dt>作品ID</dt><dd>${h(id)}</dd><dt>出演者</dt><dd>${product.actresses.length?product.actresses.map(a=>`<a href="/?actress=${encodeURIComponent(a)}#searchPanel">${h(a)}</a>`).join('、'):'情報なし'}</dd><dt>メーカー</dt><dd>${h(product.maker)||'情報なし'}</dd><dt>配信日</dt><dd>${product.date?`<time datetime="${h(product.date)}">${h(product.date)}</time>`:'情報なし'}</dd>${genres.length?`<dt>ジャンル</dt><dd>${genres.map(h).join('、')}</dd>`:''}</dl><section aria-labelledby="priceHeading"><h2 id="priceHeading">配信形式別の参考価格</h2>${prices.length?`<ul class="product-prices">${prices.map(p=>`<li>${h(p.label)}：${h(p.price)}${p.listPrice&&p.listPrice!==p.price?`（通常価格 ${h(p.listPrice)}）`:''}</li>`).join('')}</ul>`:'<p>価格はFANZAでご確認ください。</p>'}</section>${affiliate?`<a class="product-buy" data-product="0" data-link-type="button" href="${h(affiliate)}" target="_blank" rel="sponsored nofollow noopener noreferrer">FANZAで作品・販売状況を見る</a>`:'<p>現在、販売リンクを取得できません。</p>'}<p>価格・対応機器・配信形式は変更される場合があります。最新の販売条件はFANZAで確認してください。</p><p>当サイトはアフィリエイト広告を利用しています。</p></article>`;
  return shell({title:product.title+'｜FANZA作品ナビ',description,url,content,graph,tracking,image:images[0]});
}
export function renderProductError(message) {
  return shell({title:message+'｜FANZA作品ナビ',description:message,content:`<h1>${h(message)}</h1><p><a href="/#searchPanel">作品検索へ戻る</a></p>`,index:false});
}
export async function productPage(req,res) {
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  const error = (code,message) => {res.setHeader('X-Robots-Tag','noindex, follow');if(code===503)res.setHeader('Retry-After','60');return res.status(code).send(renderProductError(message));};
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!PRODUCT_ID.test(id)) return error(404,'作品が見つかりません。');
  try {
    if (!process.env.DMM_API_ID || !process.env.DMM_AFFILIATE_ID) throw new Error('Missing product configuration');
    const params = new URLSearchParams({api_id:process.env.DMM_API_ID,affiliate_id:process.env.DMM_AFFILIATE_ID,site:'FANZA',service:'digital',floor:'videoa',cid:id,hits:'1',output:'json'});
    const response = await fetch('https://api.dmm.com/affiliate/v3/ItemList?'+params,{signal:AbortSignal.timeout(5000)});
    const data = await response.json();
    if (!response.ok || data?.result?.status !== 200 || !Array.isArray(data.result.items)) throw new Error('Invalid upstream response');
    const found = data.result.items.find(p=>p?.content_id===id);
    if (!found) return error(404,'作品が見つかりません。');
    const html = renderProductDetail(found,id);
    res.setHeader('Link',`<${new URL(productUrl(id),SITE_URL).href}>; rel="canonical"`);
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  } catch {console.error('Product detail temporarily unavailable');return error(503,'現在、作品情報を取得できません。時間をおいて再度お試しください。');}
}
