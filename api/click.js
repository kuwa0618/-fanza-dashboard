const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { content_id, title, actress, maker, genre } = req.body;

  const { error } = await supabase.from("click_logs").insert([
    {
      content_id,
      title,
      actress,
      maker,
      genre,
    },
  ]);

  if (error) {
    return res.status(500).json(error);
  }

  res.status(200).json({ success: true });
}
