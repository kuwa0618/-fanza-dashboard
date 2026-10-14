import { missingTrackingColumns, normalizeLinkType, normalizeSource } from '../lib/click-analytics.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.content_id !== 'string' || !input.content_id.trim() || input.content_id.length > 512) {
    return res.status(400).json({ error: 'content_id is required' });
  }
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const payload = {
    content_id: input.content_id,
    title: text(input.title, 2000), actress: text(input.actress, 2000),
    maker: text(input.maker, 1000), genre: text(input.genre, 2000),
    link_source: normalizeSource(input.link_source),
    link_type: normalizeLinkType(input.link_type),
  };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!process.env.SUPABASE_URL || !key) return res.status(503).json({ error: 'クリック記録の接続設定がありません。' });
  const insert = (body) => fetch(`${process.env.SUPABASE_URL}/rest/v1/click_logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  try {
    let response = await insert(payload);
    let sourceRecorded = true;
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (missingTrackingColumns(error)) {
        // Only retry a rejected insert for missing tracking columns; never retry a timeout.
        const { link_source, link_type, ...legacy } = payload;
        response = await insert(legacy);
        sourceRecorded = false;
        console.warn('Click tracking columns are not available; recorded legacy click');
      }
    }
    if (!response.ok) throw new Error('Insert failed');
    return res.status(200).json({ success: true, source_recorded: sourceRecorded });
  } catch {
    console.error('Click recording failed');
    return res.status(502).json({ error: 'クリックを記録できませんでした。' });
  }
}
