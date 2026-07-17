export default async function handler(request, response) {
  if (request.method !== "POST") {
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
    const {
      content_id,
      title,
      actress = "",
      maker = "",
      genre = "",
    } = request.body || {};

    if (!content_id || !title) {
      return response.status(400).json({
        error: "content_id と title は必須です。",
      });
    }

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/favorite_logs`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          content_id: String(content_id),
          title: String(title),
          actress: String(actress || ""),
          maker: String(maker || ""),
          genre: String(genre || ""),
        }),
      }
    );

    const result = await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      throw new Error(
        result?.message || "お気に入りの保存に失敗しました。"
      );
    }

    return response.status(200).json({
      success: true,
      favorite: result?.[0] || null,
    });
  } catch (error) {
    console.error(error);

    return response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "お気に入りの保存に失敗しました。",
    });
  }
}
