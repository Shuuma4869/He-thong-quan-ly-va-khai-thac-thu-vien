package io.github.shuuma4869.lams.core.catalog.review.domain;

import java.time.Instant;
import java.util.UUID;

public record Review(UUID id, UUID userId, UUID bookId, String body, int rating,
                     Instant createdAt, Instant updatedAt, String moderationStatus) {}
