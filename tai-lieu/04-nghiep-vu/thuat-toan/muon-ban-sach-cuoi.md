# Mượn bản sách cuối

## Input
`readerId`, `copyBarcode`, thời điểm và policy version.

## Output
Loan đã tạo với due date, hoặc lỗi domain có mã ổn định.

## Invariant
Một copy có tối đa một active loan; copy chỉ chuyển sang `ON_LOAN` từ `AVAILABLE` hoặc `ON_HOLD` được gán đúng reader; loan và state/outbox cùng commit.

## Pseudo-code
```text
BEGIN
copy = SELECT ... FOR UPDATE BY barcode
assert reader active and policy allows borrowing
assert copy AVAILABLE or assigned ON_HOLD to reader
assert no active loan(copy)
create loan(dueAt = policy.calculate(now))
update copy ON_LOAN using expected version
complete matching hold if present
append audit and outbox COPY_BORROWED
COMMIT
```

## Edge cases
Barcode lạ; reader bị khóa/nợ quá hạn; hold thuộc người khác; copy hỏng/mất; retry sau timeout; giờ đóng cửa ảnh hưởng due date.

## Concurrency concerns
Hai quầy quét cùng copy: row lock hoặc optimistic CAS chỉ cho một transaction thắng. Idempotency key trả lại cùng kết quả cho retry hợp lệ.

## Test scenarios
Mượn available; nhận đúng hold; hai request song song; stale version; reader vượt quota; rollback không để loan/outbox mồ côi.
