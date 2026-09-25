# Kiểm kê phát hiện bất thường

## Input
Session scope/snapshot và chuỗi scan `{barcode, shelf, position, scannedAt, actor}`.

## Output
Matched scans và anomaly `UNKNOWN`, `MISSHELVED`, `STATUS_MISMATCH`, `MISSING`, `DUPLICATE_SCAN` với evidence.

## Invariant
Scan gốc append-only; một anomaly có evidence và lifecycle; kết quả luôn gắn snapshot/session, không sửa catalog ngầm.

## Pseudo-code
```text
for scan in orderedScans:
  if barcode unknown -> UNKNOWN
  else if already scanned -> DUPLICATE_SCAN
  else compare expected shelf/status/order -> matched or anomaly
after scanning:
  for expected copy not scanned -> MISSING candidate
review; resolve by explicit commands; finish summary
```

## Edge cases
Copy đang được mượn giữa session; chuyển kệ hợp lệ sau snapshot; offline device gửi trễ; barcode hỏng; scan ngoài scope.

## Concurrency concerns
Session cần cutoff/snapshot semantics. Mỗi scan có client-generated ID để idempotent; resolution kiểm version hiện tại trước khi sửa copy.

## Test scenarios
Kệ khớp; misshelved; duplicate; concurrent loan; scan replay; session đóng từ chối scan mới; missing chỉ sinh sau finalize.
