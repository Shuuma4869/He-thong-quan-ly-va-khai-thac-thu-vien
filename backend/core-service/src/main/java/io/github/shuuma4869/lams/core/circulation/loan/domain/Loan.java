package io.github.shuuma4869.lams.core.circulation.loan.domain;

import java.time.Instant;
import java.util.UUID;

/** Edition và branch giữ tham chiếu tại lúc mượn, không suy từ vị trí Copy hiện tại. */
public record Loan(UUID id, UUID copyId, UUID editionId, UUID readerId, UUID branchId,
                   UUID borrowedBy, Instant borrowedAt, Instant dueAt, Instant returnedAt,
                   UUID returnedBy, int renewalCount, long version, String policyVersion,
                   String policySnapshot) {
    public boolean active() { return returnedAt == null; }
    public boolean overdueAt(Instant now) { return active() && dueAt.isBefore(now); }
}
