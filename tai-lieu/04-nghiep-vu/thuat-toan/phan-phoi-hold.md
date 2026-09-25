# Phân phối hold

## Input
Copy vừa khả dụng, queue hold cùng Book, branch/edition preference, policy và thời điểm.

## Output
Một assignment `READY` có deadline, hoặc copy vẫn `AVAILABLE`.

## Invariant
Một copy có tối đa một active assignment; một hold không nhận hai copy; chỉ hold `WAITING` hợp lệ được chọn; thứ tự deterministic và audit được.

## Pseudo-code
```text
candidates = waiting holds compatible with copy
             ordered by policyPriority, queuedAt, id
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
Claim dùng transaction/unique constraint; nhiều worker phải skip locked hoặc compare-and-set. Expiry worker và pickup command tranh chấp bằng version.

## Test scenarios
FIFO; tie-break; skip user không hợp lệ; hai copy/two workers; expire chuyển người kế; retry consumer không gửi hai thông báo.
