package io.github.shuuma4869.lams.core.reports.holdactivity;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.sql.Timestamp;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldActivityReportService {
    public static final String TIMEZONE = "Asia/Ho_Chi_Minh";
    public static final int MAX_ROWS = 10_000;
    // PostgreSQL TIMESTAMPTZ supports 4713 BC through 294276 AD (microsecond precision).
    private static final Instant POSTGRES_MIN = Instant.parse("-4712-01-01T00:00:00Z");
    private static final Instant POSTGRES_MAX = Instant.parse("+294276-12-31T23:59:59.999999Z");

    private final NamedParameterJdbcTemplate jdbc;
    private final CirculationAccess access;
    private final Clock clock;

    public HoldActivityReportService(JdbcTemplate jdbc, CirculationAccess access, Clock clock) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
        this.access = access;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 15)
    public HoldActivityReport report(UUID actor, OffsetDateTime fromValue, OffsetDateTime toValue,
            UUID branchId, UUID bookId) {
        access.staff(actor);
        Instant from = microseconds(fromValue, "from");
        Instant to = microseconds(toValue, "to");
        if (!from.isBefore(to)) throw invalid("from phải nhỏ hơn to.");
        if (from.isBefore(POSTGRES_MIN) || to.isBefore(POSTGRES_MIN)
                || from.isAfter(POSTGRES_MAX) || to.isAfter(POSTGRES_MAX))
            throw invalid("Khoảng thời gian nằm ngoài miền timestamp PostgreSQL hỗ trợ.");
        Instant maxTo;
        try {
            maxTo = from.atOffset(ZoneOffset.UTC).plusMonths(6).toInstant();
        } catch (java.time.DateTimeException error) {
            throw invalid("Khoảng thời gian nằm ngoài miền timestamp PostgreSQL hỗ trợ.");
        }
        if (to.isAfter(maxTo))
            throw invalid("Khoảng thời gian không được vượt quá 6 tháng lịch.");

        var params = new MapSqlParameterSource()
                .addValue("from", Timestamp.from(from))
                .addValue("to", Timestamp.from(to))
                .addValue("branchId", branchId)
                .addValue("bookId", bookId)
                .addValue("timezone", TIMEZONE);
        List<HoldActivityReport.Row> rows = jdbc.query("""
                SELECT timezone(:timezone, hc.occurred_at)::date AS activity_date,
                       h.branch_id,
                       hc.event_type,
                       count(*) AS event_count
                FROM hold_changes hc
                JOIN holds h ON h.id = hc.hold_id
                WHERE hc.occurred_at >= :from AND hc.occurred_at < :to
                  AND (CAST(:branchId AS uuid) IS NULL OR h.branch_id = :branchId)
                  AND (CAST(:bookId AS uuid) IS NULL OR h.book_id = :bookId)
                GROUP BY activity_date, h.branch_id, hc.event_type
                ORDER BY activity_date, h.branch_id, hc.event_type
                LIMIT 10001
                """, params, (rs, rowNum) -> new HoldActivityReport.Row(
                rs.getDate("activity_date").toLocalDate(),
                rs.getObject("branch_id", UUID.class),
                rs.getString("event_type"),
                rs.getLong("event_count")));

        if (rows.size() > MAX_ROWS)
            throw invalid("Báo cáo vượt quá 10000 hàng; hãy thu hẹp khoảng thời gian hoặc bộ lọc.");
        long totalEvents = rows.stream().mapToLong(HoldActivityReport.Row::eventCount).sum();
        return new HoldActivityReport(from, to, TIMEZONE, branchId, bookId, totalEvents, rows);
    }

    private static Instant microseconds(OffsetDateTime value, String field) {
        if (value == null) throw invalid("Thiếu " + field + ".");
        if (value.getNano() % 1_000 != 0) throw invalid(field + " chỉ hỗ trợ độ chính xác đến microsecond.");
        return value.toInstant().truncatedTo(ChronoUnit.MICROS);
    }

    private static AuthFailure invalid(String message) {
        return new AuthFailure(422, message);
    }
}
