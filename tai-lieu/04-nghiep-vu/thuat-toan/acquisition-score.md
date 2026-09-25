# Acquisition score

## Input
Tín hiệu theo cửa sổ: hold pressure, unavailable views, zero-result cluster, circulation velocity, favorites; inventory/order/budget guardrails.

## Output
Score chuẩn hóa, confidence, component contribution và lời giải thích cho mỗi đề xuất.

## Invariant
Không tự mua; score tái lập theo data/rule version; không đếm lặp cùng event; thành phần luôn bị chặn biên.

## Pseudo-code
```text
signals = deduplicateAndAggregate(window)
components = normalizeEach(signals, cohort)
score = wHold*hold + wZero*zero + wCirc*circulation
        + wUnavailable*unavailable + wFavorite*favorite
score = applyGuardrails(score, ownedCopies, openOrders, budget)
emit draft(score, confidence, topContributors, version)
```

## Edge cases
Sách mới thiếu lịch sử; bot/search spam; title trùng; zero-result không map được book; outlier mùa vụ; copy mất làm tăng giả nhu cầu.

## Concurrency concerns
Aggregation theo event ID/window idempotent; job có lease; publish recommendation bằng upsert theo `{target, window, version}`.

## Test scenarios
Hold pressure cao; tín hiệu đơn yếu; duplicate event; open order giảm score; thiếu dữ liệu hạ confidence; cùng input cho cùng output.
