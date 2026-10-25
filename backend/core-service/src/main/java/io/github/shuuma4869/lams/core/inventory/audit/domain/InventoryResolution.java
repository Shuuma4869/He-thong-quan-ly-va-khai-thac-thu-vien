package io.github.shuuma4869.lams.core.inventory.audit.domain;

import java.time.Instant;
import java.util.UUID;

public record InventoryResolution(UUID id, UUID anomalyId, String action, String reason,
        Long copyVersionSeen, Long copyVersionAfter, UUID resolvedBy, Instant resolvedAt) {}
