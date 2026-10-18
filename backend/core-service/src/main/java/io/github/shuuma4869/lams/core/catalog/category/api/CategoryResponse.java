package io.github.shuuma4869.lams.core.catalog.category.api;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import java.util.UUID;

public record CategoryResponse(UUID id, String name) {
    public static CategoryResponse from(Category category) {
        return new CategoryResponse(category.id(), category.name());
    }
}
