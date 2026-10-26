import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { authorNames, bookshelfNames, csvRows } from './gutenberg-csv.mjs';

test('CSV giữ đúng dấu nháy, Unicode và xuống dòng trong nhan đề', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lams-csv-'));
  try {
    const file = join(dir, 'feed.csv.gz');
    writeFileSync(file, gzipSync('A,B\r\n1,"Cuốn ""sách""\r\nđầu"\r\n2,Khác\r\n'));
    const rows = [];
    for await (const row of csvRows(file)) rows.push(row);
    assert.deepEqual(rows, [['A', 'B'], ['1', 'Cuốn "sách"\r\nđầu'], ['2', 'Khác']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('người minh họa không bị nhập thành tác giả', () => {
  assert.deepEqual(authorNames('Carroll, Lewis, 1832-1898; Tenniel, John, 1820-1914 [Illustrator]'),
    ['Lewis Carroll']);
  assert.deepEqual(bookshelfNames('Category: Novels; Category: Category: Adventure; Best Books Ever Listings'),
    ['Novels', 'Adventure']);
});
