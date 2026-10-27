import { readCatalogFilters, catalogFilterPath, filterCatalogItems } from '../lib/catalog-filters.js';
import { productPage } from "../lib/product-page.js";
import { readFile } from "node:fs/promises";
import { renderSeoPage, escapeHtml } from "../lib/seo.js";

import { catalogPages, catalogParams, selectCatalog, renderCatalogPage } from "../lib/catalog-pages.js";

async function catalogPage(req, res, key) {
  let filters;
  try { filters = readCatalogFilters(req.query); }
  catch {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, follow");
    return res.status(400).send("検索条件を確認してください。各項目は80文字以内で指定してください。");
  }
  let items = [], unavailable = false;
  try {
    if (!process.env.DMM_API_ID || !process.env.DMM_AFFILIATE_ID) throw new Error("Missing catalog configuration");
    const params = catalogParams(key);
    if (Object.keys(filters).length) {
      // Narrow the same single upstream request, then verify exact metadata locally.
      params.set("keyword", [...(key === 'vr' ? ['VR'] : []), ...Object.values(filters)].join(' '));
      params.set("hits", "100");
    }
    params.set("api_id", process.env.DMM_API_ID);
    params.set("affiliate_id", process.env.DMM_AFFILIATE_ID);
    const response = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${params}`, {signal:AbortSignal.timeout(5000)});
    const data = await response.json();
    if (!response.ok || data?.result?.status !== 200 || !Array.isArray(data.result.items)) throw new Error("Catalog unavailable");
    items = selectCatalog(key, filterCatalogItems(data.result.items, filters));
  } catch { unavailable = true; console.error("Public catalog temporarily unavailable"); }
  const canonical = `https://fanza-dashboard-omega.vercel.app${catalogFilterPath(catalogPages[key].path, filters)}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", unavailable ? "no-store" : "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Link", `<${canonical}>; rel="canonical"`);
  if (unavailable) { res.setHeader("Retry-After", "60"); res.setHeader("X-Robots-Tag", "noindex, follow"); }
  if (Object.keys(filters).length) res.setHeader("X-Robots-Tag", "noindex, follow");
  return res.status(unavailable ? 503 : 200).send(renderCatalogPage(key, items, {unavailable, filters}));
}

async function homepage(req, res) {
  // Link previews need the existing public HTML/OGP, not a live catalog lookup.
  const twitterbot = typeof req.headers?.["user-agent"] === "string" && /\bTwitterbot(?:\/[\d.]+)?\b/i.test(req.headers["user-agent"]);
  let items = [];
  if (!twitterbot && process.env.DMM_API_ID && process.env.DMM_AFFILIATE_ID) {
    try {
      const params = new URLSearchParams({ api_id: process.env.DMM_API_ID, affiliate_id: process.env.DMM_AFFILIATE_ID,
        site: "FANZA", service: "digital", floor: "videoa", hits: "20", offset: "1", sort: "date", output: "json",
        lte_date: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).replace(" ", "T") });
      const response = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${params}`, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      if (response.ok && data?.result?.status === 200 && Array.isArray(data.result.items)) items = data.result.items;
    } catch { console.error("Homepage catalog temporarily unavailable"); }
  }
  try {
    const template = req.readTemplate
      ? await req.readTemplate('index.html')
      : await readFile(`${process.cwd()}/index.html`, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Never store the social response in the shared homepage cache.
    res.setHeader("Cache-Control", twitterbot ? "private, no-store, max-age=0" : items.length ? "public, max-age=0, s-maxage=300, stale-while-revalidate=600" : "public, max-age=0, s-maxage=30");
    res.setHeader("Vary", "User-Agent");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Link", '<https://fanza-dashboard-omega.vercel.app/>; rel="canonical"');
    let html = renderSeoPage(template, items);
    const verification = process.env.GOOGLE_SITE_VERIFICATION;
    if (verification) html = html.replace("</head>", `<meta name="google-site-verification" content="${escapeHtml(verification)}">\n</head>`);
    return res.status(200).send(html);
  } catch {
    return res.status(503).send("ページを読み込めませんでした。時間をおいて再度お試しください。");
  }
}

export default async function handler(req, res) {
  if (req.query.view === "product" && ["GET", "HEAD"].includes(req.method)) return productPage(req,res);
  if (req.query.view === "catalog" && ["GET", "HEAD"].includes(req.method)) {
    const key = req.query.category;
    if (typeof key !== "string" || !Object.hasOwn(catalogPages, key)) return res.status(404).send("ページが見つかりません。");
    return catalogPage(req, res, key);
  }
  if (req.query.view === "page" && ["GET", "HEAD"].includes(req.method)) return homepage(req, res);
  res.setHeader?.("X-Robots-Tag", "noindex, follow");
  res.setHeader?.("Cache-Control", "no-store");
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "GETリクエストのみ利用できます。",
    });
  }

  const apiId = process.env.DMM_API_ID;
  const affiliateId = process.env.DMM_AFFILIATE_ID;

  if (!apiId || !affiliateId) {
    return res.status(500).json({
      success: false,
      error: "Vercelの環境変数が設定されていません。",
    });
  }
const mode =
  typeof req.query.mode === "string"
    ? req.query.mode.trim()
    : "";
  const keyword =
    typeof req.query.keyword === "string"
      ? req.query.keyword.trim()
      : "";

  const hits = Math.min(
    Math.max(Number.parseInt(req.query.hits, 10) || 20, 1),
    100
  );

  const offset = Math.max(
    Number.parseInt(req.query.offset, 10) || 1,
    1
  );
const nowJst = new Date()
  .toLocaleString("sv-SE", {
    timeZone: "Asia/Tokyo",
  })
  .replace(" ", "T");
  
  const params = new URLSearchParams({
    api_id: apiId,
    affiliate_id: affiliateId,
    site: "FANZA",
    service: "digital",
    floor: "videoa",
   hits: String(hits),
offset: String(offset),
sort: ["rank", "price", "date"].includes(req.query.sort) ? req.query.sort : "date",
lte_date: nowJst,
output: "json",
  });

  if (keyword) {
    params.set("keyword", keyword);
  }
  
if (mode === "recommend") {
  params.set("sort", "rank");
}
if (mode === "sale") {
  params.set("sort", "rank");
  params.set("hits", "100");
}
  try {
    const response = await fetch(
      `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();
  
    if (!response.ok || data?.result?.status !== 200 || !Array.isArray(data?.result?.items)) {
      res.setHeader?.("Retry-After", "60");
      return res.status(503).json({
        success: false,
        error: "現在、作品情報を取得できません。時間をおいて再度お試しください。",

      });
    }

   let products = Array.isArray(data.result.items)
  ? data.result.items
  : [];

    // Preserve the upstream position; no synthetic popularity scores.
    if (params.get("sort") === "rank") {
      products = products.map((product, index) => ({ ...product, catalogRank: offset + index }));
    }

if (mode === "sale") {
  products = products.filter((product) => {
    const deliveries = Array.isArray(
      product?.prices?.deliveries?.delivery
    )
      ? product.prices.deliveries.delivery
      : product?.prices?.deliveries?.delivery
      ? [product.prices.deliveries.delivery]
      : [];

    const prices = deliveries.length ? deliveries.map((delivery) => ({
      price: delivery?.price, listPrice: delivery?.list_price,
    })) : [{ price: product?.prices?.price, listPrice: product?.prices?.list_price }];

    return prices.some(({ price, listPrice }) => {
      const amount = (value) => {
        const text = String(value ?? "").trim().replace(/,/g, "");
        return /^\d+(?:[~〜～])?$/.test(text) ? Number(text.replace(/[~〜～]/g, "")) : 0;
      };
      const salePrice = amount(price);
      const regularPrice = amount(listPrice);

      return regularPrice > salePrice && salePrice > 0;
    });
  });
}

    return res.status(200).json({
      success: true,
      keyword,
      totalCount: Number(data.result.total_count || 0),
      firstPosition: Number(data.result.first_position || 0),
      resultCount: Number(data.result.result_count || products.length),
      products,
  　　recommendations: mode === "recommend" ? products.slice(0, 6) : [],
    });
  } catch (error) {
    console.error("DMM catalog temporarily unavailable");
    res.setHeader?.("Retry-After", "60");

    return res.status(503).json({
      success: false,
      error: "作品データの取得中にエラーが発生しました。",
    });
  }
}


