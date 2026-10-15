import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, crc32 } from 'node:zlib';
import { renderSeoPage, SITE_URL } from '../lib/seo.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const meta = (html, name) => [...html.matchAll(/<meta\b[^>]*>/g)]
  .filter(([tag]) => tag.includes(`name="${name}"`) || tag.includes(`property="${name}"`))
  .map(([tag]) => tag.match(/\bcontent="([^"]*)"/)?.[1]);

test('initial homepage HTML exposes a single versioned image for X and OGP, including upstream-failure fallback', () => {
  for (const items of [[], [{title:'確認作品', content_id:'qa_001'}]]) {
    const html = renderSeoPage(template, items);
    assert.deepEqual(meta(html, 'twitter:card'), ['summary_large_image']);
    const og = meta(html, 'og:image');
    assert.deepEqual(meta(html, 'twitter:image'), og);
    assert.equal(og.length, 1);
    const url = new URL(og[0]);
    assert.equal(url.origin, new URL(SITE_URL).origin);
    assert.equal(url.pathname, '/ogp-v2.png');
    assert.equal(url.searchParams.get('v'), '20261015');
    assert.equal(url.searchParams.size, 1);
    assert(html.indexOf('name="twitter:image"') < html.indexOf('</head>'));
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  }
});

test('the exact referenced PNG is complete, checksum-valid, and fully decompresses at its declared dimensions', () => {
  const url = new URL(meta(template, 'twitter:image')[0]);
  const png = fs.readFileSync(path.join(root, url.pathname));
  assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  assert(png.length < 5 * 1024 * 1024);
  const chunks = []; const compressed = []; let offset = 8; let width; let height;
  while (offset < png.length) {
    const size = png.readUInt32BE(offset);
    const end = offset + 12 + size;
    assert(end <= png.length, 'PNG chunk must not be truncated');
    const type = png.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(png.subarray(offset + 4, offset + 8 + size)), png.readUInt32BE(offset + 8 + size), type + ' CRC');
    chunks.push(type);
    if (type === 'IHDR') {
      width = png.readUInt32BE(offset + 8); height = png.readUInt32BE(offset + 12);
      assert.equal(png[offset + 16], 8); // Eight-bit RGB, without interlacing.
      assert.equal(png[offset + 17], 2);
      assert.equal(png[offset + 20], 0);
    }
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + size));
    offset = end;
  }
  assert.equal(chunks[0], 'IHDR'); assert.equal(chunks.at(-1), 'IEND');
  assert.equal(offset, png.length);
  assert.equal(inflateSync(Buffer.concat(compressed)).length, height * (width * 3 + 1));
  assert.equal(width, 1402); assert.equal(height, 1122);
});
