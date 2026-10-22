package io.github.shuuma4869.lams.core.catalog.review.api;

import io.github.shuuma4869.lams.core.catalog.review.domain.Review;
import java.time.Instant;
import java.util.UUID;

public record ReviewResponse(UUID reviewId, UUID bookId, String body, int rating,
                            Instant createdAt, Instant updatedAt, boolean mine) {
    public static ReviewResponse from(Review review, UUID actorId) {
        return new ReviewResponse(review.id(), review.bookId(), review.body(), review.rating(),
                review.createdAt(), review.updatedAt(), review.userId().equals(actorId));
    }
}
