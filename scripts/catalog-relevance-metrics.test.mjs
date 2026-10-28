import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreCase, summarize } from './catalog-relevance-metrics.mjs';

test('điểm đo dùng vị trí tựa mục tiêu, kể cả không xuất hiện trong top 5', () => {
  const first = scoreCase([{ title: 'A' }, { title: 'B' }], 'A');
  const second = scoreCase([{ title: 'A' }, { title: 'B' }], 'B');
  const missing = scoreCase([{ title: 'A' }, { title: 'B' }], 'C');
  assert.equal(first.rank, 1);
  assert.equal(second.rank, 2);
  assert.equal(missing.rank, 0);
  const total = summarize([first, second, missing]);
  assert.equal(total.hits, 2);
  assert.equal(total.count, 3);
  assert.equal(total.mrr, 0.5);
  assert.ok(Math.abs(total.ndcg - (1 + 1 / Math.log2(3)) / 3) < 1e-12);
});
