package io.github.shuuma4869.lams.core.inventory.copy.domain;

import java.util.UUID;

public record BookCopy(UUID id, UUID editionId, String bookTitle, String isbn13,
                       UUID shelfId, UUID branchId, String shelfCode, String barcode,
                       String status, long version) {}
