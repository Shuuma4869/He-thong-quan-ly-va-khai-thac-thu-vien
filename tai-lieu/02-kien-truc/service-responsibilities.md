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
