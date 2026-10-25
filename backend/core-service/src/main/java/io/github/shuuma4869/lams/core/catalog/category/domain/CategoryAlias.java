package io.github.shuuma4869.lams.core.catalog.category.domain;

import java.util.UUID;

/** Một tên thay thế trỏ trực tiếp tới Category chuẩn. */
public record CategoryAlias(UUID id, UUID categoryId, String name, String normalizedAlias) {}
