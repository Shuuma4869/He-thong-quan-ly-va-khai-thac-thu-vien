# Kiểm thử liên dịch vụ

Unit/integration test nằm gần source trong từng ứng dụng. E2E Phase 1 ở `frontend/e2e/phase1.spec.ts`, chạy bằng `scripts/test-phase1-e2e.ps1`; thêm `-Desktop` để kiểm bản release Tauri qua WebView2 thật. Script dùng Core API và PostgreSQL tạm, không mock nghiệp vụ và không sửa dữ liệu dev.

Các nghiệp vụ Catalog/Loan/Hold và kiểm thử tải chưa được triển khai. Kết quả từng lần chạy ở CI hoặc artifact local bị Git bỏ qua; không lưu audit/PR draft tại đây. Xem [chiến lược kiểm thử](../tai-lieu/07-kiem-thu/test-strategy.md) và [desktop Windows](../tai-lieu/08-van-hanh/desktop-windows.md).
