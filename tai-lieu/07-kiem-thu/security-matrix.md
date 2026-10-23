# Ma trận bảo mật và giới hạn nghiệm thu

| Threat | Endpoint | Control | Negative test | Evidence cần đối chiếu | Rủi ro còn lại |
|---|---|---|---|---|---|
| Giả staff bằng JWT cũ | Catalog, metadata/history | Core currentUser/roles; MetadataGuard mỗi request | Phase2RegressionTest; metadata-guard.spec | Core/Insight CI đúng SHA | Có cửa sổ thay đổi quyền sau check; chưa phải atomic xuyên service |
| Đọc/xóa lịch sử người khác | history/{id}, replay | owner từ Symbol nội bộ; WHERE ownerId | history.spec; history.integration; E2E history | CI 39907400703 và E2E EXE local đạt ở head ee929cd | ADMIN cũng không được vượt owner |
| Chèn ownerId từ client | POST history | DTO whitelist/forbid; không nhận owner field | history.spec; history-http.spec | Unit + HTTP boundary | Không dùng UI ẩn nút thay server |
| SQL injection | Catalog/member/history filters | JDBC bind + sort allowlist; Prisma typed where | MemberIntegrationTest; BookIntegrationTest; history DTO/integration | CI và DB test | Không suy an toàn mọi query từ một test |
| Lộ payload/PII | history response/storage | projection không owner; không lưu title/ảnh/token/email | history.spec; integration | Schema/source và DB test | UUID owner vẫn là dữ liệu liên quan người dùng |
| SSRF/provider abuse | metadata lookup/replay | provider allowlist, no redirect, timeout/size; guard limit | metadata.spec; MediaInspectorTest | Unit và live provider tách biệt | Rate limit theo process; availability nguồn ngoài không bảo đảm |
| False success | POST/DELETE history | chờ DB response; lỗi service trả 503 | history.spec; MetadataHistory.test | Unit/frontend | Network timeout sau commit cần tải lại, POST không idempotent |
| Session/CSRF | auth refresh/logout | HttpOnly, rotation; pilot trusted Origin/header | AuthIntegrationTest; PilotAuthSecurityTest; client.test | Regression đúng SHA | JWT access chưa hết hạn còn dùng được sau logout; HTTPS/WebView pilot chưa nghiệm thu |
| Lost update review | PATCH review | Hiện read-merge-write chưa có version/lock | Cần test hai PATCH đồng thời | Finding để review Phase 3 | Không tự kết luận đã sửa trong Phase 2.5 |
| Lộ lỗi nội bộ | Insight database | Service đổi exception thành 503 an toàn | history.spec; history-http.spec | Unit và HTTP boundary | Không log payload hoặc connection string |
| Sai principal sau đổi tài khoản | UI requests/cache | AuthProvider clear cache; history key owner/remount; request kiểm session generation trước response/retry | client.test: late 200/401 sau đổi account | Frontend regression; E2E web/EXE kiểm đăng nhập/logout/owner, race được kiểm bằng unit | Request đã commit trước logout không thể thu hồi bằng client |

“XORs” trong rubric chưa rõ; cần giảng viên xác nhận, không tự đổi thành XSS. Không có bảo đảm tuyệt đối “không lỗ hổng”. Dependency scan không thay kiểm authorization hoặc kiểm hệ thống triển khai.
