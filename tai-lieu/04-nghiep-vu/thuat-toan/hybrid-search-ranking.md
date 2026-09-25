# Hybrid search ranking

## Input
Query đã normalize, filters, locale, candidate từ FTS/trigram/vector và availability projection.

## Output
Trang kết quả có score, reason code nội bộ và recovery suggestion nếu zero-result.

## Invariant
Filter quyền/visibility áp dụng trước trả kết quả; cùng index/ranking version cho kết quả deterministic; không để popularity xóa relevance.

## Pseudo-code
```text
lexical = FTS(query)
fuzzy = trigram(query) when needed
semantic = vector(query) when enabled
candidates = reciprocalRankFusion(lexical, fuzzy, semantic)
score = relevance + boundedAvailabilityBoost + boundedQualityBoost
filter; stableSort(score, bookId); paginate
if empty -> suggest spelling / relax one filter / emit zero-result
```

## Edge cases
Query rỗng; tiếng Việt có/không dấu; ISBN; typo ngắn; filter loại hết kết quả; book chưa có vector; index lag.

## Concurrency concerns
Index update idempotent theo aggregate version; pagination dùng stable cursor nếu dữ liệu đổi nhanh. Không đọc nửa document khi reindex.

## Test scenarios
Exact title thắng fuzzy; ISBN exact; không dấu; deterministic tie; stale event bị bỏ; zero-result recovery; permission filter.
