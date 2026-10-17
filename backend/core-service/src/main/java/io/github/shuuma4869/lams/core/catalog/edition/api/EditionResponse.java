package io.github.shuuma4869.lams.core.catalog.edition.api;

import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import java.util.UUID;

public record EditionResponse(UUID id, UUID bookId, String bookTitle, String isbn13, UUID publisherId,
                              String publisherName, Integer publicationYear, String language) {
    public static EditionResponse from(Edition e) {
        return new EditionResponse(e.id(), e.bookId(), e.bookTitle(), e.isbn13(), e.publisherId(),
                e.publisherName(), e.publicationYear(), e.language());
    }
}
