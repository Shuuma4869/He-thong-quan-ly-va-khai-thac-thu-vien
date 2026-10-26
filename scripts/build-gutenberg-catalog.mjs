import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { authorNames, bookshelfNames, csvRows, tidy, titleKey } from './gutenberg-csv.mjs';

const source = process.argv[2];
const output = process.argv[3];
const manifestPath = process.argv[4];
if (!source || !output || !manifestPath) {
  throw new Error('Dùng: node scripts/build-gutenberg-catalog.mjs <pg_catalog.csv.gz> <snapshot.jsonl.gz> <manifest.json>');
}

const sourceSha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
const selected = [];
const seen = new Set();
const stats = { sourceRows: 0, textEnglish: 0, novelCandidates: 0, duplicateTitleAuthor: 0,
  missingOrInvalidMetadata: 0, selected: 0 };
let header;
for await (const cells of csvRows(source)) {
  if (!header) {
    header = cells.map(value => value.replace(/^\uFEFF/u, ''));
    const expected = ['Text#', 'Type', 'Issued', 'Title', 'Language', 'Authors', 'Subjects', 'LoCC', 'Bookshelves'];
    if (JSON.stringify(header) !== JSON.stringify(expected)) throw new Error('Định dạng catalog Gutenberg đã thay đổi.');
    continue;
  }
  stats.sourceRows++;
  if (cells.length !== header.length) { stats.missingOrInvalidMetadata++; continue; }
  const row = Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  if (row.Type !== 'Text' || row.Language !== 'en') continue;
  stats.textEnglish++;
  const shelves = bookshelfNames(row.Bookshelves);
  if (!shelves.includes('Novels')) continue;
  stats.novelCandidates++;
  const title = tidy(row.Title);
  const authors = authorNames(row.Authors);
  if (!/^\d+$/u.test(row['Text#']) || !title || title.length > 250 || authors.length === 0) {
    stats.missingOrInvalidMetadata++;
    continue;
  }
  const key = `${title.toLocaleLowerCase('en')}\u0000${authors.map(value => value.toLocaleLowerCase('en')).sort().join(';')}`;
  if (seen.has(key)) { stats.duplicateTitleAuthor++; continue; }
  seen.add(key);
  if (selected.length >= 10_000) continue;
  const categories = ['Novels', ...shelves.filter(value => value !== 'Novels')].slice(0, 5);
  selected.push({ sourceId: row['Text#'], title, normalizedTitle: titleKey(title), authors, categories, language: 'en',
    ebookReleased: /^\d{4}-\d{2}-\d{2}$/u.test(row.Issued) ? row.Issued : null,
    sourceAuthors: tidy(row.Authors), sourceUrl: `https://www.gutenberg.org/ebooks/${row['Text#']}` });
}
stats.selected = selected.length;
if (selected.length !== 10_000) throw new Error(`Chỉ chọn được ${selected.length} bản ghi hợp lệ.`);
const bytes = gzipSync(selected.map(row => JSON.stringify(row)).join('\n') + '\n', { mtime: 0 });
writeFileSync(output, bytes);
const manifest = {
  source: 'Project Gutenberg weekly catalog',
  sourceUrl: 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz',
  sourceDownloaded: '2026-10-26',
  sourceSha256,
  snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  selection: '10.000 bản ghi Text tiếng Anh thuộc Bookshelf Novels đầu tiên, sau chuẩn hóa tên/tác giả và loại trùng trong feed',
  rights: 'https://www.gutenberg.org/ebooks/offline_catalogs.html',
  notes: 'Issued là ngày phát hành ebook Gutenberg, không phải năm xuất bản bản in. Không có ISBN, Publisher hoặc số Copy từ nguồn này.',
  stats,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
