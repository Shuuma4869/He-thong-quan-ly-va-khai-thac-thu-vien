package io.github.shuuma4869.lams.core.catalog.book.infrastructure;

import io.github.shuuma4869.lams.core.catalog.book.domain.Book;
import io.github.shuuma4869.lams.core.catalog.book.domain.Book.RelatedItem;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class BookRepository {
    public record BookPage(List<Book> items, long totalElements) {}
    private final JdbcTemplate jdbc;

    public BookRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Book create(Book book, String normalizedTitle) {
        jdbc.update("INSERT INTO books(id,title,normalized_title,description) VALUES (?,?,?,?)",
                book.id(), book.title(), normalizedTitle, book.description());
        insertRelations(book.id(), book.authors(), book.categories());
        return book;
    }

    public Optional<Book> findById(UUID id) {
        return findBooks("WHERE id = ?", new Object[]{id}, null, null).stream().findFirst();
    }

    public BookPage list(int page, int size, String query, UUID authorId, UUID categoryId) {
        var args = new ArrayList<Object>();
        String where = "WHERE TRUE";
        if (!query.isEmpty()) {
            where += " AND normalized_title LIKE ? ESCAPE E'\\\\'";
            args.add("%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (authorId != null) {
            where += " AND EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id=books.id AND ba.author_id=?)";
            args.add(authorId);
        }
        if (categoryId != null) {
            where += " AND EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id=books.id AND bc.category_id=?)";
            args.add(categoryId);
        }
        long total = jdbc.queryForObject("SELECT count(*) FROM books " + where, Long.class, args.toArray());
        var books = findBooks(where, args.toArray(), size, (long) page * size);
        return new BookPage(books, total);
    }

    public boolean update(Book book, String normalizedTitle) {
        if (jdbc.update("UPDATE books SET title=?, normalized_title=?, description=?, updated_at=now() WHERE id=?",
                book.title(), normalizedTitle, book.description(), book.id()) != 1) return false;
        jdbc.update("DELETE FROM book_authors WHERE book_id=?", book.id());
        jdbc.update("DELETE FROM book_categories WHERE book_id=?", book.id());
        insertRelations(book.id(), book.authors(), book.categories());
        return true;
    }

    public boolean delete(UUID id) { return jdbc.update("DELETE FROM books WHERE id=?", id) == 1; }

    public List<RelatedItem> findAuthors(Set<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return jdbc.query("SELECT id,name FROM authors WHERE id IN (" + placeholders + ") ORDER BY name,id",
                (rs, row) -> new RelatedItem(rs.getObject("id", UUID.class), rs.getString("name")), ids.toArray());
    }

    public List<RelatedItem> findCategories(Set<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return jdbc.query("SELECT id,name FROM categories WHERE id IN (" + placeholders + ") ORDER BY normalized_name,id",
                (rs, row) -> new RelatedItem(rs.getObject("id", UUID.class), rs.getString("name")), ids.toArray());
    }

    private List<Book> findBooks(String where, Object[] parameters, Integer limit, Long offset) {
        String sql = "SELECT b.id,b.title,b.description,ba.author_id,a.name AS author_name,"
                + "bc.category_id,c.name AS category_name FROM (SELECT * FROM books " + where
                + " ORDER BY normalized_title,id" + (limit == null ? "" : " LIMIT ? OFFSET ?") + ") b "
                + "LEFT JOIN book_authors ba ON ba.book_id=b.id LEFT JOIN authors a ON a.id=ba.author_id "
                + "LEFT JOIN book_categories bc ON bc.book_id=b.id LEFT JOIN categories c ON c.id=bc.category_id "
                + "ORDER BY b.normalized_title,b.id,a.name,a.id,c.name,c.id";
        Object[] args = parameters;
        if (limit != null) {
            args = java.util.Arrays.copyOf(parameters, parameters.length + 2);
            args[args.length - 2] = limit;
            args[args.length - 1] = offset;
        }
        Object[] queryArgs = args;
        var grouped = new LinkedHashMap<UUID, BookAccumulator>();
        jdbc.query(sql, statement -> {
            for (int index = 0; index < queryArgs.length; index++) statement.setObject(index + 1, queryArgs[index]);
        }, rs -> {
            UUID id = rs.getObject("id", UUID.class);
            var accumulator = grouped.get(id);
            if (accumulator == null) {
                accumulator = new BookAccumulator(id, rs.getString("title"), rs.getString("description"));
                grouped.put(id, accumulator);
            }
            UUID authorId = rs.getObject("author_id", UUID.class);
            if (authorId != null) accumulator.authors.putIfAbsent(authorId,
                    new Book.RelatedItem(authorId, rs.getString("author_name")));
            UUID categoryId = rs.getObject("category_id", UUID.class);
            if (categoryId != null) accumulator.categories.putIfAbsent(categoryId,
                    new Book.RelatedItem(categoryId, rs.getString("category_name")));
        });
        return grouped.values().stream().map(BookAccumulator::toBook).toList();
    }

    private void insertRelations(UUID bookId, List<Book.RelatedItem> authors, List<Book.RelatedItem> categories) {
        for (var author : authors) jdbc.update("INSERT INTO book_authors(book_id,author_id) VALUES (?,?)", bookId, author.id());
        for (var category : categories) jdbc.update("INSERT INTO book_categories(book_id,category_id) VALUES (?,?)", bookId, category.id());
    }

    private static final class BookAccumulator {
        private final UUID id;
        private final String title;
        private final String description;
        private final Map<UUID, Book.RelatedItem> authors = new LinkedHashMap<>();
        private final Map<UUID, Book.RelatedItem> categories = new LinkedHashMap<>();
        private BookAccumulator(UUID id, String title, String description) {
            this.id = id; this.title = title; this.description = description;
        }
        private Book toBook() { return new Book(id, title, description,
                new ArrayList<>(authors.values()), new ArrayList<>(categories.values())); }
    }
}
