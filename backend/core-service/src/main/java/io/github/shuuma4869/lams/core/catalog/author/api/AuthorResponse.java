package io.github.shuuma4869.lams.core.catalog.author.api;

import io.github.shuuma4869.lams.core.catalog.author.domain.Author;
import java.util.UUID;

public record AuthorResponse(UUID id, String name) {
    public static AuthorResponse from(Author author) {
        return new AuthorResponse(author.id(), author.name());
    }
}
