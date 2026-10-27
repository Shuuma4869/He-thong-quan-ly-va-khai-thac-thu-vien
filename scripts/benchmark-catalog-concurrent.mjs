import { performance } from 'node:perf_hooks';

const url = 'http://127.0.0.1:8080/api/v1/public/catalog/books?query=adventures&sort=relevance&size=20';
const times = [];
const waves = [];
for (let wave = 0; wave < 20; wave++) {
  const start = performance.now();
  const results = await Promise.all(Array.from({ length: 4 }, async () => {
    const requestStart = performance.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}; đợi rate-limit reset rồi chạy lại.`);
    const body = await response.json();
    if (body.page.totalElements < 1) throw new Error('Không có bộ dữ liệu demo để đo.');
    return performance.now() - requestStart;
  }));
  times.push(...results);
  waves.push(performance.now() - start);
}
const percentile = (values, fraction) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1].toFixed(1);
process.stdout.write(`4 request song song × 20 lượt: request p50=${percentile(times, .5)} ms, `
  + `p95=${percentile(times, .95)} ms; lượt p50=${percentile(waves, .5)} ms, `
  + `p95=${percentile(waves, .95)} ms\n`);
