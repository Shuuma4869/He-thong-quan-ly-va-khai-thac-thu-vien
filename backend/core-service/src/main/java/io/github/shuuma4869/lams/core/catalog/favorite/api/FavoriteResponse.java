package io.github.shuuma4869.lams.core.catalog.favorite.api;

import io.github.shuuma4869.lams.core.catalog.favorite.domain.Favorite;
import java.time.Instant;
import java.util.UUID;

public record FavoriteResponse(UUID bookId, String bookTitle, Instant favoritedAt) {
    public static FavoriteResponse from(Favorite favorite) {
        return new FavoriteResponse(favorite.bookId(), favorite.bookTitle(), favorite.favoritedAt());
    }
}
