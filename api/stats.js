import { adminHeaders, isAdminAuthorized } from '../lib/admin-auth.js';
import { aggregateClicks, getPeriod, missingTrackingColumns } from '../lib/click-analytics.js';

export async function clickAnalysis(req, res) {
  Object.entries(adminHeaders).forEach(([key, value]) => res.setHeader(key, value));
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: '管理者認証が設定されていません。' });
  }
  if (!isAdminAuthorized(req.headers?.authorization)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="FANZA Admin", charset="UTF-8"');
    return res.status(401).json({ error: '管理者としてログインしてください。' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let period;
  try { period = getPeriod(req.query); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !key) {
    return res.status(503).json({ error: '分析データの接続設定がありません。' });
  }

  try {
    let sourceTrackingAvailable = true;
    let offset = 0;
    let totalExpected;
    const rows = [];
    const maxRows = 100000;
    while (true) {
      const params = new URLSearchParams({
        select: 'id,content_id,title,clicked_at' + (sourceTrackingAvailable ? ',link_source,link_type' : ''),
        order: 'clicked_at.asc,id.asc',
        offset: String(offset), limit: '1000',
      });
      params.append('clicked_at', `gte.${period.start}`);
      params.append('clicked_at', `lt.${period.end}`);
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/click_logs?${params}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (sourceTrackingAvailable && missingTrackingColumns(data)) {
          sourceTrackingAvailable = false;
          continue;
        }
        throw new Error('Database query failed');
      }
      if (!Array.isArray(data)) throw new Error('Unexpected database response');
      const count = response.headers.get('content-range')?.split('/')[1];
      if (totalExpected === undefined && count && /^\d+$/.test(count)) totalExpected = Number(count);
      if ((totalExpected ?? 0) > maxRows || rows.length + data.length > maxRows) {
        return res.status(422).json({ error: 'クリック数が多いため、集計期間を短くしてください（上限10万件）。' });
      }
      rows.push(...data);
      offset += data.length;
      if (data.length === 0 || (totalExpected !== undefined && offset >= totalExpected)) break;
      if (offset >= maxRows) {
        return res.status(422).json({ error: '集計期間を短くしてください（上限10万件）。' });
      }
    }
    // Never silently return partial figures if rows disappear during pagination.
    if (totalExpected !== undefined && rows.length < totalExpected) throw new Error('Incomplete result');
    return res.status(200).json({
      period, ...aggregateClicks(rows, period), sourceTrackingAvailable,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    // Do not return provider error text, URLs, SQL or credentials to the client.
    console.error('Click analysis query failed');
    return res.status(502).json({ error: '分析データを取得できませんでした。時間をおいて再試行してください。' });
  }
}

export default async function handler(req, res) {
  if (req.query?.view === 'click-analysis') return clickAnalysis(req, res);
  Object.entries(adminHeaders).forEach(([key, value]) => res.setHeader(key, value));
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: '管理者認証が設定されていません。' });
  }
  if (!isAdminAuthorized(req.headers?.authorization)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="FANZA Admin", charset="UTF-8"');
    return res.status(401).json({ error: '管理者としてログインしてください。' });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const headers = {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    };

    const [clickResponse, favoriteResponse] = await Promise.all([
      fetch(
        `${process.env.SUPABASE_URL}/rest/v1/click_logs` +
          "?select=content_id,title,actress,maker,genre,clicked_at" +
          "&order=clicked_at.desc" +
          "&limit=1000",
        { headers }
      ),
      fetch(
        `${process.env.SUPABASE_URL}/rest/v1/favorite_logs` +
          "?select=content_id,title,favorited_at" +
          "&order=favorited_at.desc" +
          "&limit=1000",
        { headers }
      ),
    ]);

    if (!clickResponse.ok) {
      const errorText = await clickResponse.text();

      return res.status(clickResponse.status).json({
        error: errorText || "クリックデータの取得に失敗しました",
      });
    }

    if (!favoriteResponse.ok) {
      const errorText = await favoriteResponse.text();

      return res.status(favoriteResponse.status).json({
        error: errorText || "お気に入りデータの取得に失敗しました",
      });
    }

    const logs = await clickResponse.json();
    const favoriteLogs = await favoriteResponse.json();

    const now = new Date();

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const countSince = (items, date, dateColumn) =>
      items.filter((item) => new Date(item[dateColumn]) >= date).length;

    const countValues = (values) => {
      const counts = {};

      values
        .filter(Boolean)
        .forEach((value) => {
          counts[value] = (counts[value] || 0) + 1;
        });

      return Object.entries(counts)
        .map(([name, clicks]) => ({
          name,
          clicks,
        }))
        .sort((a, b) => b.clicks - a.clicks);
    };

    const productMap = {};

    logs.forEach((log) => {
      const key = log.content_id;

      if (!productMap[key]) {
        productMap[key] = {
          content_id: log.content_id,
          title: log.title || "タイトル不明",
          actress: log.actress || "",
          maker: log.maker || "",
          clicks: 0,
        };
      }

      productMap[key].clicks += 1;
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    const favoriteMap = {};

    favoriteLogs.forEach((log) => {
      const key = log.content_id;

      if (!favoriteMap[key]) {
        favoriteMap[key] = {
          content_id: log.content_id,
          title: log.title || "タイトル不明",
          favorites: 0,
        };
      }

      favoriteMap[key].favorites += 1;
    });

    const topFavorites = Object.values(favoriteMap)
      .sort((a, b) => b.favorites - a.favorites)
      .slice(0, 20);

    const makers = countValues(logs.map((log) => log.maker)).slice(0, 10);

    const genres = countValues(
      logs.flatMap((log) =>
        String(log.genre || "")
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean)
      )
    ).slice(0, 10);

    const dailyMap = {};

    logs.forEach((log) => {
      const date = new Date(log.clicked_at);
      const key = date.toLocaleDateString("ja-JP");

      dailyMap[key] = (dailyMap[key] || 0) + 1;
    });

    const dailyClicks = Object.entries(dailyMap)
      .map(([date, clicks]) => ({
        date,
        clicks,
      }))
      .slice(0, 30);

    return res.status(200).json({
      totals: {
        all: logs.length,
        today: countSince(logs, startOfToday, "clicked_at"),
        sevenDays: countSince(logs, sevenDaysAgo, "clicked_at"),
        thirtyDays: countSince(logs, thirtyDaysAgo, "clicked_at"),
        favoritesAll: favoriteLogs.length,
        favoritesToday: countSince(
          favoriteLogs,
          startOfToday,
          "favorited_at"
        ),
        favoritesSevenDays: countSince(
          favoriteLogs,
          sevenDaysAgo,
          "favorited_at"
        ),
        favoritesThirtyDays: countSince(
          favoriteLogs,
          thirtyDaysAgo,
          "favorited_at"
        ),
      },
      topProducts,
      topFavorites,
      topMakers: makers,
      topGenres: genres,
      dailyClicks,
      recentClicks: logs.slice(0, 20),
      recentFavorites: favoriteLogs.slice(0, 20),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "分析データの作成に失敗しました",
    });
  }
}
