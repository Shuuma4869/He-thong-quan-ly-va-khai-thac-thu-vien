package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.hold.domain.HoldEtaModel;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldEtaService {
    public record Estimate(UUID holdId, long holdVersion, Instant asOf, Instant estimatedAt, String reason,
                           String policyVersion, int compatibleCopies, int waitingAhead) {}
    private record Copy(UUID id, UUID edition, String status, Instant due, Instant expires, boolean hasLoan, boolean hasHold) {}
    private final HoldRepository holds;
    private final JdbcTemplate jdbc;
    private final CirculationAccess access;
    private final HoldEligibility eligibility;
    private final BorrowPolicyService policy;
    private final Clock clock;
    public HoldEtaService(HoldRepository holds, JdbcTemplate jdbc, CirculationAccess access,
                          HoldEligibility eligibility, BorrowPolicyService policy, Clock clock) {
        this.holds = holds; this.jdbc = jdbc; this.access = access; this.eligibility = eligibility; this.policy = policy; this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 10)
    public Estimate estimate(UUID actor, UUID id) {
        access.reader(actor);
        var hold = holds.find(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy giữ chỗ."));
        access.ownerOrStaff(actor, hold.readerId());
        Instant now = clock.instant();
        String version = policy.current().version();
        if (!hold.active()) return new Estimate(id, hold.version(), now, null, "CLOSED", version, 0, 0);
        if (hold.status().equals("READY")) return new Estimate(id, hold.version(), now, null,
                hold.expiresAt().isAfter(now) ? "READY" : "AWAITING_EXPIRY", version, 1, 0);
        if (!"ACTIVE".equals(jdbc.queryForObject("SELECT status FROM branches WHERE id=?", String.class, hold.branchId())))
            return new Estimate(id, hold.version(), now, null, "BRANCH_INACTIVE", version, 0, 0);
        if (!eligibility.eligible(hold.readerId(), now))
            return new Estimate(id, hold.version(), now, null, "READER_INELIGIBLE", version, 0, 0);
        var queue = jdbc.query("""
                SELECT * FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING'
                AND (queued_at,id)<=(?,?) ORDER BY queued_at,id LIMIT 501
                """, (r,n) -> HoldRepository.map(r), hold.bookId(), hold.branchId(), java.sql.Timestamp.from(hold.queuedAt()), id);
        var copies = jdbc.query("""
                SELECT c.id,c.edition_id,c.status,l.due_at,h.expires_at,l.id AS loan_id,h.id AS hold_id
                FROM book_copies c JOIN editions e ON e.id=c.edition_id JOIN shelves s ON s.id=c.shelf_id
                LEFT JOIN loans l ON l.copy_id=c.id AND l.returned_at IS NULL
                LEFT JOIN holds h ON h.copy_id=c.id AND h.status='READY'
                WHERE e.book_id=? AND s.branch_id=? AND c.status IN ('AVAILABLE','ON_LOAN','ON_HOLD')
                ORDER BY c.id LIMIT 501
                """, (r,n) -> new Copy(r.getObject("id", UUID.class), r.getObject("edition_id", UUID.class), r.getString("status"),
                r.getTimestamp("due_at") == null ? null : r.getTimestamp("due_at").toInstant(),
                r.getTimestamp("expires_at") == null ? null : r.getTimestamp("expires_at").toInstant(),
                r.getObject("loan_id") != null, r.getObject("hold_id") != null), hold.bookId(), hold.branchId());
        if (queue.size() > 500 || copies.size() > 500)
            return new Estimate(id, hold.version(), now, null, "SCOPE_TOO_LARGE", version, 0, 0);
        int compatible = (int) copies.stream().filter(c -> hold.editionId() == null || hold.editionId().equals(c.edition())).count();
        int ahead = Math.max(0, queue.size() - 1);
        var candidates = new ArrayList<HoldEtaModel.Candidate>();
        List<HoldEtaModel.Request> requests = queue.stream().map(h -> new HoldEtaModel.Request(h.id(), h.editionId(), h.pickupSeconds())).toList();
        String unknown = null;
        for (Copy copy : copies) {
            // Chỉ nguồn lực có thể phục vụ một yêu cầu trong phạm vi mới ảnh hưởng mô phỏng.
            if (requests.stream().noneMatch(r -> r.editionId() == null || r.editionId().equals(copy.edition()))) continue;
            Instant available = now;
            if (copy.status().equals("AVAILABLE")) {
                if (copy.hasLoan() || copy.hasHold()) { unknown = "INCONSISTENT_COPY"; break; }
            } else if (copy.status().equals("ON_LOAN")) {
                if (!copy.hasLoan() || copy.hasHold() || copy.due() == null) { unknown = "INCONSISTENT_COPY"; break; }
                if (!copy.due().isAfter(now)) { unknown = "OVERDUE_COPY"; break; }
                available = copy.due();
            } else {
                if (copy.hasLoan() || !copy.hasHold() || copy.expires() == null) { unknown = "INCONSISTENT_COPY"; break; }
                if (!copy.expires().isAfter(now)) { unknown = "AWAITING_EXPIRY"; break; }
                available = copy.expires().plus(policy.current().loanDuration());
            }
            candidates.add(new HoldEtaModel.Candidate(copy.id(), copy.edition(), available));
        }
        if (queue.stream().anyMatch(h -> h.queuedAt().isAfter(now))) unknown = "FUTURE_QUEUE_TIME";
        if (unknown != null) return new Estimate(id, hold.version(), now, null, unknown, version, compatible, ahead);
        var result = HoldEtaModel.estimate(id, requests, candidates, policy.current().loanDuration());
        return new Estimate(id, hold.version(), now, result.estimatedAt(), result.reason(), version, compatible, ahead);
    }
}
