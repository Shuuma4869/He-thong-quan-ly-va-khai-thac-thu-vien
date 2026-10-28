import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';

test('bộ câu hỏi gắn với đúng snapshot Gutenberg đã lưu', () => {
  const fixture = JSON.parse(readFileSync('data/catalog/relevance-cases.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('data/catalog/project-gutenberg-novels-10000.manifest.json', 'utf8'));
  const bytes = readFileSync('data/catalog/project-gutenberg-novels-10000.jsonl.gz');
  assert.equal(fixture.snapshotSha256, manifest.snapshotSha256);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.snapshotSha256);
  const source = new Map(gunzipSync(bytes).toString('utf8').trimEnd().split('\n')
    .map(line => JSON.parse(line)).map(row => [row.sourceId, row.title]));
  assert.equal(source.size, manifest.stats.selected);
  assert.ok(fixture.cases.length >= 20);
  const names = new Set();
  for (const item of fixture.cases) {
    assert.equal(source.get(item.sourceId), item.targetTitle, item.name);
    assert.ok(item.query.trim().length >= 3, item.name);
    assert.ok(!names.has(item.name), item.name);
    names.add(item.name);
  }
});
