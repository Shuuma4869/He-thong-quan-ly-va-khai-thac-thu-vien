package io.github.shuuma4869.lams.core.reports.holdactivity;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record HoldActivityReport(
        Instant from,
        Instant to,
        String timezone,
        UUID branchId,
        UUID bookId,
        long totalEvents,
        List<Row> items) {
    public HoldActivityReport {
        items = List.copyOf(items);
    }

    public record Row(LocalDate date, UUID branchId, String eventType, long eventCount) {}
}
