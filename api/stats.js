export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/click_logs` +
        "?select=content_id,title,actress,maker,genre,clicked_at" +
        "&order=clicked_at.desc" +
        "&limit=1000",
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        error: errorText || "クリックデータの取得に失敗しました",
      });
    }

    const logs = await response.json();
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

    const countSince = (date) =>
      logs.filter((log) => new Date(log.clicked_at) >= date).length;

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
        today: countSince(startOfToday),
        sevenDays: countSince(sevenDaysAgo),
        thirtyDays: countSince(thirtyDaysAgo),
      },
      topProducts,
      topMakers: makers,
      topGenres: genres,
      dailyClicks,
      recentClicks: logs.slice(0, 20),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "分析データの作成に失敗しました",
    });
  }
}
