const base = 'http://127.0.0.1:8080/api/v1/public/catalog/books';
// Ba câu hỏi mẫu được chọn trước khi xem kết quả; đây không phải tập đánh giá toàn Catalog.
const target = "Alice's Adventures in Wonderland";
const cases = [
  ['tên đầy đủ', target],
  ['tiền tố', "Alice's Adventures"],
  ['gõ gần đúng', 'Alices Adventurs'],
];
let hit = 0;
let reciprocalRank = 0;
for (const [name, query] of cases) {
  const url = new URL(base);
  url.search = new URLSearchParams({ query, sort: 'relevance', size: '5' }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const page = await response.json();
  const rank = page.items.findIndex(item => item.title === target) + 1;
  if (rank) { hit++; reciprocalRank += 1 / rank; }
  process.stdout.write(`${name}: vị trí ${rank || 'ngoài top 5'}\n`);
}
process.stdout.write(`Hit@5=${hit}/${cases.length}; MRR=${(reciprocalRank / cases.length).toFixed(3)}\n`);
