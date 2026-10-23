package io.github.shuuma4869.lams.core.policy.domain;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("lams.circulation.policy")
public record CirculationPolicy(String version, int maxActiveLoans, Duration loanDuration,
                                int maxRenewals, Duration renewalDuration, Duration pickupDuration,
                                boolean blockOverdue) {
    public CirculationPolicy {
        if (version == null || !version.matches("[A-Za-z0-9._-]{1,80}"))
            throw new IllegalArgumentException("Policy phải có mã phiên bản 1–80 ký tự.");
        if (maxActiveLoans < 1 || maxActiveLoans > 100 || maxRenewals < 0 || maxRenewals > 100)
            throw new IllegalArgumentException("Hạn mức policy nằm ngoài giới hạn cấu hình.");
        requireDuration(loanDuration, "loanDuration");
        requireDuration(renewalDuration, "renewalDuration");
        requireDuration(pickupDuration, "pickupDuration");
    }

    private static void requireDuration(Duration value, String field) {
        if (value == null || value.compareTo(Duration.ofSeconds(1)) < 0
                || value.compareTo(Duration.ofDays(366)) > 0 || value.getNano() != 0)
            throw new IllegalArgumentException(field + " phải từ 1 giây đến 366 ngày, không có phần lẻ giây.");
    }
}
