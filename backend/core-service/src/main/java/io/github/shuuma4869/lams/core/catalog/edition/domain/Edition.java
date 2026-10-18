package io.github.shuuma4869.lams.core.catalog.edition.domain;

import java.util.UUID;

public record Edition(UUID id, UUID bookId, String bookTitle, String isbn13, UUID publisherId,
                      String publisherName, Integer publicationYear, String language) {}
