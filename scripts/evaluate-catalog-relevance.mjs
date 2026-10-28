import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreCase, summarize } from './catalog-relevance-metrics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] ?? 'http://127.0.0.1:8080';
if (!/^http:\/\/(127\.0\.0\.1|localhost):8080$/u.test(base)) {
  throw new Error('Chỉ đánh giá Core API local trên cổng 8080.');
}

const fixture = JSON.parse(readFileSync(join(root, 'data/catalog/relevance-cases.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'data/catalog/project-gutenberg-novels-10000.manifest.json'), 'utf8'));
const snapshot = readFileSync(join(root, 'data/catalog/project-gutenberg-novels-10000.jsonl.gz'));
const checksum = createHash('sha256').update(snapshot).digest('hex');
if (fixture.snapshotSha256 !== manifest.snapshotSha256 || checksum !== manifest.snapshotSha256) {
  throw new Error('Bộ câu hỏi không khớp snapshot Gutenberg trong repository.');
}
const bySourceId = new Map(gunzipSync(snapshot).toString('utf8').trimEnd().split('\n')
  .map(line => JSON.parse(line)).map(row => [row.sourceId, row]));
if (bySourceId.size !== manifest.stats.selected) throw new Error('Số Book nguồn khác manifest.');
for (const item of fixture.cases) {
  const source = bySourceId.get(item.sourceId);
  if (!source || source.title !== item.targetTitle) {
    throw new Error(`Câu hỏi ${item.name} không khớp bản ghi nguồn ${item.sourceId}.`);
  }
}

const results = [];
for (const item of fixture.cases) {
  const url = new URL('/api/v1/public/catalog/books', base);
  url.search = new URLSearchParams({ query: item.query, sort: 'relevance', size: '5' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${item.name}: HTTP ${response.status}`);
  const page = await response.json();
  if (!Array.isArray(page.items) || page.items.length > 5) {
    throw new Error(`${item.name}: trang Catalog không hợp lệ.`);
  }
  const result = scoreCase(page.items, item.targetTitle);
  results.push(result);
  process.stdout.write(`${item.name}: vị trí ${result.rank || 'ngoài top 5'}\n`);
}
const total = summarize(results);
process.stdout.write(`Snapshot=${checksum}; câu hỏi=${fixture.cases.length}; `
  + `Hit@5=${total.hits}/${total.count}; MRR=${total.mrr.toFixed(3)}; `
  + `nDCG@5=${total.ndcg.toFixed(3)}\n`);
process.stdout.write('Mỗi câu chỉ có một tựa mục tiêu; đây không phải Precision@5 hoặc đánh giá toàn bộ kết quả liên quan.\n');
