package io.github.shuuma4869.lams.core.inventory.copy.api;

import io.github.shuuma4869.lams.core.inventory.copy.domain.BookCopy;
import java.util.UUID;

public record BookCopyResponse(UUID id, UUID editionId, String bookTitle, String isbn13,
                               UUID shelfId, UUID branchId, String shelfCode,
                               String barcode, String status, long version) {
    public static BookCopyResponse from(BookCopy c) {
        return new BookCopyResponse(c.id(),c.editionId(),c.bookTitle(),c.isbn13(),c.shelfId(),c.branchId(),
                c.shelfCode(),c.barcode(),c.status(),c.version());
    }
}
