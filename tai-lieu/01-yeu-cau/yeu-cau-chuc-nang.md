# Yêu cầu chức năng

Mức ưu tiên: **MVP** cần cho vòng nghiệp vụ đầu; **Advanced** tạo khác biệt sản phẩm; **Future** chỉ định hướng.

| Actor | MVP | Advanced | Future |
|---|---|---|---|
| Reader | Đăng nhập; tìm/xem sách; xem availability; theo dõi loan/hold; quản lý hồ sơ | fuzzy/hybrid search; ETA hold; gợi ý alternative edition | semantic recommendation cá nhân hóa |
| Librarian | Catalog; edition/copy; mượn/trả/gia hạn; hold queue; branch/shelf | kiểm kê bằng barcode; xử lý anomaly; zero-result curation | workflow nhập metadata bán tự động |
| Admin | User/role; policy; audit; cấu hình hệ thống | analytics nhu cầu; duyệt đề xuất mua thêm | forecasting và tối ưu phân bổ liên chi nhánh |

Quyền phải được kiểm ở server; UI chỉ hỗ trợ trải nghiệm, không phải ranh giới bảo mật. Availability phải suy ra từ copy state/read model, không lưu thành số đếm duy nhất ở `books`.
