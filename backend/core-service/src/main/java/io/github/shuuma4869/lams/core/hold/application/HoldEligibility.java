package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.loan.infrastructure.LoanRepository;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import java.time.Instant;
import java.util.HashSet;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class HoldEligibility {
    private final JdbcTemplate jdbc;
    private final LoanRepository loans;
    private final BorrowPolicyService policy;
    public HoldEligibility(JdbcTemplate jdbc, LoanRepository loans, BorrowPolicyService policy) {
        this.jdbc=jdbc; this.loans=loans; this.policy=policy;
    }
    // Chỉ xét để phân bổ; pickup khóa Reader và kiểm lại quota bằng Borrow command.
    public boolean eligible(UUID reader, Instant now) {
        var status = jdbc.query("SELECT status FROM users WHERE id=?", (r,n)-> UserStatus.valueOf(r.getString(1)), reader);
        if (status.isEmpty()) return false;
        var roles = new HashSet<>(jdbc.query("SELECT role_code FROM user_roles WHERE user_id=?", (r,n)-> RoleCode.valueOf(r.getString(1)), reader));
        return policy.canBorrow(status.getFirst(), roles, loans.activeCount(reader), loans.hasOverdue(reader,now)).allowed();
    }
}
