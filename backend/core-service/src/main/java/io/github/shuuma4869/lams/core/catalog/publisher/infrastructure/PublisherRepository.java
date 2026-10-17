package io.github.shuuma4869.lams.core.catalog.publisher.infrastructure;

import io.github.shuuma4869.lams.core.catalog.publisher.domain.Publisher;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PublisherRepository {
    public record PublisherPage(List<Publisher> items, long totalElements) {}
    private final JdbcTemplate jdbc;

    public PublisherRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Publisher create(Publisher publisher) {
        jdbc.update("INSERT INTO publishers (id,name) VALUES (?,?)", publisher.id(), publisher.name());
        return publisher;
    }
    public Optional<Publisher> findById(UUID id) {
        return jdbc.query("SELECT id,name FROM publishers WHERE id=?",
                (rs, row) -> new Publisher(rs.getObject("id", UUID.class), rs.getString("name")), id)
                .stream().findFirst();
    }
    public PublisherPage list(int page, int size) {
        long total = jdbc.queryForObject("SELECT count(*) FROM publishers", Long.class);
        var items = jdbc.query("SELECT id,name FROM publishers ORDER BY name,id LIMIT ? OFFSET ?",
                (rs, row) -> new Publisher(rs.getObject("id", UUID.class), rs.getString("name")), size,
                (long) page * size);
        return new PublisherPage(items, total);
    }
    public boolean update(Publisher publisher) {
        return jdbc.update("UPDATE publishers SET name=? WHERE id=?", publisher.name(), publisher.id()) == 1;
    }
    public boolean delete(UUID id) { return jdbc.update("DELETE FROM publishers WHERE id=?", id) == 1; }
}
