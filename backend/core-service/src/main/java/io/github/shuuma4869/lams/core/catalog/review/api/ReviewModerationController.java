package io.github.shuuma4869.lams.core.catalog.review.api;

import io.github.shuuma4869.lams.core.catalog.review.application.ReviewModerationService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@PreAuthorize("isAuthenticated()")
public class ReviewModerationController {
    public record ReportRequest(String reason) {}
    public record DecisionRequest(String action, String reason) {}
    public record ReportCreated(UUID reportId) {}

    private final ReviewModerationService moderation;

    public ReviewModerationController(ReviewModerationService moderation) {
        this.moderation = moderation;
    }

    @PostMapping("/books/{bookId}/reviews/{reviewId}/reports")
    public ResponseEntity<ReportCreated> report(JwtAuthenticationToken token,
            @PathVariable String bookId, @PathVariable String reviewId, @RequestBody ReportRequest request) {
        UUID id = moderation.report(actor(token), uuid(bookId), uuid(reviewId), request == null ? null : request.reason());
        return ResponseEntity.created(URI.create("/api/v1/admin/review-reports/" + id)).body(new ReportCreated(id));
    }

    @GetMapping("/admin/review-reports")
    public ReviewModerationService.Queue queue(JwtAuthenticationToken token,
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return moderation.queue(actor(token), status, page, size);
    }

    @PostMapping("/admin/review-reports/{reportId}/decisions")
    public ReviewModerationService.Decision decide(JwtAuthenticationToken token,
            @PathVariable String reportId, @RequestBody DecisionRequest request) {
        return moderation.decide(actor(token), uuid(reportId), request == null ? null : request.action(),
                request == null ? null : request.reason());
    }

    private static UUID actor(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }

    private static UUID uuid(String value) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (IllegalArgumentException error) {
            throw new AuthFailure(400, "ID phải là UUID hợp lệ.");
        }
    }
}
