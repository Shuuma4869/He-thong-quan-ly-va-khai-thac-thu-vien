# Ma trận trách nhiệm service

| Năng lực | Frontend | Spring Core | NestJS Insight |
|---|---|---|---|
| UI/validation trải nghiệm | Chủ trì | Contract validation | Contract validation |
| Identity/RBAC | Hiển thị theo quyền | **Sở hữu** | Xác minh identity khi gọi API |
| Catalog/edition/copy | Trình bày | **Sở hữu và transaction** | Search document/read model |
| Loan/return/renew/hold | Workflow UI | **Sở hữu và transaction** | Phân tích event |
| Inventory/audit/policy | Staff UI | **Sở hữu** | Phân tích anomaly về sau |
| Search/metadata integration | Search UI | Cấp dữ liệu chuẩn | **Sở hữu discovery** |
| Demand/acquisition | Dashboard | Cấp fact nghiệp vụ | **Tính toán/giải thích** |
| Notification | Inbox UI | Phát domain fact | **Điều phối provider** |

Không dùng shared database write. Contract HTTP/event là biên phối hợp. Failure của Insight không được làm rollback giao dịch mượn/trả đã commit ở Core.

Tauri chỉ là desktop shell của frontend trên Windows. Rust không truy cập database, không cấp quyền hoặc giữ secret backend; toàn bộ API/validation nghiệp vụ vẫn ở service theo bảng trên. Xem [ADR desktop](adr/0007-windows-desktop-tauri.md). Bảng là phân công kiến trúc mục tiêu, không phải trạng thái hoàn thành.

Hiện có Auth/Member read-only, Catalog/Inventory, metadata/duyệt ảnh và history ISBN. Favorites/Reviews/Rating có backend của Toan qua PR #11; UI và các sửa lỗi tích hợp của Tuan đã vào main qua PR #13 tại `ea93b7a`. Search read model, circulation/hold, anomaly, acquisition và notification vẫn planned. Insight history dùng Prisma/PostgreSQL riêng, chỉ lưu dấu vết tra cứu; không ghi Catalog hoặc sao chép bảng Core. Xem [ORM](metadata-history-orm.md), [bàn giao Phase 3/4](../00-bat-dau/handoff-phase3-4.md) và [system flow](../08-van-hanh/system-flow.md).
