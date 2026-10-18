package io.github.shuuma4869.lams.core.inventory.shelf.api;

import io.github.shuuma4869.lams.core.inventory.shelf.domain.Shelf;
import java.util.UUID;

public record ShelfResponse(UUID id, UUID branchId, String branchCode, String code, String label, int sortOrder) {
    public static ShelfResponse from(Shelf shelf) {
        return new ShelfResponse(shelf.id(), shelf.branchId(), shelf.branchCode(), shelf.code(), shelf.label(), shelf.sortOrder());
    }
}
