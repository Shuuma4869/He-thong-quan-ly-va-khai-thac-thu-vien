# Technical debt của starter

## Frontend development dependencies

Ngày hardening, `npm audit --omit=dev` trả 0 vulnerability. Full audit còn 2 advisory mức moderate trong `vitest`/`@vitest/mocker`. Bản sửa được npm đề xuất yêu cầu nâng Vitest sang major mới, nên chưa áp dụng trong starter để tránh thay đổi test runner thiếu kiểm chứng. Không dùng `npm audit fix --force`.

Theo dõi và nâng Vitest có chủ đích ở maintenance task riêng; advisory không nằm trong production dependency tree hoặc frontend bundle.

## Test coverage

Test hiện là foundation test tối thiểu. Business feature phải bổ sung unit, integration, contract và E2E test theo test strategy.
