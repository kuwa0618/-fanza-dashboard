import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromResponse, appendSnapshot, comparisons, renderReport, capture } from '../scripts/catalog-order-history.mjs';

function responseData() {
  return { success: true, firstPosition: 1, resultCount: 100,
    products: Array.from({length: 100}, (_, i) => ({content_id: `item_${i}`, catalogRank: i + 1, title: 'Not retained', affiliateURL: 'Not retained'})) };
}
const snapshot = time => snapshotFromResponse(responseData(), time);
const empty = () => ({version: 1, snapshots: []});

test('keeps upstream order and only IDs/positions, rejects partial and duplicate observations', () => {
  const s = snapshot('2026-11-14T00:00:00Z');
  assert.deepEqual(s.rows[0], {id: 'item_0', rank: 1});
  assert.equal(JSON.stringify(s).includes('Not retained'), false);
  const data = responseData(); data.products[0].catalogRank = 2;
  assert.throws(() => snapshotFromResponse(data, s.observedAt));
  data.products[0].catalogRank = 1; data.products[1].content_id = data.products[0].content_id;
  assert.throws(() => snapshotFromResponse(data, s.observedAt));
  assert.throws(() => snapshotFromResponse({...responseData(), resultCount: 99}, s.observedAt));
});

test('compares actual movement and distinguishes entrants from rises', () => {
  const a = snapshot('2026-11-13T00:00:00Z');
  const b = snapshot('2026-11-14T00:00:00Z');
  b.rows[0].id = 'new_item'; b.rows[1].id = 'item_0';
  const result = comparisons({version: 1, snapshots: [a, b]})[1].comparison;
  assert.equal(result.rows[0].change, null);
  assert.equal(result.rows[1].change, -1);
  assert.deepEqual(result.outsideCurrent, ['item_1']);
});

test('does not label six-hour history as a 24-hour or monthly comparison', () => {
  const history = {version: 1, snapshots: [snapshot('2026-11-13T18:00:00Z'), snapshot('2026-11-14T00:00:00Z')]};
  assert.ok(comparisons(history)[0].comparison);
  assert.equal(comparisons(history)[1].comparison, null);
  assert.equal(comparisons(history)[3].comparison, null);
});

test('rejects future/duplicate captures and trims records older than 35 days', () => {
  const history = {version: 1, snapshots: [snapshot('2026-10-01T00:00:00Z')]};
  assert.equal(appendSnapshot(history, snapshot('2026-11-14T00:00:00Z')).snapshots.length, 1);
  assert.throws(() => appendSnapshot(history, snapshot('2026-10-01T01:00:00Z')));
});

test('uses one bounded request; failure and malformed data leave history unchanged', async () => {
  let calls = 0;
  const history = empty();
  const next = await capture(history, {now: () => '2026-11-14T00:00:00Z', fetchImpl: async url => {
    calls++; assert.equal(new URL(url).searchParams.get('hits'), '100');
    return Response.json(responseData());
  }});
  assert.equal(calls, 1); assert.equal(next.snapshots.length, 1); assert.deepEqual(history, empty());
  await assert.rejects(capture(next, {now: () => '2026-11-14T01:00:00Z', fetchImpl: () => { throw new Error('must not call'); }}), /budget/);
  await assert.rejects(capture(history, {fetchImpl: async () => new Response('bad', {status: 503})}), /503/);
  await assert.rejects(capture(history, {fetchImpl: async () => Response.json(responseData(), {headers:{age:'301'}})}), /too old/);
  await assert.rejects(capture(history, {fetchImpl: async () => new Response('bad')}), /invalid JSON/);
  assert.deepEqual(history, empty());
});

test('report exposes no product images/links, identifies stale and missing history', () => {
  const html = renderReport({version: 1, snapshots: [snapshot('2026-11-13T00:00:00Z')]}, '2026-11-14T00:00:00Z');
  assert.match(html, /12時間以上/); assert.match(html, /比較用の記録がまだありません/);
  assert.doesNotMatch(html, /<img|<script|affiliateURL|Not retained/);
});
