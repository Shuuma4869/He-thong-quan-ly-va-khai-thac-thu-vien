package io.github.shuuma4869.lams.core.catalog.edition.infrastructure;

import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class EditionRepository {
    public record EditionPage(List<Edition> items, long totalElements) {}
    private static final String SELECT = "SELECT e.id,e.book_id,b.title AS book_title,e.isbn13,e.publisher_id,"
            + "p.name AS publisher_name,e.publication_year,e.language FROM editions e "
            + "JOIN books b ON b.id=e.book_id LEFT JOIN publishers p ON p.id=e.publisher_id ";
    private final JdbcTemplate jdbc;

    public EditionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void create(Edition e) {
        jdbc.update("INSERT INTO editions(id,book_id,publisher_id,isbn13,publication_year,language) VALUES (?,?,?,?,?,?)",
                e.id(), e.bookId(), e.publisherId(), e.isbn13(), e.publicationYear(), e.language());
    }
    public Optional<Edition> find(UUID bookId, UUID editionId) {
        return jdbc.query(SELECT + "WHERE e.book_id=? AND e.id=?", (rs, row) -> map(rs), bookId, editionId)
                .stream().findFirst();
    }
    public EditionPage list(UUID bookId, int page, int size) {
        long total = jdbc.queryForObject("SELECT count(*) FROM editions WHERE book_id=?", Long.class, bookId);
        var items = jdbc.query(SELECT + "WHERE e.book_id=? ORDER BY e.publication_year DESC NULLS LAST,e.id "
                        + "LIMIT ? OFFSET ?", (rs, row) -> map(rs), bookId, size, (long) page * size);
        return new EditionPage(items, total);
    }
    public boolean update(Edition e) {
        return jdbc.update("UPDATE editions SET publisher_id=?,isbn13=?,publication_year=?,language=? "
                + "WHERE id=? AND book_id=?", e.publisherId(), e.isbn13(), e.publicationYear(), e.language(),
                e.id(), e.bookId()) == 1;
    }
    public boolean delete(UUID bookId, UUID id) {
        return jdbc.update("DELETE FROM editions WHERE book_id=? AND id=?", bookId, id) == 1;
    }
    private static Edition map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Integer publicationYear = rs.getObject("publication_year") == null ? null : rs.getInt("publication_year");
        return new Edition(rs.getObject("id", UUID.class), rs.getObject("book_id", UUID.class),
                rs.getString("book_title"), rs.getString("isbn13"), rs.getObject("publisher_id", UUID.class),
                rs.getString("publisher_name"), publicationYear, rs.getString("language"));
    }
}
