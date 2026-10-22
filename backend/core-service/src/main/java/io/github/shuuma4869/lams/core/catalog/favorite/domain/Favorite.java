package io.github.shuuma4869.lams.core.catalog.favorite.domain;

import java.time.Instant;
import java.util.UUID;

public record Favorite(UUID bookId, String bookTitle, Instant favoritedAt) {}
