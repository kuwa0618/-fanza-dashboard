export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { content_id, title, actress, maker, genre } = req.body || {};

  if (!content_id) {
    return res.status(400).json({ error: "content_id is required" });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/click_logs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          content_id,
          title: title || "",
          actress: actress || "",
          maker: maker || "",
          genre: genre || "",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: errorText || "Supabase insert failed",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unexpected error",
    });
  }
}
