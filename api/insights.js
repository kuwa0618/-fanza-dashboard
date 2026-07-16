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
      const likes = Number(post.likes || 0);
      const reposts = Number(post.reposts || 0);
      const bookmarks = Number(post.bookmarks || 0);
      const replies = Number(post.replies || 0);
      const profileClicks = Number(post.profile_clicks || 0);
      const linkClicks = Number(post.link_clicks || 0);

      return {
        ...post,
        impressions,
        likes,
        reposts,
        bookmarks,
        replies,
        profile_clicks: profileClicks,
        link_clicks: linkClicks,
        click_rate:
          impressions > 0
            ? Number(((linkClicks / impressions) * 100).toFixed(2))
            : 0,
        like_rate:
          impressions > 0
            ? Number(((likes / impressions) * 100).toFixed(2))
            : 0,
        repost_rate:
          impressions > 0
            ? Number(((reposts / impressions) * 100).toFixed(2))
            : 0,
        bookmark_rate:
          impressions > 0
            ? Number(((bookmarks / impressions) * 100).toFixed(2))
            : 0,
        reply_rate:
          impressions > 0
            ? Number(((replies / impressions) * 100).toFixed(2))
            : 0,
        profile_click_rate:
          impressions > 0
            ? Number(((profileClicks / impressions) * 100).toFixed(2))
            : 0,
      };
    });

    const topByClickRate = [...analyzedPosts]
      .filter((post) => post.impressions > 0)
      .sort((a, b) => {
        if (b.click_rate !== a.click_rate) {
          return b.click_rate - a.click_rate;
        }

        return b.impressions - a.impressions;
      })
      .slice(0, 10);

    const topByImpressions = [...analyzedPosts]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    const topByLinkClicks = [...analyzedPosts]
      .sort((a, b) => b.link_clicks - a.link_clicks)
      .slice(0, 10);

    const hourMap = {};

    analyzedPosts.forEach((post) => {
      if (!post.posted_at) return;

      const date = new Date(post.posted_at);

      if (Number.isNaN(date.getTime())) return;

      const hour = date.getHours();
      const key = `${hour}時台`;

      if (!hourMap[key]) {
        hourMap[key] = {
          hour,
          label: key,
          posts: 0,
          impressions: 0,
          linkClicks: 0,
        };
      }

      hourMap[key].posts += 1;
      hourMap[key].impressions += post.impressions;
      hourMap[key].linkClicks += post.link_clicks;
    });

    const hourlyPerformance = Object.values(hourMap)
      .map((item) => ({
        hour: item.hour,
        label: item.label,
        posts: item.posts,
        impressions: item.impressions,
        link_clicks: item.linkClicks,
        average_click_rate:
          item.impressions > 0
            ? Number(
                ((item.linkClicks / item.impressions) * 100).toFixed(2)
              )
            : 0,
      }))
      .sort((a, b) => a.hour - b.hour);

    const totalImpressions = analyzedPosts.reduce(
      (sum, post) => sum + post.impressions,
      0
    );

    const totalLinkClicks = analyzedPosts.reduce(
      (sum, post) => sum + post.link_clicks,
      0
    );

    return res.status(200).json({
      summary: {
        posts: analyzedPosts.length,
        impressions: totalImpressions,
        link_clicks: totalLinkClicks,
        click_rate:
          totalImpressions > 0
            ? Number(
                ((totalLinkClicks / totalImpressions) * 100).toFixed(2)
              )
            : 0,
      },
      topByClickRate,
      topByImpressions,
      topByLinkClicks,
      hourlyPerformance,
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error.message || "投稿インサイトデータの作成に失敗しました",
    });
  }
}
