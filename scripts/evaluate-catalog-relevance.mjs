const base = 'http://127.0.0.1:8080/api/v1/public/catalog/books';
// Bộ câu hỏi cố định của database demo; mỗi câu chỉ chấm một tựa đích đã biết.
const cases = [
  ['tên đầy đủ', "Alice's Adventures in Wonderland", "Alice's Adventures in Wonderland"],
  ['tiền tố', "Alice's Adventures", "Alice's Adventures in Wonderland"],
  ['gõ gần đúng', 'Alices Adventurs', "Alice's Adventures in Wonderland"],
  ['tên không dấu', 'Les Miserables', 'Les Misérables'],
  ['tên có dấu', 'Les Misérables', 'Les Misérables'],
  ['theo tác giả', 'Bram Stoker', 'Dracula'],
];
let hit = 0;
let reciprocalRank = 0;
let discountedGain = 0;
for (const [name, query, target] of cases) {
  const url = new URL(base);
  url.search = new URLSearchParams({ query, sort: 'relevance', size: '5' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const page = await response.json();
  const rank = page.items.findIndex(item => item.title === target) + 1;
  if (rank) { hit++; reciprocalRank += 1 / rank; discountedGain += 1 / Math.log2(rank + 1); }
  process.stdout.write(`${name}: vị trí ${rank || 'ngoài top 5'}\n`);
}
process.stdout.write(`Hit@5=${hit}/${cases.length}; MRR=${(reciprocalRank / cases.length).toFixed(3)}; `
  + `nDCG@5=${(discountedGain / cases.length).toFixed(3)}\n`);
if (hit !== cases.length) process.exitCode = 1;
