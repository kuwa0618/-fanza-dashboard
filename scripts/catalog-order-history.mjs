import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SOURCE = 'https://fanza-works-navi-recovery.orange-rose-6867.chatgpt.site';
const PROFILE = 'FANZA/digital/videoa/rank/100';
const HOUR = 3600000;
const LIMIT = 100;
const MAX_SNAPSHOTS = 140;
const MAX_BYTES = 4 * 1024 * 1024;

function checkTime(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid observation time');
  return Date.parse(value);
}

export function validateSnapshot(snapshot) {
  if (snapshot?.profile !== PROFILE || snapshot.source !== SOURCE) throw new Error('Incompatible source/profile');
  checkTime(snapshot.observedAt);
  if (!Array.isArray(snapshot.rows) || snapshot.rows.length !== LIMIT) throw new Error('A complete top-100 response is required');
  const ids = new Set();
  snapshot.rows.forEach((row, i) => {
    if (!/^[a-zA-Z0-9_]{3,80}$/.test(row?.id) || ids.has(row.id) || row.rank !== i + 1) throw new Error('Invalid ID or upstream order');
    ids.add(row.id);
  });
  return snapshot;
}

export function snapshotFromResponse(data, observedAt) {
  if (data?.success !== true || data.firstPosition !== 1 || data.resultCount !== LIMIT || data.products?.length !== LIMIT) throw new Error('Incomplete or unsuccessful catalog response');
  const snapshot = {
    profile: PROFILE, source: SOURCE, observedAt,
    // Deliberately retain only non-graphic identifiers and supplied positions.
    rows: data.products.map(p => ({ id: p.content_id, rank: p.catalogRank })),
  };
  return validateSnapshot(snapshot);
}

export function validateHistory(history) {
  if (history?.version !== 1 || !Array.isArray(history.snapshots) || history.snapshots.length > MAX_SNAPSHOTS) throw new Error('Invalid history');
  let previous = -Infinity;
  for (const snapshot of history.snapshots) {
    validateSnapshot(snapshot);
    const time = checkTime(snapshot.observedAt);
    if (time <= previous) throw new Error('History must be chronological');
    previous = time;
  }
  return history;
}

export function appendSnapshot(history, snapshot) {
  validateHistory(history); validateSnapshot(snapshot);
  const time = checkTime(snapshot.observedAt);
  const last = history.snapshots.at(-1);
  if (last && time - checkTime(last.observedAt) < 6 * HOUR) throw new Error('Observations must be at least six hours apart');
  return { version: 1, snapshots: [...history.snapshots, snapshot]
    .filter(s => time - checkTime(s.observedAt) <= 35 * 24 * HOUR).slice(-MAX_SNAPSHOTS) };
}

export function compare(current, previous) {
  validateSnapshot(current); validateSnapshot(previous);
  const previousTime = checkTime(previous.observedAt);
  if (checkTime(current.observedAt) <= previousTime) throw new Error('Comparison must be older');
  const old = new Map(previous.rows.map(row => [row.id, row.rank]));
  const present = new Set(current.rows.map(row => row.id));
  return {
    previousAt: previous.observedAt, currentAt: current.observedAt,
    rows: current.rows.map(row => ({ ...row, previousRank: old.get(row.id) ?? null,
      change: old.has(row.id) ? old.get(row.id) - row.rank : null })),
    outsideCurrent: previous.rows.filter(row => !present.has(row.id)).map(row => row.id),
  };
}

export function comparisons(history) {
  validateHistory(history);
  const current = history.snapshots.at(-1);
  if (!current) return [];
  const prior = history.snapshots.slice(0, -1);
  return [['前回', null], ['約24時間前', 24], ['約7日前', 7 * 24], ['約30日前', 30 * 24]].map(([label, hours]) => {
    // Never substitute a recent observation when the requested history is missing.
    const target = checkTime(current.observedAt) - hours * HOUR;
    const previous = hours === null ? prior.at(-1) : prior.filter(s => {
      const age = target - checkTime(s.observedAt);
      return age >= 0 && age <= 8 * HOUR;
    }).at(-1);
    return { label, comparison: previous ? compare(current, previous) : null };
  });
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderReport(history, now = new Date().toISOString()) {
  validateHistory(history);
  const current = history.snapshots.at(-1);
  const stale = !current || checkTime(now) - checkTime(current.observedAt) > 12 * HOUR;
  const sections = comparisons(history).map(({label, comparison}) => {
    if (!comparison) return `<section><h2>${label}</h2><p>比較用の記録がまだありません。</p></section>`;
    const rows = [...comparison.rows].sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
    return `<section><h2>${label}との比較</h2><p>比較元 ${escapeHtml(comparison.previousAt)} → ${escapeHtml(comparison.currentAt)}</p>
      <table><thead><tr><th>商品ID</th><th>今回の位置</th><th>前回の位置</th><th>変化</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.id)}</td><td>${row.rank}</td><td>${row.previousRank ?? '上位100件内に記録なし'}</td><td>${row.change === null ? '今回観測入り' : row.change > 0 ? `↑${row.change}` : row.change < 0 ? `↓${-row.change}` : '変化なし'}</td></tr>`).join('')}</tbody></table>
      <p>今回の上位100件内にない商品: ${comparison.outsideCurrent.map(escapeHtml).join(', ') || 'なし'}。正確な順位・販売停止の有無は不明です。</p></section>`;
  }).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>カタログ順序の観測記録</title>
  <style>body{font:16px/1.6 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 16px;color:#172033;background:#f6f8fb}section{background:white;padding:20px;margin:24px 0;overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{background:#edf2f7}aside{padding:16px;background:#fff0c2}p{overflow-wrap:anywhere}</style>
  <h1>カタログ順序の観測記録</h1><p>対象: FANZA / digital / videoa / API人気順・上位100件</p>
  <p>最終取得時刻（UTC）: ${escapeHtml(current?.observedAt ?? '未取得')} ／保存数: ${history.snapshots.length}</p>
  ${stale ? '<aside>取得から12時間以上経過、または未取得です。現在の順位として扱わないでください。</aside>' : ''}
  <p>取得時のAPIの並び順を比較した参考データです。購入件数、公式日間・月間ランキング、女優ランキングを表すものではありません。初観測は新発売を意味しません。過去データは遡って復元できません。</p>${sections}</html>`;
}

export async function capture(history, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  validateHistory(history);
  const startedAt = now();
  const last = history.snapshots.at(-1);
  if (last && checkTime(startedAt) - checkTime(last.observedAt) < 6 * HOUR) throw new Error('Six-hour capture budget has not elapsed');
  const response = await fetchImpl(`${SOURCE}/api/search?sort=rank&hits=100&offset=1`, {
    signal: AbortSignal.timeout(20000), redirect: 'error',
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`Catalog request failed (HTTP ${response.status})`);
  if (Number(response.headers.get('age') || 0) > 300) throw new Error('Cached response is too old');
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Response exceeds size budget');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Response exceeds size budget');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Catalog returned invalid JSON'); }
  return appendSnapshot(history, snapshotFromResponse(data, now()));
}

export async function main() {
  const directory = process.env.CATALOG_HISTORY_DIR || '.catalog-order';
  let history;
  try {
    const content = await readFile(`${directory}/history.json`, 'utf8');
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('History exceeds size budget');
    history = validateHistory(JSON.parse(content));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    history = { version: 1, snapshots: [] };
  }
  const next = await capture(history);
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/history.json.tmp`, JSON.stringify(next));
  await rename(`${directory}/history.json.tmp`, `${directory}/history.json`);
  await writeFile(`${directory}/index.html`, renderReport(next));
  console.log(`Saved observation: ${next.snapshots.at(-1).observedAt}; 100 IDs; ${next.snapshots.length} snapshots. No sales data collected.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
