package io.github.shuuma4869.lams.core.catalog.publicapi;

import io.github.shuuma4869.lams.core.catalog.book.domain.Book;
import io.github.shuuma4869.lams.core.catalog.book.infrastructure.BookRepository;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryAliasRepository;
import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import io.github.shuuma4869.lams.core.catalog.edition.infrastructure.EditionRepository;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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
    public record DirectoryImage(UUID subjectId, String imageUrl, String source, String sourceUrl,
                                 String license, String licenseUrl, String attribution, Instant approvedAt,
                                 String context) {}
    public record CatalogSource(String sourceCode, String sourceUrl, LocalDate ebookReleasedOn) {}
    public record BookCard(UUID id, String title, String description,
                           List<Book.RelatedItem> authors, List<Book.RelatedItem> categories, Cover cover,
                           BigDecimal averageRating, long ratingCount, CatalogSource catalogSource) {}
    private record Rating(BigDecimal average, long count) {}
    private final BookRepository books;
    private final CategoryAliasRepository categoryAliases;
    private final EditionRepository editions;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    public PublicCatalogService(BookRepository books, CategoryAliasRepository categoryAliases,
                                EditionRepository editions, JdbcTemplate jdbc,
                                NamedParameterJdbcTemplate named) {
        this.books = books; this.categoryAliases = categoryAliases;
        this.editions = editions; this.jdbc = jdbc; this.named = named;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Result<BookCard> books(int page, int size, String query, UUID authorId, UUID categoryId,
                                  String categoryTerm, String sort) {
        bounds(page, size, 50);
        String term = CatalogText.key(query);
        if (term.length() > 500) throw invalid("Từ khóa không được vượt quá 500 ký tự.");
        if (!sort.equals("title") && !sort.equals("updated") && !sort.equals("relevance"))
            throw invalid("Kiểu sắp xếp không hợp lệ.");
        if (sort.equals("relevance") && term.isBlank()) throw invalid("Cần từ khóa để sắp xếp theo mức độ phù hợp.");
        if (categoryTerm != null) {
            if (categoryId != null) throw invalid("Chỉ chọn một cách lọc thể loại.");
            String display = CatalogText.display(categoryTerm);
            String key = CatalogText.key(display);
            if (display.isEmpty() || display.length() > 150 || key.length() > 150)
                throw invalid("Tên thể loại hoặc bí danh không hợp lệ.");
            var matches = categoryAliases.findTermMatches(key);
            if (matches.size() > 1) throw new AuthFailure(409, "Tên thể loại khớp với nhiều Category chuẩn.");
            if (matches.isEmpty()) return new Result<>(List.of(), metadata(page, size, 0));
            categoryId = matches.getFirst().id();
        }
        var listed = term.isBlank() ? books.list(page, size, term, authorId, categoryId, sort)
                : books.search(page, size, term, authorId, categoryId, sort);
        var ids = listed.items().stream().map(Book::id).toList();
        var covers = covers(ids);
        var ratings = ratings(ids);
        var sources = sources(ids);
        return new Result<>(listed.items().stream().map(book -> card(book, covers.get(book.id()),
                ratings.get(book.id()), sources.get(book.id()))).toList(),
                metadata(page, size, listed.totalElements()));
    }

    @Transactional(readOnly = true)
    public BookCard book(UUID id) {
        Book book = books.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy sách."));
        return card(book, covers(List.of(id)).get(id), ratings(List.of(id)).get(id), sources(List.of(id)).get(id));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<BookCard> cards(List<UUID> requestedIds) {
        if (requestedIds == null || requestedIds.isEmpty() || requestedIds.size() > 20
                || requestedIds.stream().distinct().count() != requestedIds.size()) {
            throw invalid("Cần từ 1 đến 20 mã sách khác nhau.");
        }
        var found = books.findByIds(requestedIds);
        var byId = new java.util.HashMap<UUID, Book>();
        for (var book : found) byId.put(book.id(), book);
        var ids = found.stream().map(Book::id).toList();
        var covers = covers(ids); var ratings = ratings(ids); var sources = sources(ids);
        return requestedIds.stream().filter(byId::containsKey)
                .map(id -> card(byId.get(id), covers.get(id), ratings.get(id), sources.get(id))).toList();
    }

    @Transactional(readOnly = true)
    public Result<Edition> editions(UUID bookId, int page, int size) {
        bounds(page, size, 50);
        book(bookId);
        var result = editions.list(bookId, page, size);
        return new Result<>(result.items(), metadata(page, size, result.totalElements()));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Result<Named> names(String kind, int page, int size, String query) {
        bounds(page, size, 50);
        String table = table(kind);
        String term = CatalogText.display(query);
        if (term.length() > 150) throw invalid("Từ khóa tên quá dài.");
        String where = term.isEmpty() ? "" : " WHERE strpos(lower(public.unaccent(name)), lower(public.unaccent(?::text))) > 0";
        Object[] args = term.isEmpty() ? new Object[0] : new Object[]{term};
        long total = jdbc.queryForObject("SELECT count(*) FROM " + table + where, Long.class, args);
        String order = kind.equals("authors") ? "name,id" : "normalized_name,id";
        var values = new java.util.ArrayList<Object>(java.util.List.of(args));
        values.add(size); values.add((long) page * size);
        var items = jdbc.query("SELECT id,name FROM " + table + where + " ORDER BY " + order + " LIMIT ? OFFSET ?",
                (rs, row) -> new Named(rs.getObject("id", UUID.class), rs.getString("name")), values.toArray());
        return new Result<>(items, metadata(page, size, total));
    }

    public Named name(String kind, UUID id) {
        return jdbc.query("SELECT id,name FROM " + table(kind) + " WHERE id=?",
                (rs, row) -> new Named(rs.getObject("id", UUID.class), rs.getString("name")), id)
                .stream().findFirst().orElseThrow(() -> new AuthFailure(404, "Không tìm thấy mục trong danh mục."));
    }

    @Transactional(readOnly = true)
    public List<DirectoryImage> directoryImages(String kind, List<UUID> requestedIds) {
        table(kind);
        if (requestedIds == null || requestedIds.isEmpty() || requestedIds.size() > 20
                || requestedIds.stream().distinct().count() != requestedIds.size())
            throw invalid("Cần từ 1 đến 20 mã danh mục khác nhau.");
        String sql = kind.equals("authors") ? """
                SELECT m.author_id AS subject_id,m.image_url,m.source,m.source_url,m.license,
                    m.license_url,m.attribution,m.approved_at,'portrait' AS context
                FROM catalog_media_references m
                WHERE m.author_id IN (:ids) AND m.source<>'google-books'
                """ : """
                SELECT DISTINCT ON (bc.category_id) bc.category_id AS subject_id,m.image_url,m.source,
                    m.source_url,m.license,m.license_url,m.attribution,m.approved_at,'book-cover' AS context
                FROM book_categories bc JOIN editions e ON e.book_id=bc.book_id
                JOIN catalog_media_references m ON m.edition_id=e.id
                WHERE bc.category_id IN (:ids) AND m.source<>'google-books'
                ORDER BY bc.category_id,e.publication_year DESC NULLS LAST,m.approved_at DESC,e.id
                """;
        var found = new java.util.HashMap<UUID, DirectoryImage>();
        named.query(sql, new MapSqlParameterSource("ids", requestedIds), (RowCallbackHandler) rs -> {
            UUID id = rs.getObject("subject_id", UUID.class);
            found.put(id, new DirectoryImage(id, rs.getString("image_url"), rs.getString("source"),
                    rs.getString("source_url"), rs.getString("license"), rs.getString("license_url"),
                    rs.getString("attribution"), rs.getTimestamp("approved_at").toInstant(),
                    rs.getString("context")));
        });
        return requestedIds.stream().filter(found::containsKey).map(found::get).toList();
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

    private Map<UUID, CatalogSource> sources(List<UUID> bookIds) {
        if (bookIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<UUID, CatalogSource>();
        named.query("""
                SELECT DISTINCT ON (book_id) book_id,source_code,source_url,ebook_released_on
                FROM catalog_external_sources WHERE book_id IN (:bookIds)
                ORDER BY book_id,source_code,source_record_id
                """, new MapSqlParameterSource("bookIds", bookIds), (RowCallbackHandler) rs ->
                result.put(rs.getObject("book_id", UUID.class), new CatalogSource(
                        rs.getString("source_code"), rs.getString("source_url"),
                        rs.getObject("ebook_released_on", LocalDate.class))));
        return result;
    }

    private static Cover cover(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Cover(rs.getObject("edition_id", UUID.class), rs.getString("image_url"),
                rs.getString("source"), rs.getString("source_url"), rs.getString("license"),
                rs.getString("license_url"), rs.getString("attribution"), rs.getTimestamp("approved_at").toInstant());
    }

    private static BookCard card(Book book, Cover cover, Rating rating, CatalogSource source) {
        return new BookCard(book.id(), book.title(), book.description(), book.authors(), book.categories(), cover,
                rating == null ? null : rating.average(), rating == null ? 0 : rating.count(), source);
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
