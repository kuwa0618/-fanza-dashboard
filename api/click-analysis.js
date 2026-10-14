import { adminHeaders, isAdminAuthorized } from '../lib/admin-auth.js';
import { aggregateClicks, getPeriod, missingTrackingColumns } from '../lib/click-analytics.js';

export default async function handler(req, res) {
  Object.entries(adminHeaders).forEach(([key, value]) => res.setHeader(key, value));
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: '管理者認証が設定されていません。' });
  }
  if (!isAdminAuthorized(req.headers?.authorization)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="FANZA Admin", charset="UTF-8"');
    return res.status(401).json({ error: '管理者としてログインしてください。' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let period;
  try { period = getPeriod(req.query); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !key) {
    return res.status(503).json({ error: '分析データの接続設定がありません。' });
  }

  try {
    let sourceTrackingAvailable = true;
    let offset = 0;
    let totalExpected;
    const rows = [];
    const maxRows = 100000;
    while (true) {
      const params = new URLSearchParams({
        select: 'id,content_id,title,clicked_at' + (sourceTrackingAvailable ? ',link_source,link_type' : ''),
        order: 'clicked_at.asc,id.asc',
        offset: String(offset), limit: '1000',
      });
      params.append('clicked_at', `gte.${period.start}`);
      params.append('clicked_at', `lt.${period.end}`);
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/click_logs?${params}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (sourceTrackingAvailable && missingTrackingColumns(data)) {
          sourceTrackingAvailable = false;
          continue;
        }
        throw new Error('Database query failed');
      }
      if (!Array.isArray(data)) throw new Error('Unexpected database response');
      const count = response.headers.get('content-range')?.split('/')[1];
      if (totalExpected === undefined && count && /^\d+$/.test(count)) totalExpected = Number(count);
      if ((totalExpected ?? 0) > maxRows || rows.length + data.length > maxRows) {
        return res.status(422).json({ error: 'クリック数が多いため、集計期間を短くしてください（上限10万件）。' });
      }
      rows.push(...data);
      offset += data.length;
      if (data.length === 0 || (totalExpected !== undefined && offset >= totalExpected)) break;
      if (offset >= maxRows) {
        return res.status(422).json({ error: '集計期間を短くしてください（上限10万件）。' });
      }
    }
    // Never silently return partial figures if rows disappear during pagination.
    if (totalExpected !== undefined && rows.length < totalExpected) throw new Error('Incomplete result');
    return res.status(200).json({
      period, ...aggregateClicks(rows, period), sourceTrackingAvailable,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    // Do not return provider error text, URLs, SQL or credentials to the client.
    console.error('Click analysis query failed');
    return res.status(502).json({ error: '分析データを取得できませんでした。時間をおいて再試行してください。' });
  }
}
