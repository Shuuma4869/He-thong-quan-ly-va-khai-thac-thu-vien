package io.github.shuuma4869.lams.core.catalog.favorite.infrastructure;

import io.github.shuuma4869.lams.core.catalog.favorite.domain.Favorite;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FavoriteRepository {
    public record FavoritePage(List<Favorite> items, long totalElements) {}

    private final JdbcTemplate jdbc;

    public FavoriteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean bookExists(UUID bookId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM books WHERE id=?)", Boolean.class, bookId));
    }

    public Optional<Favorite> find(UUID userId, UUID bookId) {
        return jdbc.query("SELECT f.book_id,b.title,f.created_at FROM favorites f "
                        + "JOIN books b ON b.id=f.book_id WHERE f.user_id=? AND f.book_id=?",
                (rs, row) -> map(rs.getObject("book_id", UUID.class), rs.getString("title"),
                        rs.getTimestamp("created_at")), userId, bookId).stream().findFirst();
    }

    public Optional<Timestamp> insertIfAbsent(UUID userId, UUID bookId) {
        return jdbc.query("INSERT INTO favorites(user_id,book_id) "
                        + "SELECT ?,b.id FROM books b WHERE b.id=? "
                        + "ON CONFLICT (user_id,book_id) DO NOTHING RETURNING created_at",
                (rs, row) -> rs.getTimestamp("created_at"), userId, bookId).stream().findFirst();
    }

    public int delete(UUID userId, UUID bookId) {
        return jdbc.update("DELETE FROM favorites WHERE user_id=? AND book_id=?", userId, bookId);
    }

    public FavoritePage list(UUID userId, int page, int size, boolean ascending) {
        long total = jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=?", Long.class, userId);
        String direction = ascending ? "ASC" : "DESC";
        var items = jdbc.query("SELECT f.book_id,b.title,f.created_at FROM favorites f "
                        + "JOIN books b ON b.id=f.book_id WHERE f.user_id=? "
                        + "ORDER BY f.created_at " + direction + ",f.book_id ASC LIMIT ? OFFSET ?",
                (rs, row) -> map(rs.getObject("book_id", UUID.class), rs.getString("title"),
                        rs.getTimestamp("created_at")), userId, size, (long) page * size);
        return new FavoritePage(items, total);
    }

    private static Favorite map(UUID bookId, String title, Timestamp createdAt) {
        return new Favorite(bookId, title, createdAt.toInstant());
    }
}
