# Ma trận trách nhiệm service

| Năng lực | Frontend | Spring Core | NestJS Insight |
|---|---|---|---|
| UI/validation trải nghiệm | Chủ trì | Contract validation | Contract validation |
| Identity/RBAC | Hiển thị theo quyền | **Sở hữu** | Xác minh identity khi gọi API |
| Catalog/edition/copy | Trình bày | **Sở hữu và transaction** | Read model riêng khi có đồng bộ event |
| Loan/return/renew/hold | Workflow UI | **Sở hữu và transaction** | Phân tích event |
| Inventory/audit/policy | Staff UI | **Sở hữu** | Phân tích anomaly về sau |
| Search/metadata integration | Search UI | Tra cứu từ vựng trên Catalog chuẩn | Metadata discovery; tìm kiếm ngữ nghĩa về sau |
| Demand/acquisition | Dashboard | Cấp fact nghiệp vụ | **Tính toán/giải thích** |
| Notification | Inbox UI | Phát domain fact | **Điều phối provider** |

Không dùng shared database write. Contract HTTP/event là biên phối hợp. Failure của Insight không được làm rollback giao dịch mượn/trả đã commit ở Core.

Tauri chỉ là desktop shell của frontend trên Windows. Rust không truy cập database, không cấp quyền hoặc giữ secret backend; toàn bộ API/validation nghiệp vụ vẫn ở service theo bảng trên. Xem [ADR desktop](adr/0007-windows-desktop-tauri.md). Bảng là phân công kiến trúc mục tiêu, không phải trạng thái hoàn thành.

Core hiện có Auth/Member, Catalog, lưu thông/giữ chỗ và phiên kiểm kê. Insight có metadata discovery, lịch sử ISBN và điều phối thông báo; Insight history dùng Prisma/PostgreSQL riêng, chỉ lưu dấu vết tra cứu, không ghi Catalog. Phase 6 bổ sung tra cứu từ vựng trực tiếp trên Core để luôn đọc dữ liệu chuẩn; read model/event và tìm kiếm ngữ nghĩa trên Insight vẫn là bước riêng, chưa được coi là đã triển khai. Xem [ORM](metadata-history-orm.md), [bàn giao Phase 3/4](../00-bat-dau/handoff-phase3-4.md) và [tra cứu](../04-nghiep-vu/tim-kiem-thong-minh.md).
