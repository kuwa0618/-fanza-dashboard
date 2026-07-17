export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { actress, maker, genre } = req.query;

  const keywords = [actress, maker, genre].filter(Boolean);

  if (keywords.length === 0) {
    return res.status(200).json({
      success: true,
      items: []
    });
  }

  const keyword = keywords[0];

  const url =
    `https://api.dmm.com/affiliate/v3/ItemList` +
    `?api_id=${process.env.DMM_API_ID}` +
    `&affiliate_id=${process.env.DMM_AFFILIATE_ID}` +
    `&site=FANZA` +
    `&service=digital` +
    `&floor=videoa` +
    `&keyword=${encodeURIComponent(keyword)}` +
    `&hits=12` +
    `&output=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    res.status(200).json({
      success: true,
      items: data.result?.items || []
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
}
