package io.github.shuuma4869.lams.core.inventory.audit.domain;

import java.time.Instant;
import java.util.UUID;

public record InventorySession(UUID id, UUID branchId, UUID shelfId, UUID openedBy, Instant openedAt,
        String status, long version, int snapshotCount, int scanCount, Instant closedAt, UUID closedBy, String closeReason) {}
