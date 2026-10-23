package io.github.shuuma4869.lams.core.catalog.review.api;

import io.github.shuuma4869.lams.core.catalog.review.application.ReviewService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/reviews")
@PreAuthorize("isAuthenticated()")
public class MyReviewsController {
    private final ReviewService reviews;
    public MyReviewsController(ReviewService reviews) { this.reviews = reviews; }

    @GetMapping
    public ReviewPageResponse list(JwtAuthenticationToken token, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size, @RequestParam(required = false) String bookId) {
        UUID actor = UUID.fromString(token.getToken().getSubject());
        UUID book = null;
        if (bookId != null) {
            try {
                book = UUID.fromString(bookId);
                if (!book.toString().equalsIgnoreCase(bookId)) throw new IllegalArgumentException();
            } catch (IllegalArgumentException error) { throw new AuthFailure(400, "bookId phải là UUID hợp lệ."); }
        }
        var result = reviews.listMine(actor, book, page, size);
        return new ReviewPageResponse(result.items().stream().map(review -> ReviewResponse.from(review, actor)).toList(), result.page());
    }
}
