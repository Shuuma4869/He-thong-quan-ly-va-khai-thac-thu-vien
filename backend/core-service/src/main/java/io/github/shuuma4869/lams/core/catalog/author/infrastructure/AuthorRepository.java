package io.github.shuuma4869.lams.core.catalog.author.infrastructure;

import io.github.shuuma4869.lams.core.catalog.author.domain.Author;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuthorRepository {
    public record AuthorPage(List<Author> items, long totalElements) {}

    private final JdbcTemplate jdbc;

    public AuthorRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Author create(Author author) {
        jdbc.update("INSERT INTO authors (id, name) VALUES (?, ?)", author.id(), author.name());
        return author;
    }

    public Optional<Author> findById(UUID id) {
        return jdbc.query("SELECT id, name FROM authors WHERE id = ?",
                (rs, row) -> new Author(rs.getObject("id", UUID.class), rs.getString("name")), id)
                .stream().findFirst();
    }

    public AuthorPage list(int page, int size) {
        long total = jdbc.queryForObject("SELECT count(*) FROM authors", Long.class);
        var items = jdbc.query("SELECT id, name FROM authors ORDER BY name ASC, id ASC LIMIT ? OFFSET ?",
                (rs, row) -> new Author(rs.getObject("id", UUID.class), rs.getString("name")), size,
                (long) page * size);
        return new AuthorPage(items, total);
    }

    public boolean update(Author author) {
        return jdbc.update("UPDATE authors SET name = ? WHERE id = ?", author.name(), author.id()) == 1;
    }

    public boolean delete(UUID id) {
        return jdbc.update("DELETE FROM authors WHERE id = ?", id) == 1;
    }
}
