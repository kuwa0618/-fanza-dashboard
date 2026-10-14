export const sourceLabels = Object.freeze({
  product_page: '作品詳細ページ',
  sale_page: 'セール作品ページ', vr_page: 'VR作品ページ', new_page: '新作ページ',
  recommendation: 'おすすめ', sale: 'セール', related: '関連作品',
  search: '検索結果', ranking: 'ランキング', favorites: 'お気に入り',
  history: '閲覧履歴', image: '作品画像（旧形式）', unknown: '掲載場所不明',
});
export const normalizeSource = (value) => typeof value === 'string' && Object.hasOwn(sourceLabels, value) ? value : 'unknown';
export const normalizeLinkType = (value) => ['image', 'button'].includes(value) ? value : 'unknown';
export const jstDate = (value) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function getPeriod(query = {}, now = new Date()) {
  const today = jstDate(now);
  let from = query.from;
  let to = query.to;
  if (!from && !to) {
    const days = String(query.days || '30');
    if (!['7', '30', '90'].includes(days)) throw new Error('期間は7日・30日・90日から選択してください。');
    to = today;
    from = new Date(Date.parse(`${today}T00:00:00Z`) - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  }
  const valid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || to > today || from < '2020-01-01') {
    throw new Error('開始日・終了日を正しく指定してください。未来の日付は指定できません。');
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (days > 90) throw new Error('集計期間は90日以内で指定してください。');
  const start = new Date(`${from}T00:00:00+09:00`).toISOString();
  const tomorrow = Date.parse(`${to}T00:00:00+09:00`) + 86400000;
  // Bound all pages to one timestamp so new clicks do not move the result set.
  const end = new Date(Math.min(tomorrow, now.getTime())).toISOString();
  return { from, to, days, start, end, timezone: 'Asia/Tokyo' };
}

export function aggregateClicks(rows, period) {
  const daily = new Map();
  for (let i = 0; i < period.days; i++) {
    const date = new Date(Date.parse(`${period.from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    daily.set(date, 0);
  }
  const sources = new Map(Object.keys(sourceLabels).map((key) => [key, 0]));
  const products = new Map();
  const linkTypes = { image: 0, button: 0, unknown: 0 };
  let total = 0;
  for (const row of rows) {
    const timestamp = Date.parse(row.clicked_at);
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(period.start) || timestamp >= Date.parse(period.end)) continue;
    const date = jstDate(row.clicked_at);
    if (!daily.has(date)) continue;
    total++;
    daily.set(date, daily.get(date) + 1);
    const source = normalizeSource(row.link_source);
    sources.set(source, sources.get(source) + 1);
    linkTypes[normalizeLinkType(row.link_type)]++;
    const id = String(row.content_id || 'unknown');
    const product = products.get(id) || { content_id: id, title: String(row.title || 'タイトル不明'), clicks: 0 };
    product.clicks++;
    products.set(id, product);
  }
  const byCount = (a, b) => b.clicks - a.clicks;
  return {
    total, uniqueProducts: products.size,
    daily: [...daily].map(([date, clicks]) => ({ date, clicks })),
    products: [...products.values()].sort((a, b) => byCount(a, b) || a.content_id.localeCompare(b.content_id)).slice(0, 50),
    sources: [...sources].map(([source, clicks]) => ({ source, label: sourceLabels[source], clicks })).sort(byCount),
    linkTypes,
  };
}

export function missingTrackingColumns(error) {
  return ['PGRST204', '42703'].includes(error?.code) && /\blink_source\b|\blink_type\b/.test(String(error?.message || ''));
}
