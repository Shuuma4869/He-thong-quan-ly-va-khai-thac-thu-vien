package io.github.shuuma4869.lams.core.catalog.review.application;

import io.github.shuuma4869.lams.core.catalog.review.infrastructure.ReviewRepository;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import java.math.RoundingMode;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RatingService {
    public record RatingSummary(UUID bookId, java.math.BigDecimal average, long count) {}

    private final ReviewRepository reviews;
    private final AuthService identity;

    public RatingService(ReviewRepository reviews, AuthService identity) {
        this.reviews = reviews;
        this.identity = identity;
    }

    @Transactional(readOnly = true)
    public RatingSummary summary(UUID actorId, UUID bookId) {
        CatalogAccess.requireReader(identity, actorId);
        if (!reviews.bookExists(bookId)) throw new AuthFailure(404, "Không tìm thấy sách.");
        var aggregate = reviews.ratingAggregate(bookId);
        var average = aggregate.count() == 0 ? null : aggregate.average().setScale(2, RoundingMode.HALF_UP);
        return new RatingSummary(bookId, average, aggregate.count());
    }
}
