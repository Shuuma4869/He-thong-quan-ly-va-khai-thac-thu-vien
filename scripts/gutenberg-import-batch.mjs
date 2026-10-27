import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [snapshotPath, manifestPath, indexRaw, batchSizeRaw] = process.argv.slice(2);
const index = Number(indexRaw);
const batchSize = Number(batchSizeRaw);
if (!snapshotPath || !manifestPath || !Number.isInteger(index) || index < 0
    || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
  throw new Error('Dùng: node scripts/gutenberg-import-batch.mjs <snapshot.gz> <manifest.json> <batchIndex> <batchSize 1..1000>');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bytes = readFileSync(snapshotPath);
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== manifest.snapshotSha256 || !/^[0-9a-f]{64}$/u.test(sha)) {
  throw new Error('SHA-256 snapshot không khớp manifest.');
}
const rows = gunzipSync(bytes).toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
if (rows.length !== manifest.stats.selected) throw new Error('Số bản ghi snapshot không khớp manifest.');
const batch = rows.slice(index * batchSize, (index + 1) * batchSize);
if (batch.length === 0) throw new Error('Batch không có bản ghi.');
for (const row of batch) {
  if (!/^\d+$/u.test(row.sourceId) || row.sourceUrl !== `https://www.gutenberg.org/ebooks/${row.sourceId}`
      || !row.title || !row.normalizedTitle || !Array.isArray(row.authors) || row.authors.length === 0
      || !Array.isArray(row.categories) || row.categories.length === 0) {
    throw new Error(`Bản ghi nguồn không hợp lệ: ${row.sourceId}`);
  }
}
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const deterministicUuid = expression => `overlay(overlay(md5(${expression}) placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid`;
const sql = [
  'BEGIN;',
  'CREATE TEMP TABLE pg_import_stage(payload JSONB NOT NULL) ON COMMIT DROP;',
  'COPY pg_import_stage(payload) FROM STDIN WITH (FORMAT csv);',
  ...batch.map(row => csv(JSON.stringify(row))),
  '\\.',
  `CREATE TEMP VIEW pg_candidates AS
   SELECT payload->>'sourceId' AS source_id,
          ${deterministicUuid("'gutenberg:book:' || (payload->>'sourceId')")} AS book_id,
          payload->>'title' AS title,
          payload->>'normalizedTitle' AS normalized_title,
          payload->'authors' AS authors,
          payload->'categories' AS categories,
          payload->>'sourceUrl' AS source_url,
          payload->>'sourceAuthors' AS source_authors,
          NULLIF(payload->>'ebookReleased','')::date AS ebook_released
   FROM pg_import_stage;`,
  `INSERT INTO authors(id,name)
   SELECT DISTINCT ${deterministicUuid("'gutenberg:author:' || x.name")}, x.name
   FROM pg_candidates s CROSS JOIN LATERAL jsonb_array_elements_text(s.authors) AS x(name)
   WHERE NOT EXISTS (SELECT 1 FROM authors a WHERE lower(a.name)=lower(x.name))
   ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO categories(id,name,normalized_name)
   SELECT DISTINCT ${deterministicUuid("'gutenberg:category:' || lower(x.name)")}, x.name, lower(x.name)
   FROM pg_candidates s CROSS JOIN LATERAL jsonb_array_elements_text(s.categories) AS x(name)
   WHERE NOT EXISTS (SELECT 1 FROM category_aliases a WHERE a.normalized_alias=lower(x.name))
   ON CONFLICT(normalized_name) DO NOTHING;`,
  `INSERT INTO books(id,title,normalized_title)
   SELECT s.book_id,s.title,s.normalized_title FROM pg_candidates s
   WHERE NOT EXISTS (SELECT 1 FROM catalog_external_sources p
                     WHERE p.source_code='PROJECT_GUTENBERG' AND p.source_record_id=s.source_id)
     AND NOT EXISTS (
       SELECT 1 FROM books b JOIN book_authors ba ON ba.book_id=b.id
       JOIN authors a ON a.id=ba.author_id
       WHERE b.normalized_title=s.normalized_title AND lower(a.name)=lower(s.authors->>0))
   ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO book_authors(book_id,author_id)
   SELECT s.book_id,a.id FROM pg_candidates s
   CROSS JOIN LATERAL jsonb_array_elements_text(s.authors) AS x(name)
   CROSS JOIN LATERAL (SELECT id FROM authors WHERE lower(name)=lower(x.name) ORDER BY id LIMIT 1) a
   JOIN books b ON b.id=s.book_id AND b.normalized_title=s.normalized_title
   ON CONFLICT DO NOTHING;`,
  `INSERT INTO book_categories(book_id,category_id)
   SELECT s.book_id,c.id FROM pg_candidates s
   CROSS JOIN LATERAL jsonb_array_elements_text(s.categories) AS x(name)
   JOIN categories c ON c.normalized_name=lower(x.name)
   JOIN books b ON b.id=s.book_id AND b.normalized_title=s.normalized_title
   ON CONFLICT DO NOTHING;`,
  `INSERT INTO catalog_external_sources(source_code,source_record_id,book_id,source_url,
     source_snapshot_sha256,source_title,source_authors,ebook_released_on)
   SELECT 'PROJECT_GUTENBERG',s.source_id,b.id,s.source_url,
     '${sha}',s.title,s.source_authors,s.ebook_released
   FROM pg_candidates s JOIN LATERAL (
     SELECT b.id FROM books b JOIN book_authors ba ON ba.book_id=b.id
     JOIN authors a ON a.id=ba.author_id
     WHERE b.normalized_title=s.normalized_title AND lower(a.name)=lower(s.authors->>0)
     ORDER BY (b.id=s.book_id) DESC,b.id LIMIT 1
   ) b ON true
   ON CONFLICT(source_code,source_record_id) DO NOTHING;`,
  'COMMIT;',
  `SELECT 'mapped_total',count(*) FROM catalog_external_sources
   WHERE source_code='PROJECT_GUTENBERG' AND source_snapshot_sha256='${sha}';`,
];
process.stdout.write(sql.join('\n') + '\n');
