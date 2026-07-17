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
    const period = String(request.query.period || "week");
    const now = new Date();
    let startDate = null;

    if (period === "today") {
      const japanNow = new Date(
        now.getTime() + 9 * 60 * 60 * 1000
      );

      startDate = new Date(
        Date.UTC(
          japanNow.getUTCFullYear(),
          japanNow.getUTCMonth(),
          japanNow.getUTCDate()
        ) -
          9 * 60 * 60 * 1000
      );
    }

    if (period === "week") {
      startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - 7);
    }

    if (period === "month") {
      startDate = new Date(now);
      startDate.setUTCDate(startDate.getUTCDate() - 30);
    }

    const params = new URLSearchParams();

    params.set(
      "select",
      "content_id,title,actress,maker,genre,favorited_at"
    );

    params.set("order", "favorited_at.desc");
    params.set("limit", "5000");

    if (startDate) {
      params.set(
        "favorited_at",
        `gte.${startDate.toISOString()}`
      );
    }

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/favorite_logs?${params.toString()}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const rows = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      throw new Error(
        rows?.message ||
          "お気に入りデータの取得に失敗しました。"
      );
    }

    const rankingMap = new Map();

    for (const row of rows) {
      const contentId = String(row.content_id || "").trim();

      if (!contentId) {
        continue;
      }

      const current = rankingMap.get(contentId);

      if (current) {
        current.favorites += 1;

        if (
          row.favorited_at &&
          new Date(row.favorited_at) >
            new Date(current.last_favorited_at)
        ) {
          current.last_favorited_at = row.favorited_at;
        }

        continue;
      }

      rankingMap.set(contentId, {
        content_id: contentId,
        title: row.title || "作品名不明",
        actress: row.actress || "",
        maker: row.maker || "",
        genre: row.genre || "",
        favorites: 1,
        last_favorited_at: row.favorited_at || null,
      });
    }

    const rankings = Array.from(rankingMap.values())
      .sort((a, b) => {
        if (b.favorites !== a.favorites) {
          return b.favorites - a.favorites;
        }

        return (
          new Date(b.last_favorited_at || 0) -
          new Date(a.last_favorited_at || 0)
        );
      })
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    return response.status(200).json({
      period,
      total_favorites: rows.length,
      total_products: rankingMap.size,
      rankings,
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "お気に入りランキングの取得に失敗しました。",
    });
  }
}
