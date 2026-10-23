package io.github.shuuma4869.lams.core.catalog.review.application;

import io.github.shuuma4869.lams.core.catalog.review.domain.Review;
import io.github.shuuma4869.lams.core.catalog.review.infrastructure.ReviewRepository;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record ReviewPage(List<Review> items, PageMetadata page) {}

    private final ReviewRepository reviews;
    private final AuthService identity;

    public ReviewService(ReviewRepository reviews, AuthService identity) {
        this.reviews = reviews;
        this.identity = identity;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReviewPage list(UUID actorId, UUID bookId, String pageValue, String sizeValue, String sortValue) {
        CatalogAccess.requireReader(identity, actorId);
        requireBook(bookId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size < 1) throw invalid("size phải nằm trong khoảng 1–100.");
        boolean ascending = sortAscending(sortValue);
        var result = reviews.list(bookId, page, size, ascending);
        long totalPages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new ReviewPage(result.items(), new PageMetadata(page, size, result.totalElements(), totalPages));
    }

    @Transactional
    public Review create(UUID actorId, UUID bookId, String body, Integer rating) {
        CatalogAccess.requireReader(identity, actorId);
        requireBook(bookId);
        String normalizedBody = normalizeBody(body);
        validateRating(rating);
        UUID id = UUID.randomUUID();
        java.util.Optional<UUID> inserted;
        try { inserted = reviews.insertIfAbsent(id, actorId, bookId, normalizedBody, rating); }
        catch (org.springframework.dao.DataIntegrityViolationException error) {
            if (error.getMostSpecificCause() instanceof java.sql.SQLException sql && "23503".equals(sql.getSQLState())) {
                throw notFound("Sách hoặc tài khoản không còn tồn tại.");
            }
            throw error;
        }
        if (inserted.isEmpty()) {
            if (reviews.existsForUserAndBook(actorId, bookId)) {
                throw new AuthFailure(409, "Bạn đã đánh giá sách này.");
            }
            throw notFound("Không tìm thấy sách.");
        }
        return reviews.find(bookId, id).orElseThrow(() -> notFound("Không tìm thấy đánh giá."));
    }

    @Transactional
    public Review update(UUID actorId, UUID bookId, UUID reviewId, String body, Integer rating) {
        CatalogAccess.requireReader(identity, actorId);
        requireBook(bookId);
        if (body == null && rating == null) throw invalid("Cần cung cấp body hoặc rating để cập nhật.");
        Review current = find(bookId, reviewId);
        requireOwner(current, actorId);
        String nextBody = body == null ? null : normalizeBody(body);
        Integer nextRating = rating == null ? null : validateRating(rating);
        if (reviews.update(bookId, reviewId, actorId, nextBody, nextRating) != 1) {
            throw notFound("Không tìm thấy đánh giá.");
        }
        return find(bookId, reviewId);
    }

    @Transactional
    public void delete(UUID actorId, UUID bookId, UUID reviewId) {
        CatalogAccess.requireReader(identity, actorId);
        requireBook(bookId);
        Review current = find(bookId, reviewId);
        requireOwner(current, actorId);
        if (reviews.delete(bookId, reviewId, actorId) != 1) throw notFound("Không tìm thấy đánh giá.");
    }

    private void requireBook(UUID bookId) {
        if (!reviews.bookExists(bookId)) throw notFound("Không tìm thấy sách.");
    }

    private Review find(UUID bookId, UUID reviewId) {
        return reviews.find(bookId, reviewId).orElseThrow(() -> notFound("Không tìm thấy đánh giá."));
    }

    private static void requireOwner(Review review, UUID actorId) {
        if (!review.userId().equals(actorId)) throw new AuthFailure(403, "Chỉ chủ sở hữu mới được sửa đánh giá.");
    }

    private static String normalizeBody(String value) {
        if (value == null) throw invalid("Nội dung đánh giá là bắt buộc.");
        String body = value.strip();
        if (body.isEmpty()) throw invalid("Nội dung đánh giá không được để trống.");
        if (body.codePointCount(0, body.length()) > 5000) {
            throw invalid("Nội dung đánh giá không được vượt quá 5000 ký tự.");
        }
        return body;
    }

    private static int validateRating(Integer value) {
        if (value == null || value < 1 || value > 5) throw invalid("rating phải nằm trong khoảng 1–5.");
        return value;
    }

    private static boolean sortAscending(String sortValue) {
        String value = sortValue == null || sortValue.isBlank() ? "createdAt,desc" : sortValue.trim();
        return switch (value) {
            case "createdAt,asc" -> true;
            case "createdAt,desc" -> false;
            default -> throw invalid("sort chỉ nhận createdAt,asc hoặc createdAt,desc.");
        };
    }

    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int number = Integer.parseInt(value);
            if (number < 0 || number > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return number;
        } catch (NumberFormatException error) {
            throw invalid(field + " phải là số nguyên.");
        }
    }

    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
    private static AuthFailure notFound(String message) { return new AuthFailure(404, message); }
}
