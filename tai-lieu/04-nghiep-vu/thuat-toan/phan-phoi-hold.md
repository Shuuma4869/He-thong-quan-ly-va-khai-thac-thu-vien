# Phân phối hold

Đã có backend `HoldAllocationService`, `HoldService`, `HoldExpiryJob` và migration V18. Giao diện, ETA theo ngày và consumer thông báo chưa hoàn thành. Xem [transaction, policy và giới hạn](../../02-kien-truc/circulation.md).

## Input
Copy vừa khả dụng, queue hold cùng Book, branch/edition preference, policy và thời điểm.

## Output
Một assignment `READY` có deadline, hoặc copy vẫn `AVAILABLE`.

## Invariant
Một copy có tối đa một active assignment; một hold không nhận hai copy; chỉ hold `WAITING` hợp lệ được chọn; thứ tự deterministic và audit được.

## Pseudo-code
```text
candidates = waiting holds compatible with copy
             ordered by queuedAt, id
for hold in candidates:
  if reader remains eligible and atomicClaim(copy, hold):
    set hold READY; set copy ON_HOLD; calculate pickup TTL
    append HOLD_READY outbox
    return assignment
return AVAILABLE
```

## Edge cases
Hold bị hủy trong lúc chọn; reader đạt quota; pickup deadline rơi vào ngày đóng cửa; alternative edition không được chấp thuận; queue rỗng.

## Concurrency concerns
Command và worker khóa Book bằng advisory transaction rồi khóa Copy; unique index là lớp bảo vệ bổ sung. Không dùng SKIP LOCKED để tránh bỏ qua thứ tự hàng chờ trong cùng Book. Expiry/pickup/cancel dùng cùng khóa Book và kiểm lại status/version/deadline. Khóa Book của các đầu sách khác nhau độc lập.

## Test scenarios
`HoldIntegrationTest`: FIFO/tie-break, Edition/Branch, bỏ qua người không đủ điều kiện, hai Copy trả đồng thời, cancel/return, hết hạn chuyển người kế, worker lặp và rollback. `HoldExpiryJobTest`: con trỏ lô 100 Book và retry sau lỗi. Retry consumer/thông báo chưa có kiểm thử vì consumer chưa triển khai.
