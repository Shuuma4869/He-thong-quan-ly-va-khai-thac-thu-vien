# Workflow đề xuất bổ sung sách

## Mục đích

Tạo đề xuất mua thêm có evidence, không tự động đặt mua.

```mermaid
flowchart LR
  H[Hold pressure] --> D[Chuẩn hóa demand signals]
  U[Unavailable views] --> D
  C[Circulation velocity] --> D
  D --> S[Score theo cửa sổ thời gian]
  S --> E[Evidence + explanation]
  E --> R[Recommendation DRAFT]
  R --> A{Admin/Librarian review}
  A -- Duyệt --> P[Đề xuất được chấp thuận nội bộ]
  A -- Từ chối --> X[Lưu reason để hiệu chỉnh]
```

Score không dùng dữ liệu nhạy cảm cá nhân nếu không cần. Mỗi recommendation lưu component score, cửa sổ, thời điểm snapshot và phiên bản công thức; quyết định nội bộ lưu người duyệt, thời điểm và lý do. Core cung cấp số Copy hiện tại, Hold đang chờ và Loan phát sinh trong cửa sổ thời gian. Lịch sử thêm Favorite và lượt tìm không có kết quả chưa đủ nguồn để đếm, nên được ghi là thiếu chứ không gán bằng 0. Ngân sách, sách đang đặt và mùa vụ chưa có nguồn đáng tin cậy nên chưa phải guardrail đang chạy. Con người quyết định cuối.

Nhánh Tuan đã có read projection Core, adapter gọi Core qua token nhân viên, hàm tính điểm `acquisition-v1`, migration lưu recommendation và workflow chuyển `DRAFT` sang `APPROVED`/`REJECTED` với kiểm tra version, lý do và audit. API và giao diện cho nhân viên xem bằng chứng, tạo đề xuất và quyết định. PostgreSQL integration test kiểm Core projection và phần lưu/duyệt của Insight; adapter có test hợp đồng riêng. Chưa có một bài E2E tạo đề xuất qua cả hai service trên bản EXE hiện tại, và thay đổi mới chỉ được bàn giao sau khi CI trên commit cuối đạt. `APPROVED` chỉ là đồng ý với đề xuất, không tạo đơn đặt mua hoặc thanh toán. Mã người tạo/người duyệt được giữ để đối chiếu quyết định; chính sách thời hạn lưu và quy trình xóa/ẩn khi nhân viên rời hệ thống cần được chốt trước vận hành thật. Không tự xóa bản ghi production theo giả định.
