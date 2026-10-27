package io.github.shuuma4869.lams.core.inventory.copy.domain;

import java.util.UUID;

/** Read projection; id is retained for API compatibility and copyId names the inventory identity explicitly. */
public record InventoryScopeCopy(UUID id, UUID copyId, UUID editionId, String bookTitle, String isbn13,
                                 UUID shelfId, UUID branchId, String shelfCode, String barcode,
                                 String status, long version) {}
