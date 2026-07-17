export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      error: "Method not allowed",
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response.status(500).json({
      error: "Supabaseの環境変数が設定されていません。",
    });
  }

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    };

    const [clickRes, favoriteRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/click_logs?select=content_id,title,clicked_at&clicked_at=gte.${today.toISOString()}`,
        { headers }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/favorite_logs?select=content_id,title,favorited_at&favorited_at=gte.${today.toISOString()}`,
        { headers }
      ),
    ]);

    const clicks = await clickRes.json();
    const favorites = await favoriteRes.json();

    if (!clickRes.ok || !favoriteRes.ok) {
      throw new Error("データ取得に失敗しました。");
    }

    const clickMap = new Map();
    const favoriteMap = new Map();

    for (const row of clicks) {
      const key = row.content_id;

      if (!clickMap.has(key)) {
        clickMap.set(key, {
          title: row.title,
          count: 0,
        });
      }

      clickMap.get(key).count++;
    }

    for (const row of favorites) {
      const key = row.content_id;

      if (!favoriteMap.has(key)) {
        favoriteMap.set(key, {
          title: row.title,
          count: 0,
        });
      }

      favoriteMap.get(key).count++;
    }

    return response.status(200).json({
      today_clicks: clicks.length,
      today_favorites: favorites.length,

      top_clicked: [...clickMap.entries()]
        .map(([content_id, value]) => ({
          content_id,
          title: value.title,
          clicks: value.count,
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10),

      top_favorited: [...favoriteMap.entries()]
        .map(([content_id, value]) => ({
          content_id,
          title: value.title,
          favorites: value.count,
        }))
        .sort((a, b) => b.favorites - a.favorites)
        .slice(0, 10),
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "概要データの取得に失敗しました。",
    });
  }
}
