package io.github.shuuma4869.lams.core.catalog.book.domain;

import java.util.List;
import java.util.UUID;

public record Book(UUID id, String title, String description, List<RelatedItem> authors,
                   List<RelatedItem> categories) {
    public record RelatedItem(UUID id, String name) {}
}
