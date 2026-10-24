package io.github.shuuma4869.lams.core.circulation.history.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CirculationReportResponse(Instant from,Instant to,String timezone,Instant asOf,
                                        Totals totals,List<Row> items) {
    public record Totals(long borrowed,long active,long returned,long overdue) {}
    public record Row(LocalDate date,UUID branchId,String branchName,long borrowed,long active,long returned,long overdue) {}
}
