# Yêu cầu chức năng

Mức ưu tiên: **MVP** cần cho vòng nghiệp vụ đầu; **Advanced** tạo khác biệt sản phẩm; **Future** chỉ định hướng.

Bảng dưới là roadmap sản phẩm, không phải checklist chức năng đã triển khai. Phạm vi học phần và mã FR-01–22 nằm trong [User Stories/trace](user-stories.md) và [use case](use-case.md). FR-17–22 đã có API mượn/trả/gia hạn/giữ chỗ, lịch sử mượn, báo cáo Loan/CSV cùng giao diện và E2E tương ứng. Availability được tính từ trạng thái Copy trong các luồng hiện có; chưa có dịch vụ dự báo tổng quát. Quản trị role/policy, audit tổng thể và analytics nhu cầu chưa hoàn thành; Member hiện chỉ đọc. Phase 2.5 thêm FR-13 history ISBN owner-only trong Insight, không tự sửa Catalog.

| Actor | MVP | Advanced | Future |
|---|---|---|---|
| Reader | Đăng nhập; tìm/xem sách; xem availability; theo dõi loan/hold; quản lý hồ sơ | fuzzy/hybrid search; ETA hold; gợi ý alternative edition | semantic recommendation cá nhân hóa |
| Librarian | Catalog; edition/copy; mượn/trả/gia hạn; hold queue; branch/shelf | kiểm kê bằng barcode; xử lý anomaly; zero-result curation | workflow nhập metadata bán tự động |
| Admin | User/role; policy; audit; cấu hình hệ thống | analytics nhu cầu; duyệt đề xuất mua thêm | forecasting và tối ưu phân bổ liên chi nhánh |

Quyền phải được kiểm ở server; UI chỉ hỗ trợ trải nghiệm, không phải ranh giới bảo mật. Availability phải suy ra từ copy state/read model, không lưu thành số đếm duy nhất ở `books`.
