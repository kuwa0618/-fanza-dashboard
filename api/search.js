export default async function handler(req, res) {
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
sort: "date",
lte_date: nowJst,
output: "json",
  });

  if (keyword) {
    params.set("keyword", keyword);
  }
  
if (mode === "recommend") {
  params.set("sort", "rank");
}
  try {
    const response = await fetch(
      `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();
  
    if (!response.ok || data?.result?.status !== 200) {
      return res.status(502).json({
        success: false,
        error:
          data?.result?.message ||
          "DMM商品情報APIから正常な応答を取得できませんでした。",
        details: data?.result || null,
      });
    }

    const products = Array.isArray(data.result.items)
  ? data.result.items
  : [];

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
    console.error("DMM API error:", error);

    return res.status(500).json({
      success: false,
      error: "作品データの取得中にエラーが発生しました。",
    });
  }
}
