package io.github.shuuma4869.lams.core.catalog.book.api;

import io.github.shuuma4869.lams.core.catalog.book.domain.Book;
import java.util.List;
import java.util.UUID;

public record BookResponse(UUID id, String title, String description, List<RelatedItem> authors,
                           List<RelatedItem> categories) {
    public record RelatedItem(UUID id, String name) {}
    public static BookResponse from(Book book) {
        return new BookResponse(book.id(), book.title(), book.description(),
                convert(book.authors()), convert(book.categories()));
    }
    private static List<RelatedItem> convert(List<Book.RelatedItem> items) {
        return items.stream().map(item -> new RelatedItem(item.id(), item.name())).toList();
    }
}
