# ADR 0002: PostgreSQL là source of truth

**Trạng thái:** Chấp nhận

## Context
Loan, hold và trạng thái copy cần constraint, transaction và lịch sử migration; JSON file không đáp ứng concurrency.

## Decision
Dùng `lams_core` và `lams_insight` trong một PostgreSQL local. Core dùng Flyway; Insight dùng Prisma migration. Không dùng H2 làm runtime chính.

## Reason
Tách ownership logic trong khi giữ vận hành local đơn giản; PostgreSQL hỗ trợ nền search sau này.

## Consequences
Không cross-database transaction. Backup/restore và quyền database phải được thiết kế trước production.
