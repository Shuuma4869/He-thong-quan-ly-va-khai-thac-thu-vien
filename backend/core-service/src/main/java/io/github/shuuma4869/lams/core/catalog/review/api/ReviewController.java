package io.github.shuuma4869.lams.core.catalog.review.api;

import io.github.shuuma4869.lams.core.catalog.review.application.RatingService;
import io.github.shuuma4869.lams.core.catalog.review.application.ReviewService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/books/{bookId}/reviews")
@PreAuthorize("isAuthenticated()")
public class ReviewController {
    private final ReviewService reviews;
    private final RatingService ratings;

    public ReviewController(ReviewService reviews, RatingService ratings) {
        this.reviews = reviews;
        this.ratings = ratings;
    }

    @GetMapping
    public ReviewPageResponse list(JwtAuthenticationToken token, @PathVariable("bookId") String bookIdValue,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String sort) {
        UUID actor = actor(token);
        UUID bookId = uuid("bookId", bookIdValue);
        var result = reviews.list(actor, bookId, page, size, sort);
        return new ReviewPageResponse(result.items().stream().map(review -> ReviewResponse.from(review, actor)).toList(),
                result.page());
    }

    @PostMapping
    public ResponseEntity<ReviewResponse> create(JwtAuthenticationToken token,
                                                  @PathVariable("bookId") String bookIdValue,
                                                  @Valid @RequestBody ReviewRequest request) {
        UUID actor = actor(token);
        UUID bookId = uuid("bookId", bookIdValue);
        ReviewResponse response = ReviewResponse.from(
                reviews.create(actor, bookId, request.body(), request.rating()), actor);
        return ResponseEntity.created(URI.create("/api/v1/books/" + bookId + "/reviews/" + response.reviewId()))
                .body(response);
    }

    @GetMapping("/summary")
    public RatingService.RatingSummary summary(JwtAuthenticationToken token,
            @PathVariable("bookId") String bookIdValue) {
        return ratings.summary(actor(token), uuid("bookId", bookIdValue));
    }

    @PatchMapping("/{reviewId}")
    public ReviewResponse update(JwtAuthenticationToken token, @PathVariable("bookId") String bookIdValue,
            @PathVariable("reviewId") String reviewIdValue, @Valid @RequestBody ReviewUpdateRequest request) {
        UUID actor = actor(token);
        UUID bookId = uuid("bookId", bookIdValue);
        UUID reviewId = uuid("reviewId", reviewIdValue);
        return ReviewResponse.from(reviews.update(actor, bookId, reviewId, request.body(), request.rating()), actor);
    }

    @DeleteMapping("/{reviewId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable("bookId") String bookIdValue,
                       @PathVariable("reviewId") String reviewIdValue) {
        reviews.delete(actor(token), uuid("bookId", bookIdValue), uuid("reviewId", reviewIdValue));
    }

    private static UUID actor(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }

    private static UUID uuid(String field, String value) {
        try {
            UUID parsed = UUID.fromString(value);
            if (!parsed.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return parsed;
        } catch (IllegalArgumentException error) {
            throw new AuthFailure(400, field + " phải là UUID hợp lệ.");
        }
    }
}
