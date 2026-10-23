package io.github.shuuma4869.lams.core.policy.application;

import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.policy.domain.CirculationPolicy;
import java.time.Instant;
import java.util.Set;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

@Service
@EnableConfigurationProperties(CirculationPolicy.class)
public class BorrowPolicyService {
    public enum Refusal { NONE, ACCOUNT_INACTIVE, ROLE_REQUIRED, QUOTA_REACHED, OVERDUE }
    public record Decision(Refusal refusal) { public boolean allowed() { return refusal == Refusal.NONE; } }
    private final CirculationPolicy policy;
    public BorrowPolicyService(CirculationPolicy policy) { this.policy = policy; }
    public CirculationPolicy current() { return policy; }

    // Service gọi phải khóa reader trước khi đếm; hàm policy không tự bảo vệ quota giữa các transaction.
    public Decision canBorrow(UserStatus status, Set<RoleCode> roles, long activeLoans, boolean overdue) {
        if (activeLoans < 0) throw new IllegalArgumentException("Số lượt mượn không được âm.");
        if (status != UserStatus.ACTIVE) return new Decision(Refusal.ACCOUNT_INACTIVE);
        if (roles == null || roles.stream().noneMatch(role -> role == RoleCode.READER
                || role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) return new Decision(Refusal.ROLE_REQUIRED);
        if (activeLoans >= policy.maxActiveLoans()) return new Decision(Refusal.QUOTA_REACHED);
        if (policy.blockOverdue() && overdue) return new Decision(Refusal.OVERDUE);
        return new Decision(Refusal.NONE);
    }

    public Instant dueAt(Instant borrowedAt) { return borrowedAt.plus(policy.loanDuration()); }
}
