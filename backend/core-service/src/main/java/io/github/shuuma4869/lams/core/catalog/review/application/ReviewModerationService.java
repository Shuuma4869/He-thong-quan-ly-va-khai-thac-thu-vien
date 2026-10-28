package io.github.shuuma4869.lams.core.catalog.review.application;

import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewModerationService {
    public record Report(UUID id, UUID reviewId, UUID bookId, UUID reporterId, UUID reviewOwnerId,
                         String bodySnapshot, int ratingSnapshot, String reason, String status,
                         Instant createdAt, Instant resolvedAt) {}
    public record Queue(List<Report> items, int page, int size, long totalElements) {}
    public record Decision(UUID reportId, String action, String reviewStatus, Instant resolvedAt) {}

    private final JdbcTemplate jdbc;
    private final AuthService auth;

    public ReviewModerationService(JdbcTemplate jdbc, AuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    @Transactional
    public UUID report(UUID actor, UUID book, UUID review, String reason) {
        CatalogAccess.requireReader(auth, actor);
        String text = reason(reason);
        var rows = jdbc.query("SELECT user_id,body,rating,moderation_status FROM reviews "
                        + "WHERE id=? AND book_id=? FOR UPDATE",
                (rs, row) -> new Object[] {rs.getObject("user_id", UUID.class), rs.getString("body"),
                        rs.getInt("rating"), rs.getString("moderation_status")}, review, book);
        if (rows.isEmpty()) throw new AuthFailure(404, "Không tìm thấy đánh giá.");
        Object[] current = rows.getFirst();
        if (actor.equals(current[0])) throw new AuthFailure(422, "Bạn không thể báo cáo đánh giá của mình.");
        if (!"VISIBLE".equals(current[3])) throw new AuthFailure(409, "Đánh giá này đã được ẩn.");
        jdbc.query("SELECT pg_advisory_xact_lock(671295, hashtext(?))", rs -> null, actor.toString());
        Long recent = jdbc.queryForObject("SELECT count(*) FROM review_reports "
                + "WHERE reporter_id=? AND created_at > now() - interval '24 hours'", Long.class, actor);
        if (recent != null && recent >= 20) throw new AuthFailure(429, "Bạn đã gửi quá nhiều báo cáo trong 24 giờ.");
        UUID id = UUID.randomUUID();
        var inserted = jdbc.query("INSERT INTO review_reports(id,review_id,book_id,reporter_id,review_owner_id,"
                        + "body_snapshot,rating_snapshot,reason) VALUES (?,?,?,?,?,?,?,?) "
                        + "ON CONFLICT (reporter_id,review_id) DO NOTHING RETURNING id",
                (rs, row) -> rs.getObject(1, UUID.class), id, review, book, actor, current[0],
                current[1], current[2], text);
        if (inserted.isEmpty()) throw new AuthFailure(409, "Bạn đã báo cáo đánh giá này.");
        return id;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Queue queue(UUID actor, String state, int page, int size) {
        requireAdmin(actor);
        if (page < 0 || page > 10000 || size < 1 || size > 100)
            throw new AuthFailure(422, "Trang hoặc số dòng không hợp lệ.");
        String status = state == null || state.isBlank() ? "OPEN" : state.strip().toUpperCase(java.util.Locale.ROOT);
        if (!status.equals("OPEN") && !status.equals("RESOLVED"))
            throw new AuthFailure(422, "Trạng thái báo cáo không hợp lệ.");
        long total = jdbc.queryForObject("SELECT count(*) FROM review_reports WHERE status=?", Long.class, status);
        var items = jdbc.query("SELECT * FROM review_reports WHERE status=? ORDER BY created_at,id LIMIT ? OFFSET ?",
                this::map, status, size, (long) page * size);
        return new Queue(items, page, size, total);
    }

    @Transactional
    public Decision decide(UUID actor, UUID reportId, String actionValue, String reasonValue) {
        requireAdmin(actor);
        String action = actionValue == null ? "" : actionValue.strip().toUpperCase(java.util.Locale.ROOT);
        if (!action.equals("HIDE") && !action.equals("DISMISS"))
            throw new AuthFailure(422, "Quyết định phải là HIDE hoặc DISMISS.");
        String text = reason(reasonValue);
        Report located = jdbc.query("SELECT * FROM review_reports WHERE id=?", this::map, reportId)
                .stream().findFirst().orElseThrow(() -> new AuthFailure(404, "Không tìm thấy báo cáo."));
        // Report mới khóa review trước khi ghi report; quyết định giữ cùng thứ tự khóa.
        String before = jdbc.query("SELECT moderation_status FROM reviews WHERE id=? AND book_id=? FOR UPDATE",
                (rs, row) -> rs.getString(1), located.reviewId(), located.bookId()).stream().findFirst().orElse(null);
        Report report = jdbc.query("SELECT * FROM review_reports WHERE id=? FOR UPDATE", this::map, reportId)
                .stream().findFirst().orElseThrow(() -> new AuthFailure(404, "Không tìm thấy báo cáo."));
        if (!"OPEN".equals(report.status())) throw new AuthFailure(409, "Báo cáo đã được xử lý.");
        if (before == null && action.equals("HIDE"))
            throw new AuthFailure(409, "Đánh giá đã bị xóa; không thể ẩn.");
        if ("HIDDEN".equals(before) && action.equals("HIDE"))
            throw new AuthFailure(409, "Đánh giá đã được ẩn qua báo cáo khác.");
        String after = before;
        if (action.equals("HIDE") && "VISIBLE".equals(before)) {
            jdbc.update("UPDATE reviews SET moderation_status='HIDDEN' WHERE id=?", report.reviewId());
            after = "HIDDEN";
        }
        jdbc.update("UPDATE review_reports SET status='RESOLVED',resolved_at=now() WHERE id=?", reportId);
        jdbc.update("INSERT INTO review_moderation_audit(id,report_id,review_id,actor_id,action,reason,"
                        + "before_status,after_status) VALUES (?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), reportId, report.reviewId(), actor, action, text, before, after);
        Instant resolvedAt = jdbc.queryForObject("SELECT resolved_at FROM review_reports WHERE id=?",
                java.sql.Timestamp.class, reportId).toInstant();
        return new Decision(reportId, action, after, resolvedAt);
    }

    private void requireAdmin(UUID actor) {
        if (!auth.currentUser(actor).roles().contains(RoleCode.ADMIN))
            throw new AuthFailure(403, "Chỉ quản trị viên được xử lý báo cáo đánh giá.");
    }

    private static String reason(String value) {
        String normalized = value == null ? "" : value.strip();
        if (normalized.codePointCount(0, normalized.length()) < 10
                || normalized.codePointCount(0, normalized.length()) > 500
                || normalized.chars().anyMatch(Character::isISOControl))
            throw new AuthFailure(422, "Lý do cần có từ 10 đến 500 ký tự hợp lệ.");
        return normalized;
    }

    private Report map(ResultSet rs, int row) throws SQLException {
        var resolved = rs.getTimestamp("resolved_at");
        return new Report(rs.getObject("id", UUID.class), rs.getObject("review_id", UUID.class),
                rs.getObject("book_id", UUID.class), rs.getObject("reporter_id", UUID.class),
                rs.getObject("review_owner_id", UUID.class), rs.getString("body_snapshot"),
                rs.getInt("rating_snapshot"), rs.getString("reason"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(), resolved == null ? null : resolved.toInstant());
    }
}
