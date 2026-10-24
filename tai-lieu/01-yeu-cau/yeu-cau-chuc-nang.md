# Yêu cầu chức năng

Mức ưu tiên: **MVP** cần cho vòng nghiệp vụ đầu; **Advanced** tạo khác biệt sản phẩm; **Future** chỉ định hướng.

Bảng dưới là roadmap sản phẩm, không phải checklist chức năng đã triển khai. Phạm vi học phần hiện thực và mã FR-01–20 nằm trong [User Stories/trace](user-stories.md) và [use case](use-case.md). FR-17–20 có backend mượn/trả/gia hạn/giữ chỗ, chưa hoàn thành giao diện và E2E. Availability, quản trị role/policy/audit và analytics chưa được coi là hoàn thành; Member hiện chỉ đọc. Phase 2.5 thêm FR-13 history ISBN owner-only trong Insight, không tự sửa Catalog.

| Actor | MVP | Advanced | Future |
|---|---|---|---|
| Reader | Đăng nhập; tìm/xem sách; xem availability; theo dõi loan/hold; quản lý hồ sơ | fuzzy/hybrid search; ETA hold; gợi ý alternative edition | semantic recommendation cá nhân hóa |
| Librarian | Catalog; edition/copy; mượn/trả/gia hạn; hold queue; branch/shelf | kiểm kê bằng barcode; xử lý anomaly; zero-result curation | workflow nhập metadata bán tự động |
| Admin | User/role; policy; audit; cấu hình hệ thống | analytics nhu cầu; duyệt đề xuất mua thêm | forecasting và tối ưu phân bổ liên chi nhánh |

Quyền phải được kiểm ở server; UI chỉ hỗ trợ trải nghiệm, không phải ranh giới bảo mật. Availability phải suy ra từ copy state/read model, không lưu thành số đếm duy nhất ở `books`.
