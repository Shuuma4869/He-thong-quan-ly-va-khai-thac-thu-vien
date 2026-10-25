package io.github.shuuma4869.lams.core.catalog.publicapi;

import io.github.shuuma4869.lams.core.catalog.book.domain.Book;
import io.github.shuuma4869.lams.core.catalog.book.infrastructure.BookRepository;
import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import io.github.shuuma4869.lams.core.catalog.edition.infrastructure.EditionRepository;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicCatalogService {
    public record Page(int number, int size, long totalElements, long totalPages) {}
    public record Result<T>(List<T> items, Page page) {}
    public record Named(UUID id, String name) {}
    public record Cover(UUID editionId, String imageUrl, String source, String sourceUrl,
                        String license, String licenseUrl, String attribution, Instant approvedAt) {}
    public record BookCard(UUID id, String title, String description,
                           List<Book.RelatedItem> authors, List<Book.RelatedItem> categories, Cover cover,
                           BigDecimal averageRating, long ratingCount) {}
    private record Rating(BigDecimal average, long count) {}
    private final BookRepository books;
    private final EditionRepository editions;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    public PublicCatalogService(BookRepository books, EditionRepository editions, JdbcTemplate jdbc,
                                NamedParameterJdbcTemplate named) {
        this.books = books; this.editions = editions; this.jdbc = jdbc; this.named = named;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Result<BookCard> books(int page, int size, String query, UUID authorId, UUID categoryId, String sort) {
        bounds(page, size, 50);
        String term = CatalogText.key(query);
        if (term.length() > 500) throw invalid("Từ khóa không được vượt quá 500 ký tự.");
        if (!sort.equals("title") && !sort.equals("updated")) throw invalid("Kiểu sắp xếp không hợp lệ.");
        var listed = books.list(page, size, term, authorId, categoryId, sort);
        var ids = listed.items().stream().map(Book::id).toList();
        var covers = covers(ids);
        var ratings = ratings(ids);
        return new Result<>(listed.items().stream().map(book -> card(book, covers.get(book.id()), ratings.get(book.id()))).toList(),
                metadata(page, size, listed.totalElements()));
    }

    @Transactional(readOnly = true)
    public BookCard book(UUID id) {
        Book book = books.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy sách."));
        return card(book, covers(List.of(id)).get(id), ratings(List.of(id)).get(id));
    }

    @Transactional(readOnly = true)
    public Result<Edition> editions(UUID bookId, int page, int size) {
        bounds(page, size, 50);
        book(bookId);
        var result = editions.list(bookId, page, size);
        return new Result<>(result.items(), metadata(page, size, result.totalElements()));
    }

    @Transactional(readOnly = true)
    public Result<Named> names(String kind, int page, int size) {
        bounds(page, size, 50);
        String table = table(kind);
        long total = jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class);
        String order = kind.equals("authors") ? "name,id" : "normalized_name,id";
        var items = jdbc.query("SELECT id,name FROM " + table + " ORDER BY " + order + " LIMIT ? OFFSET ?",
                (rs, row) -> new Named(rs.getObject("id", UUID.class), rs.getString("name")), size, (long) page * size);
        return new Result<>(items, metadata(page, size, total));
    }

    public Named name(String kind, UUID id) {
        return jdbc.query("SELECT id,name FROM " + table(kind) + " WHERE id=?",
                (rs, row) -> new Named(rs.getObject("id", UUID.class), rs.getString("name")), id)
                .stream().findFirst().orElseThrow(() -> new AuthFailure(404, "Không tìm thấy mục trong danh mục."));
    }

    public Cover editionCover(UUID editionId) {
        var rows = named.query("""
                SELECT m.edition_id,m.image_url,m.source,m.source_url,m.license,m.license_url,m.attribution,m.approved_at
                FROM catalog_media_references m WHERE m.edition_id=:id AND m.source<>'google-books'
                """, new MapSqlParameterSource("id", editionId), (rs, row) -> cover(rs));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private Map<UUID, Cover> covers(List<UUID> bookIds) {
        if (bookIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<UUID, Cover>();
        named.query("""
                SELECT DISTINCT ON (e.book_id) e.book_id,m.edition_id,m.image_url,m.source,m.source_url,
                    m.license,m.license_url,m.attribution,m.approved_at
                FROM editions e JOIN catalog_media_references m ON m.edition_id=e.id
                WHERE e.book_id IN (:bookIds) AND m.source<>'google-books'
                ORDER BY e.book_id,e.publication_year DESC NULLS LAST,e.id
                """, new MapSqlParameterSource("bookIds", bookIds), (RowCallbackHandler) rs ->
                result.put(rs.getObject("book_id", UUID.class), cover(rs)));
        return result;
    }

    private Map<UUID, Rating> ratings(List<UUID> bookIds) {
        if (bookIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<UUID, Rating>();
        named.query("SELECT book_id,AVG(rating)::numeric(3,2) AS average,COUNT(*) AS count "
                        + "FROM reviews WHERE book_id IN (:bookIds) GROUP BY book_id",
                new MapSqlParameterSource("bookIds", bookIds), (RowCallbackHandler) rs ->
                result.put(rs.getObject("book_id", UUID.class), new Rating(rs.getBigDecimal("average"), rs.getLong("count"))));
        return result;
    }

    private static Cover cover(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Cover(rs.getObject("edition_id", UUID.class), rs.getString("image_url"),
                rs.getString("source"), rs.getString("source_url"), rs.getString("license"),
                rs.getString("license_url"), rs.getString("attribution"), rs.getTimestamp("approved_at").toInstant());
    }

    private static BookCard card(Book book, Cover cover, Rating rating) {
        return new BookCard(book.id(), book.title(), book.description(), book.authors(), book.categories(), cover,
                rating == null ? null : rating.average(), rating == null ? 0 : rating.count());
    }
    private static Page metadata(int page, int size, long total) {
        return new Page(page, size, total, total == 0 ? 0 : (total + size - 1) / size);
    }
    private static void bounds(int page, int size, int maximum) {
        if (page < 0 || size < 1 || size > maximum) throw invalid("Trang hoặc kích thước trang nằm ngoài giới hạn.");
    }
    private static String table(String kind) {
        return switch (kind) {
            case "authors" -> "authors";
            case "categories" -> "categories";
            default -> throw new AuthFailure(404, "Loại danh mục không tồn tại.");
        };
    }
    private static AuthFailure invalid(String detail) { return new AuthFailure(422, detail); }
}
