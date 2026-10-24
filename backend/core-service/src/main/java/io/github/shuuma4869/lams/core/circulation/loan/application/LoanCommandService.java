package io.github.shuuma4869.lams.core.circulation.loan.application;

import io.github.shuuma4869.lams.core.circulation.loan.api.BorrowRequest;
import io.github.shuuma4869.lams.core.circulation.loan.api.ReturnRequest;
import io.github.shuuma4869.lams.core.circulation.loan.api.LoanCommandResult;
import io.github.shuuma4869.lams.core.circulation.loan.domain.Loan;
import io.github.shuuma4869.lams.core.circulation.loan.infrastructure.LoanRepository;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class LoanCommandService {
    private final JdbcTemplate jdbc;
    private final LoanRepository loans;
    private final CopyLockRepository locks;
    private final CopyStateService states;
    private final BorrowPolicyService policy;
    private final CirculationAccess access;
    private final CommandExecutor commands;
    private final Clock clock;

    public LoanCommandService(JdbcTemplate jdbc, LoanRepository loans, CopyLockRepository locks,
                              CopyStateService states, BorrowPolicyService policy, CirculationAccess access,
                              CommandExecutor commands, Clock clock) {
        this.jdbc = jdbc; this.loans = loans; this.locks = locks; this.states = states;
        this.policy = policy; this.access = access; this.commands = commands; this.clock = clock;
    }

    public LoanCommandResult borrow(UUID actor, BorrowRequest request) {
        return commands.execute(actor, request.requestId(), "BORROW", request, LoanCommandResult.class,
                () -> access.staff(actor), () -> {
                    var readers = jdbc.query("SELECT status FROM users WHERE id=? FOR NO KEY UPDATE",
                            (rs, row) -> UserStatus.valueOf(rs.getString(1)), request.readerId());
                    if (readers.isEmpty()) throw new AuthFailure(404, "Không tìm thấy người mượn.");
                    var copy = locks.lock(request.copyId());
                    access.staff(actor);
                    Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
                    var roles = new HashSet<>(jdbc.query("SELECT role_code FROM user_roles WHERE user_id=?",
                            (rs, row) -> RoleCode.valueOf(rs.getString(1)), request.readerId()));
                    var decision = policy.canBorrow(readers.getFirst(), roles, loans.activeCount(request.readerId()),
                            loans.hasOverdue(request.readerId(), now));
                    if (!decision.allowed()) throw new AuthFailure(409, switch (decision.refusal()) {
                        case ACCOUNT_INACTIVE -> "Tài khoản người mượn không hoạt động.";
                        case ROLE_REQUIRED -> "Tài khoản không còn quyền mượn sách.";
                        case QUOTA_REACHED -> "Người mượn đã đạt hạn mức đang mượn.";
                        case OVERDUE -> "Người mượn còn sách quá hạn.";
                        default -> "Không đủ điều kiện mượn sách.";
                    });
                    if (!copy.branchId().equals(request.branchId()) || !copy.branchStatus().equals("ACTIVE")) {
                        throw new AuthFailure(409, "Bản sách không ở chi nhánh đang hoạt động được yêu cầu.");
                    }
                    if (copy.version() != request.copyVersion() || !copy.status().equals("AVAILABLE")) {
                        throw new AuthFailure(409, "Bản sách không còn sẵn sàng hoặc đã thay đổi; hãy tải lại.");
                    }
                    var p = policy.current();
                    String snapshot = commands.encode(Map.of("version", p.version(), "maxActiveLoans", p.maxActiveLoans(),
                            "loanDuration", p.loanDuration().toString(), "maxRenewals", p.maxRenewals(),
                            "renewalDuration", p.renewalDuration().toString(), "pickupDuration", p.pickupDuration().toString(),
                            "blockOverdue", p.blockOverdue()));
                    var loan = new Loan(UUID.randomUUID(), copy.id(), copy.editionId(), request.readerId(), copy.branchId(),
                            actor, now, policy.dueAt(now), null, null, 0, 0, p.version(), snapshot);
                    loans.insert(loan);
                    states.transition(copy, "ON_LOAN", actor, "Cho mượn sách", now);
                    var result = LoanCommandResult.from(loan, copy.version() + 1);
                    event("COPY_BORROWED", result, now);
                    return result;
                });
    }

    public LoanCommandResult returnLoan(UUID actor, UUID loanId, ReturnRequest request) {
        return commands.execute(actor, request.requestId(), "RETURN", Map.of("loanId", loanId, "request", request),
                LoanCommandResult.class, () -> access.staff(actor), () -> {
                    var existing = loans.find(loanId).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy lượt mượn."));
                    var copy = locks.lock(existing.copyId());
                    var loan = loans.lock(loanId).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy lượt mượn."));
                    access.staff(actor);
                    if (!loan.active() || loan.version() != request.version() || !copy.status().equals("ON_LOAN")) {
                        throw new AuthFailure(409, "Lượt mượn đã trả hoặc đã thay đổi; hãy tải lại.");
                    }
                    if (!loan.branchId().equals(request.branchId()) || !copy.branchId().equals(request.branchId())) {
                        throw new AuthFailure(409, "Phải trả sách tại chi nhánh của lượt mượn.");
                    }
                    Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
                    if (now.isBefore(loan.borrowedAt())) throw new AuthFailure(409, "Thời gian hệ thống chưa hợp lệ để ghi nhận trả.");
                    jdbc.update("UPDATE loans SET returned_at=?,returned_by=?,version=version+1 WHERE id=?",
                            Timestamp.from(now), actor, loanId);
                    states.transition(copy, "AVAILABLE", actor, "Trả sách", now);
                    var result = LoanCommandResult.from(loans.find(loanId).orElseThrow(), copy.version() + 1);
                    event("COPY_RETURNED", result, now);
                    return result;
                });
    }

    private void event(String type, LoanCommandResult loan, Instant now) {
        UUID eventId = UUID.randomUUID();
        var payload = Map.of("eventId", eventId, "eventType", type, "occurredAt", now,
                "aggregateId", loan.loanId(), "version", 1, "aggregateVersion", loan.version(), "data", loan);
        jdbc.update("""
                INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at)
                VALUES (?,'LOAN',?,?,?::jsonb,?)
                """, eventId, loan.loanId().toString(), type, commands.encode(payload), Timestamp.from(now));
    }
}
