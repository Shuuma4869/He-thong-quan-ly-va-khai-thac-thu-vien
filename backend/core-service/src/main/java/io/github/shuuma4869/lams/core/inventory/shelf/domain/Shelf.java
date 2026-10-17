package io.github.shuuma4869.lams.core.inventory.shelf.domain;

import java.util.UUID;

public record Shelf(UUID id, UUID branchId, String branchCode, String code, String label, int sortOrder) {}
