import { performance } from 'node:perf_hooks';

const base = process.argv[2] ?? 'http://127.0.0.1:8080';
if (!/^http:\/\/(127\.0\.0\.1|localhost):8080$/u.test(base)) {
  throw new Error('Chỉ đo Core API local trên cổng 8080.');
}
const requests = [
  ['trang đầu A-Z', '/api/v1/public/catalog/books?size=20&sort=title'],
  ['trang 100 A-Z', '/api/v1/public/catalog/books?size=20&page=100&sort=title'],
  ['tìm theo tên', '/api/v1/public/catalog/books?query=adventures&size=20&sort=relevance'],
  ['tìm và lọc thể loại', '/api/v1/public/catalog/books?query=adventures&categoryTerm=Novels&size=20&sort=relevance'],
];
const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
for (const [label, path] of requests) {
  const durations = [];
  let total = -1;
  for (let attempt = 0; attempt < 21; attempt++) {
    const start = performance.now();
    const response = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    if (attempt) durations.push(performance.now() - start);
    total = body.page.totalElements;
    if (body.items.length > 20) throw new Error('API trả quá 20 Book trên một trang.');
  }
  durations.sort((a, b) => a - b);
  process.stdout.write(`${label}: total=${total}, median=${percentile(durations, .5).toFixed(1)} ms, p95=${percentile(durations, .95).toFixed(1)} ms, max=${durations.at(-1).toFixed(1)} ms\n`);
}
