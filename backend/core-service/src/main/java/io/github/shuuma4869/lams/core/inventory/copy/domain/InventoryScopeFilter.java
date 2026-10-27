package io.github.shuuma4869.lams.core.inventory.copy.domain;

import java.util.UUID;

/** Immutable read-only filters shared by the inventory API and audit scope query. */
public record InventoryScopeFilter(UUID branchId, UUID editionId, UUID shelfId,
                                   String barcode, String status) {}
