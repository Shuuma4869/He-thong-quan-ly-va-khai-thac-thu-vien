# Kiểm kê phát hiện bất thường

## Input
Session scope/snapshot và chuỗi scan `{barcode, shelf, receivedAt, actor}`. `clientScannedAt` chỉ là dấu vết tùy chọn.

## Output
Sáu loại đã chốt ngày 24/10/2026: `WRONG_SHELF`, `EXPECTED_BUT_MISSING`, `STATUS_MISMATCH`, `WRONG_BRANCH`, `UNKNOWN_BARCODE`, `DUPLICATE_SCAN`, kèm snapshot/current/scan làm bằng chứng. `AnomalyDetector` là hàm đối chiếu thuần; Core đã nối hàm này với phiên, scan, quyết định rà soát và giao diện nhân viên. Xem [luồng kiểm kê](../kiem-ke-ke-sach.md).

## Invariant
Scan gốc append-only; một anomaly có evidence và lifecycle; kết quả luôn gắn snapshot/session, không sửa catalog ngầm.

## Pseudo-code
```text
deduplicate identical scan IDs; reject same ID with different payload
sort scans by server receivedAt, then ID
for scan in orderedScans:
  if current barcode unknown -> UNKNOWN_BARCODE
  else:
    if copy already seen -> DUPLICATE_SCAN with first scan ID
    compare branch, then shelf -> WRONG_BRANCH or WRONG_SHELF
    compare snapshot/current status and physical presence -> STATUS_MISMATCH
after scanning:
  for expected physical copy not scanned -> EXPECTED_BUT_MISSING candidate
review; resolve by explicit commands; finish summary
```

## Edge cases
Copy đang được mượn giữa session; chuyển kệ hợp lệ sau snapshot; offline device gửi trễ; barcode hỏng; scan ngoài scope.

Bản kỳ vọng có mặt trên kệ ở snapshot là AVAILABLE/IN_PROCESS/DAMAGED; ON_LOAN/ON_HOLD/LOST/WITHDRAWN không sinh thiếu sách chỉ vì không quét thấy. Nếu được quét thấy các trạng thái này, sinh STATUS_MISMATCH để nhân viên kiểm tra, không tự kết luận trạng thái database sai. Bản AVAILABLE tại snapshot nhưng đã ON_LOAN lúc chốt vẫn có thể là candidate thiếu; evidence giữ cả hai version để nhân viên xác nhận đây là biến động hợp lệ. Sai chi nhánh không đồng thời sinh sai kệ cho cùng scan. Quét lại bằng ID mới là lượt quét vật lý trùng, khác với gửi lại cùng ID do mất mạng.

ID anomaly xác định từ session/type/scan (hoặc Copy khi thiếu), nên đối chiếu lại cùng tập bằng chứng không tạo identity mới. Hàm không sửa input/database. API xác thực nhân viên ACTIVE, giới hạn scan mỗi phiên, lấy current từ Core, kiểm scope và lưu nguyên bản scan; không tin metadata Copy do client gửi. Barcode đã đổi sau snapshot được xét theo barcode hiện hành, không tự ghép sang Copy khác từ mã cũ.

## Concurrency concerns
Session cần cutoff/snapshot semantics. Mỗi scan có client-generated ID để idempotent; resolution kiểm version hiện tại trước khi sửa copy.

## Test scenarios
Kệ khớp; misshelved; duplicate; concurrent loan; scan replay; session đóng từ chối scan mới; missing chỉ sinh sau finalize.
