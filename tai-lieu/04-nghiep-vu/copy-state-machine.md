# Copy State Machine

## Mục đích

Chuẩn hóa trạng thái bản vật lý; transition là nghiệp vụ có audit, không phải cập nhật chuỗi tùy ý.

```mermaid
stateDiagram-v2
  [*] --> IN_PROCESS
  IN_PROCESS --> AVAILABLE: nhập kho + định vị
  AVAILABLE --> ON_LOAN: mượn thành công
  AVAILABLE --> ON_HOLD: phân bổ hold
  ON_HOLD --> ON_LOAN: người giữ nhận sách
  ON_HOLD --> AVAILABLE: hết hạn / hủy, không còn queue
  ON_LOAN --> AVAILABLE: trả và không có hold
  ON_LOAN --> ON_HOLD: trả và phân bổ hold
  AVAILABLE --> LOST: xác nhận mất
  ON_LOAN --> LOST: xử lý mất
  AVAILABLE --> DAMAGED: phát hiện hỏng
  ON_LOAN --> DAMAGED: trả sách hỏng
  DAMAGED --> IN_PROCESS: đưa đi xử lý
  LOST --> IN_PROCESS: tìm lại
  IN_PROCESS --> WITHDRAWN: thanh lý
  DAMAGED --> WITHDRAWN: không thể phục hồi
```

`WITHDRAWN` là terminal theo vận hành thông thường. Mọi transition cần actor/reason/version. `ON_HOLD` phải tham chiếu hold assignment còn hiệu lực; `ON_LOAN` phải có đúng một active loan.
