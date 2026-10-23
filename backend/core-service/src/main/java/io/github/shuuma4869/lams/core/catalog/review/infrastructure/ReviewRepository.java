package io.github.shuuma4869.lams.core.catalog.review.infrastructure;

import io.github.shuuma4869.lams.core.catalog.review.domain.Review;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReviewRepository {
    public record ReviewPage(List<Review> items, long totalElements) {}
    public record RatingAggregate(BigDecimal average, long count) {}

    private final JdbcTemplate jdbc;

    public ReviewRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean bookExists(UUID bookId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM books WHERE id=?)", Boolean.class, bookId));
    }

    public boolean existsForUserAndBook(UUID userId, UUID bookId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM reviews WHERE user_id=? AND book_id=?)",
                Boolean.class, userId, bookId));
    }

    public Optional<UUID> insertIfAbsent(UUID id, UUID userId, UUID bookId, String body, int rating) {
        return jdbc.query("INSERT INTO reviews(id,user_id,book_id,body,rating) "
                        + "SELECT ?,?,?,?,? FROM books b WHERE b.id=? "
                        + "ON CONFLICT (user_id,book_id) DO NOTHING RETURNING id",
                (rs, row) -> rs.getObject("id", UUID.class), id, userId, bookId, body, rating, bookId)
                .stream().findFirst();
    }

    public Optional<Review> find(UUID bookId, UUID reviewId) {
        return jdbc.query("SELECT id,user_id,book_id,body,rating,created_at,updated_at "
                        + "FROM reviews WHERE book_id=? AND id=?",
                (rs, row) -> map(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getObject("book_id", UUID.class), rs.getString("body"), rs.getInt("rating"),
                        rs.getTimestamp("created_at"), rs.getTimestamp("updated_at")), bookId, reviewId)
                .stream().findFirst();
    }

    public ReviewPage list(UUID bookId, int page, int size, boolean ascending) {
        long total = jdbc.queryForObject("SELECT count(*) FROM reviews WHERE book_id=?", Long.class, bookId);
        String direction = ascending ? "ASC" : "DESC";
        var items = jdbc.query("SELECT id,user_id,book_id,body,rating,created_at,updated_at "
                        + "FROM reviews WHERE book_id=? ORDER BY created_at " + direction
                        + ",id ASC LIMIT ? OFFSET ?",
                (rs, row) -> map(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getObject("book_id", UUID.class), rs.getString("body"), rs.getInt("rating"),
                        rs.getTimestamp("created_at"), rs.getTimestamp("updated_at")),
                bookId, size, (long) page * size);
        return new ReviewPage(items, total);
    }

    public int update(UUID bookId, UUID reviewId, UUID ownerId, String body, Integer rating) {
        // Field bị bỏ qua phải lấy giá trị tại lúc UPDATE, không lấy snapshot từ SELECT trước đó.
        return jdbc.update("UPDATE reviews SET body=COALESCE(?,body),rating=COALESCE(?,rating),updated_at=clock_timestamp() "
                        + "WHERE book_id=? AND id=? AND user_id=?",
                body, rating, bookId, reviewId, ownerId);
    }

    public int delete(UUID bookId, UUID reviewId, UUID ownerId) {
        return jdbc.update("DELETE FROM reviews WHERE book_id=? AND id=? AND user_id=?",
                bookId, reviewId, ownerId);
    }

    public RatingAggregate ratingAggregate(UUID bookId) {
        return jdbc.queryForObject("SELECT AVG(rating)::numeric AS average,COUNT(*) AS count "
                        + "FROM reviews WHERE book_id=?",
                (rs, row) -> new RatingAggregate(rs.getBigDecimal("average"), rs.getLong("count")), bookId);
    }

    private static Review map(UUID id, UUID userId, UUID bookId, String body, int rating,
                              Timestamp createdAt, Timestamp updatedAt) {
        return new Review(id, userId, bookId, body, rating, createdAt.toInstant(), updatedAt.toInstant());
    }
}
