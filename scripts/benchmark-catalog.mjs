import { performance } from 'node:perf_hooks';

const base = process.argv[2] ?? 'http://127.0.0.1:8080';
if (!/^http:\/\/(127\.0\.0\.1|localhost):8080$/u.test(base)) {
  throw new Error('Chỉ đo Core API local trên cổng 8080.');
}
const query = (path, values) => `${path}?${new URLSearchParams(values)}`;
const books = values => query('/api/v1/public/catalog/books', { size: '20', ...values });
const cases = [
  ['trang đầu A-Z', [books({ sort: 'title' })]],
  ['trang 100 A-Z', [books({ page: '100', sort: 'title' })]],
  ['tên đầy đủ', [books({ query: "Alice's Adventures in Wonderland", sort: 'relevance' })]],
  ['tiền tố tên', [books({ query: "Alice's Adventures", sort: 'relevance' })]],
  ['tên gần đúng', [books({ query: 'Alices Adventurs', sort: 'relevance' })]],
  ['tác giả', [books({ query: 'Lewis Carroll', sort: 'relevance' })]],
  ['bí danh thể loại', [books({ categoryTerm: 'Khoa học giả tưởng', sort: 'title' })]],
  ['từ khóa và thể loại', [books({ query: 'adventures', categoryTerm: 'Novels', sort: 'relevance' })]],
  ['không có kết quả', [books({ query: 'zzzzcatalogkhongcosach2026', sort: 'relevance' })]],
  ['gợi ý Book/Author/Category', [
    books({ query: 'alice', size: '4', sort: 'relevance' }),
    query('/api/v1/public/catalog/authors', { query: 'alice', size: '4' }),
    query('/api/v1/public/catalog/categories', { query: 'alice', size: '4' }),
  ]],
];

async function sample(paths) {
  const start = performance.now();
  const totals = await Promise.all(paths.map(async path => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.items) || body.items.length > 20) throw new Error('Trang Catalog không hợp lệ.');
    return body.page.totalElements;
  }));
  return { ms: performance.now() - start, totals };
}

const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
for (const [label, paths] of cases) {
  await sample(paths);
  const durations = [];
  let totals;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await sample(paths);
    durations.push(result.ms);
    totals = result.totals;
  }
  durations.sort((a, b) => a - b);
  process.stdout.write(`${label}: total=${totals.join('/')} p50=${percentile(durations, .5).toFixed(1)} ms `
    + `p95=${percentile(durations, .95).toFixed(1)} ms max=${durations.at(-1).toFixed(1)} ms\n`);
}
