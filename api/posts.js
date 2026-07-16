export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/post_logs` +
        "?select=id,post_id,content,impressions,likes,reposts,bookmarks,replies,profile_clicks,link_clicks,posted_at" +
        "&order=posted_at.desc" +
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
        error: errorText || "投稿データの取得に失敗しました",
      });
    }

    const posts = await response.json();

    const analyzedPosts = posts.map((post) => {
      const impressions = Number(post.impressions || 0);
      const linkClicks = Number(post.link_clicks || 0);

      const clickRate =
        impressions > 0
          ? Number(((linkClicks / impressions) * 100).toFixed(2))
          : 0;

      return {
        ...post,
        click_rate: clickRate,
      };
    });

    const totals = analyzedPosts.reduce(
      (result, post) => {
        result.posts += 1;
        result.impressions += Number(post.impressions || 0);
        result.likes += Number(post.likes || 0);
        result.reposts += Number(post.reposts || 0);
        result.bookmarks += Number(post.bookmarks || 0);
        result.replies += Number(post.replies || 0);
        result.profileClicks += Number(post.profile_clicks || 0);
        result.linkClicks += Number(post.link_clicks || 0);

        return result;
      },
      {
        posts: 0,
        impressions: 0,
        likes: 0,
        reposts: 0,
        bookmarks: 0,
        replies: 0,
        profileClicks: 0,
        linkClicks: 0,
      }
    );

    totals.clickRate =
      totals.impressions > 0
        ? Number(
            ((totals.linkClicks / totals.impressions) * 100).toFixed(2)
          )
        : 0;

    return res.status(200).json({
      totals,
      posts: analyzedPosts,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "投稿分析データの作成に失敗しました",
    });
  }
}
