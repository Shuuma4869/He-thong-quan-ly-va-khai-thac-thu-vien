package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldNoShowService {
    public record Incident(UUID holdId, Instant readyAt, Instant expiresAt, Instant closedAt,
                           String decision, int decisionVersion, String reason, Instant decidedAt,
                           String decisionPolicyVersion) {}
    public record Summary(String policyVersion, Instant from, Instant to, int confirmed, int unreviewed,
                          int excused, String advisoryLevel, boolean restrictionsEnabled,
                          List<Incident> recentIncidents) {}
    private final JdbcTemplate jdbc;
    private final AuthService identity;
    private final Clock clock;
    private final String policyVersion;
    private final int lookbackDays;
    private final int watchThreshold;
    private final int reviewThreshold;

    public HoldNoShowService(JdbcTemplate jdbc, AuthService identity, Clock clock,
            @Value("${lams.hold.no-show.policy-version:advisory-v1}") String policyVersion,
            @Value("${lams.hold.no-show.lookback-days:90}") int lookbackDays,
            @Value("${lams.hold.no-show.watch-threshold:2}") int watchThreshold,
            @Value("${lams.hold.no-show.review-threshold:3}") int reviewThreshold) {
        if (policyVersion.isBlank() || policyVersion.length() > 40 || lookbackDays < 1 || lookbackDays > 365
                || watchThreshold < 1 || reviewThreshold <= watchThreshold)
            throw new IllegalArgumentException("Cấu hình chính sách no-show không hợp lệ.");
        this.jdbc = jdbc; this.identity = identity; this.clock = clock;
        this.policyVersion = policyVersion; this.lookbackDays = lookbackDays;
        this.watchThreshold = watchThreshold; this.reviewThreshold = reviewThreshold;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Summary mine(UUID actor) { requireReader(actor); return summary(actor); }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Summary forStaff(UUID actor, UUID readerId) {
        requireStaff(actor);
        if (jdbc.queryForObject("SELECT count(*) FROM users WHERE id=?", Integer.class, readerId) == 0)
            throw new AuthFailure(404, "Không tìm thấy tài khoản.");
        return summary(readerId);
    }

    private Summary summary(UUID readerId) {
        Instant to = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Instant from = to.minus(lookbackDays, ChronoUnit.DAYS);
        // HOLD_EXPIRED là bằng chứng nghiệp vụ; chỉ quyết định CONFIRMED mới tính vào mức tham khảo.
        var rows = jdbc.query("""
                SELECT h.id AS hold_id, h.ready_at, h.expires_at, h.closed_at,
                       COALESCE(d.decision, 'UNREVIEWED') AS decision,
                       COALESCE(d.version, 0) AS decision_version, d.reason, d.decided_at, d.policy_version
                FROM holds h
                JOIN hold_changes c ON c.hold_id=h.id AND c.event_type='HOLD_EXPIRED'
                LEFT JOIN LATERAL (
                    SELECT decision, version, reason, decided_at, policy_version FROM hold_no_show_decisions
                    WHERE hold_id=h.id ORDER BY version DESC LIMIT 1
                ) d ON true
                WHERE h.reader_id=? AND h.status='EXPIRED' AND h.ready_at IS NOT NULL
                  AND h.expires_at<=h.closed_at AND h.closed_at>=? AND h.closed_at<=?
                ORDER BY h.closed_at DESC, h.id DESC
                """, (rs, n) -> new Incident(rs.getObject("hold_id", UUID.class),
                rs.getTimestamp("ready_at").toInstant(), rs.getTimestamp("expires_at").toInstant(),
                rs.getTimestamp("closed_at").toInstant(), rs.getString("decision"),
                rs.getInt("decision_version"), rs.getString("reason"),
                rs.getTimestamp("decided_at") == null ? null : rs.getTimestamp("decided_at").toInstant(),
                rs.getString("policy_version")),
                readerId, Timestamp.from(from), Timestamp.from(to));
        int confirmed = (int) rows.stream().filter(item -> item.decision().equals("CONFIRMED")).count();
        int unreviewed = (int) rows.stream().filter(item -> item.decision().equals("UNREVIEWED")).count();
        int excused = rows.size() - confirmed - unreviewed;
        String level = confirmed >= reviewThreshold ? "REVIEW" : confirmed >= watchThreshold ? "WATCH" : "CLEAR";
        return new Summary(policyVersion, from, to, confirmed, unreviewed, excused, level, false,
                rows.stream().limit(50).toList());
    }

    @Transactional
    public Summary decide(UUID actor, UUID holdId, int expectedVersion, String decision, String reason) {
        requireAdmin(actor);
        if (expectedVersion < 0) throw new AuthFailure(422, "Phiên bản quyết định không hợp lệ.");
        String action = decision == null ? "" : decision.strip();
        if (!action.equals("CONFIRMED") && !action.equals("EXCUSED"))
            throw new AuthFailure(422, "Chọn xác nhận hoặc miễn trừ có lý do.");
        String why = reason == null ? "" : reason.strip();
        if (why.length() < 10 || why.length() > 1000)
            throw new AuthFailure(422, "Lý do cần từ 10 đến 1000 ký tự.");
        var owner = jdbc.query("""
                SELECT h.reader_id FROM holds h WHERE h.id=? AND h.status='EXPIRED'
                AND h.ready_at IS NOT NULL AND h.expires_at<=h.closed_at
                AND EXISTS (SELECT 1 FROM hold_changes c WHERE c.hold_id=h.id AND c.event_type='HOLD_EXPIRED')
                FOR UPDATE OF h
                """, (rs, n) -> rs.getObject(1, UUID.class), holdId);
        if (owner.isEmpty()) throw new AuthFailure(404, "Không tìm thấy lần giữ chỗ hết hạn có bằng chứng.");
        int version = jdbc.queryForObject("SELECT COALESCE(MAX(version),0) FROM hold_no_show_decisions WHERE hold_id=?",
                Integer.class, holdId);
        if (version != expectedVersion) throw new AuthFailure(409, "Quyết định đã thay đổi; vui lòng tải lại.");
        jdbc.update("""
                INSERT INTO hold_no_show_decisions(id,hold_id,version,decision,reason,actor_id,policy_version,decided_at)
                VALUES (?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(), holdId, version + 1, action, why, actor, policyVersion,
                Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS)));
        return summary(owner.getFirst());
    }

    private void requireReader(UUID actor) { identity.currentUser(actor); }
    private void requireStaff(UUID actor) {
        var roles = identity.currentUser(actor).roles();
        if (!roles.contains(RoleCode.LIBRARIAN) && !roles.contains(RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền xem cơ sở quyết định giữ chỗ.");
    }
    private void requireAdmin(UUID actor) {
        if (!identity.currentUser(actor).roles().contains(RoleCode.ADMIN))
            throw new AuthFailure(403, "Chỉ quản trị viên được xác nhận hoặc miễn trừ no-show.");
    }
}
