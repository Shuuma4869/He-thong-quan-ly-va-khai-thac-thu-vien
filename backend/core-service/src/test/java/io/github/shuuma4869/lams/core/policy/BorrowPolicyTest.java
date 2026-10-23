package io.github.shuuma4869.lams.core.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService.Refusal;
import io.github.shuuma4869.lams.core.policy.domain.CirculationPolicy;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class BorrowPolicyTest {
    private CirculationPolicy policy(boolean block) {
        return new CirculationPolicy("test-v1", 5, Duration.ofDays(14), 1, Duration.ofDays(7), Duration.ofHours(48), block);
    }
    private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(BorrowPolicyService.class);

    @ParameterizedTest @EnumSource(RoleCode.class)
    void activeMembersOfExistingRolesMayBorrowWithinQuota(RoleCode role) {
        assertThat(new BorrowPolicyService(policy(true)).canBorrow(UserStatus.ACTIVE, Set.of(role), 4, false).allowed()).isTrue();
    }

    @ParameterizedTest @EnumSource(value = UserStatus.class, names = {"LOCKED", "DISABLED"})
    void inactiveMembersCannotBorrow(UserStatus status) {
        assertThat(new BorrowPolicyService(policy(true)).canBorrow(status, Set.of(RoleCode.READER), 0, false).refusal())
                .isEqualTo(Refusal.ACCOUNT_INACTIVE);
    }

    @Test void missingRoleQuotaAndOverdueHaveStableRefusalReasons() {
        var service = new BorrowPolicyService(policy(true));
        assertThat(service.canBorrow(UserStatus.ACTIVE, Set.of(), 0, false).refusal()).isEqualTo(Refusal.ROLE_REQUIRED);
        for (long count : new long[]{5, 6})
            assertThat(service.canBorrow(UserStatus.ACTIVE, Set.of(RoleCode.READER), count, false).refusal()).isEqualTo(Refusal.QUOTA_REACHED);
        assertThat(service.canBorrow(UserStatus.ACTIVE, Set.of(RoleCode.READER), 0, true).refusal()).isEqualTo(Refusal.OVERDUE);
        assertThat(new BorrowPolicyService(policy(false)).canBorrow(UserStatus.ACTIVE, Set.of(RoleCode.READER), 0, true).allowed()).isTrue();
        assertThatThrownBy(() -> service.canBorrow(UserStatus.ACTIVE, Set.of(RoleCode.READER), -1, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void dueDateUsesConfiguredDurationInUtcNotMachineTimeOrCalendar() {
        var service = new BorrowPolicyService(policy(true));
        assertThat(service.dueAt(Instant.parse("2026-10-24T00:30:00Z"))).isEqualTo(Instant.parse("2026-11-07T00:30:00Z"));
    }

    @Test void missingPolicyFailsAtStartupRatherThanAllowingUnboundedBorrow() {
        context.run(app -> assertThat(app).hasFailed());
    }

    @Test void validConfigurationBindsAndInvalidOverridesFail() {
        var configured = context.withPropertyValues("lams.circulation.policy.version=test-v2",
                "lams.circulation.policy.max-active-loans=3", "lams.circulation.policy.loan-duration=P10D",
                "lams.circulation.policy.max-renewals=0", "lams.circulation.policy.renewal-duration=P5D",
                "lams.circulation.policy.pickup-duration=PT24H", "lams.circulation.policy.block-overdue=true");
        configured.run(app -> {
            assertThat(app).hasNotFailed();
            assertThat(app.getBean(BorrowPolicyService.class).current().maxActiveLoans()).isEqualTo(3);
        });
        for (String invalid : new String[]{"max-active-loans=0", "max-active-loans=101", "max-renewals=-1",
                "version=", "loan-duration=PT0S", "renewal-duration=-P1D", "pickup-duration=P367D", "pickup-duration=PT0.5S"}) {
            configured.withPropertyValues("lams.circulation.policy." + invalid).run(app -> assertThat(app).hasFailed());
        }
    }
}
