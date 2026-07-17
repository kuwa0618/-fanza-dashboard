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
      const japanNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

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
      "content_id,maker,clicked_at"
    );

    params.set("order", "clicked_at.desc");
    params.set("limit", "5000");

    if (startDate) {
      params.set(
        "clicked_at",
        `gte.${startDate.toISOString()}`
      );
    }

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/click_logs?${params.toString()}`,
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
        rows?.message || "クリックデータの取得に失敗しました。"
      );
    }

    const makerMap = new Map();

    for (const row of rows) {
      const makerNames = String(row.maker || "")
        .split(/[,、/]/)
        .map((name) => name.trim())
        .filter(Boolean);

      for (const maker of makerNames) {
        const current = makerMap.get(maker);

        if (current) {
          current.clicks += 1;
          current.product_ids.add(row.content_id);

          if (
            row.clicked_at &&
            new Date(row.clicked_at) >
              new Date(current.last_clicked_at)
          ) {
            current.last_clicked_at = row.clicked_at;
          }

          continue;
        }

        makerMap.set(maker, {
          maker,
          clicks: 1,
          product_ids: new Set(
            row.content_id ? [row.content_id] : []
          ),
          last_clicked_at: row.clicked_at || null,
        });
      }
    }

    const rankings = Array.from(makerMap.values())
      .map((item) => ({
        maker: item.maker,
        clicks: item.clicks,
        product_count: item.product_ids.size,
        last_clicked_at: item.last_clicked_at,
      }))
      .sort((a, b) => {
        if (b.clicks !== a.clicks) {
          return b.clicks - a.clicks;
        }

        return (
          new Date(b.last_clicked_at || 0) -
          new Date(a.last_clicked_at || 0)
        );
      })
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        ...item,
      }));

    return response.status(200).json({
      period,
      total_clicks: rows.length,
      total_makers: makerMap.size,
      rankings,
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "メーカーランキングの取得に失敗しました。",
    });
  }
}
