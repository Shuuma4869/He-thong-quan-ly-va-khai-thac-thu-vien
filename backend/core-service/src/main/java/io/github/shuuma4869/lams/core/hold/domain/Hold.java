package io.github.shuuma4869.lams.core.hold.domain;

import java.time.Instant;
import java.util.UUID;

public record Hold(UUID id, UUID readerId, UUID bookId, UUID editionId, UUID branchId, String status,
                   Instant queuedAt, Instant readyAt, Instant expiresAt, Instant closedAt, UUID copyId,
                   UUID loanId, long version, String policyVersion, long pickupSeconds) {
    public boolean active() { return status.equals("WAITING") || status.equals("READY"); }
}
