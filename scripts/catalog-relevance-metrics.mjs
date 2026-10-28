export function scoreCase(items, targetTitle) {
  const index = items.findIndex(item => item.title === targetTitle);
  const rank = index < 0 ? 0 : index + 1;
  return { rank, hit: Number(rank > 0), reciprocalRank: rank ? 1 / rank : 0,
    normalizedDiscountedGain: rank ? 1 / Math.log2(rank + 1) : 0 };
}

export function summarize(results) {
  if (results.length === 0) throw new Error('Cần ít nhất một câu hỏi đánh giá.');
  return {
    count: results.length,
    hits: results.reduce((sum, result) => sum + result.hit, 0),
    mrr: results.reduce((sum, result) => sum + result.reciprocalRank, 0) / results.length,
    ndcg: results.reduce((sum, result) => sum + result.normalizedDiscountedGain, 0) / results.length,
  };
}
