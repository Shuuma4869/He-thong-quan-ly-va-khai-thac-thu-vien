package io.github.shuuma4869.lams.core.catalog.book.application;

import io.github.shuuma4869.lams.core.catalog.book.domain.Book;
import io.github.shuuma4869.lams.core.catalog.book.domain.Book.RelatedItem;
import io.github.shuuma4869.lams.core.catalog.book.infrastructure.BookRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record BookPage(List<Book> items, PageMetadata page) {}
    private final BookRepository books;
    private final AuthService identity;

    public BookService(BookRepository books, AuthService identity) {
        this.books = books;
        this.identity = identity;
    }

    @Transactional
    public Book create(UUID actorId, String title, String description, List<UUID> authorIds,
                       List<UUID> categoryIds) {
        requireStaff(actorId);
        var authors = resolve(authorIds, true);
        var categories = resolve(categoryIds, false);
        String displayTitle = normalizeTitle(title);
        UUID id = UUID.randomUUID();
        var book = new Book(id, displayTitle, normalizeDescription(description), authors, categories);
        try {
            return books.create(book, normalizedTitle(displayTitle));
        } catch (DataIntegrityViolationException invalidRelation) {
            throw new AuthFailure(404, "Không tìm thấy tác giả hoặc thể loại được chọn.");
        }
    }

    public Book get(UUID actorId, UUID bookId) {
        CatalogAccess.requireReader(identity, actorId);
        return find(bookId);
    }

    public BookPage list(UUID actorId, String pageValue, String sizeValue) {
        return list(actorId, pageValue, sizeValue, null, null, null);
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public BookPage list(UUID actorId, String pageValue, String sizeValue, String query,
                         String authorId, String categoryId) {
        CatalogAccess.requireReader(identity, actorId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        String term = CatalogText.key(query);
        if (term.length() > 500) throw invalid("Từ khóa không được vượt quá 500 ký tự.");
        var result = books.list(page, size, term, filterId(authorId, "authorId"), filterId(categoryId, "categoryId"));
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new BookPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional
    public Book update(UUID actorId, UUID id, String title, String description, List<UUID> authorIds,
                       List<UUID> categoryIds) {
        requireStaff(actorId);
        find(id);
        var authors = resolve(authorIds, true);
        var categories = resolve(categoryIds, false);
        String displayTitle = normalizeTitle(title);
        String normalizedTitle = normalizedTitle(displayTitle);
        var updated = new Book(id, displayTitle, normalizeDescription(description), authors, categories);
        try {
            if (!books.update(updated, normalizedTitle)) throw new AuthFailure(404, "Không tìm thấy sách.");
        } catch (DataIntegrityViolationException invalidRelation) {
            throw new AuthFailure(404, "Không tìm thấy tác giả hoặc thể loại được chọn.");
        }
        return updated;
    }

    @Transactional
    public void delete(UUID actorId, UUID id) {
        requireStaff(actorId);
        find(id);
        try {
            if (!books.delete(id)) throw new AuthFailure(404, "Không tìm thấy sách.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể xóa sách đang có ấn bản hoặc nghiệp vụ tham chiếu.");
        }
    }

    private List<RelatedItem> resolve(List<UUID> requested, boolean author) {
        if (requested == null) return List.of();
        if (requested.size() > 100) throw invalid("Mỗi sách chỉ được gắn tối đa 100 mục quan hệ.");
        Set<UUID> ids = new LinkedHashSet<>(requested);
        return author ? verify(ids, books.findAuthors(ids), "tác giả")
                : verify(ids, books.findCategories(ids), "thể loại");
    }

    private static List<RelatedItem> verify(Set<UUID> requested, List<RelatedItem> found, String entity) {
        if (found.size() != requested.size()) throw new AuthFailure(404, "Không tìm thấy " + entity + " được chọn.");
        return found;
    }

    private Book find(UUID id) {
        return books.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy sách."));
    }

    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản lý sách.");
    }

    private static String normalizeTitle(String value) {
        String title = CatalogText.display(value);
        if (title.isEmpty()) throw invalid("Tên sách không được để trống.");
        if (title.length() > 500) throw invalid("Tên sách không được vượt quá 500 ký tự.");
        return title;
    }

    private static String normalizedTitle(String value) {
        return value.toLowerCase(Locale.ROOT);
    }

    private static String normalizeDescription(String description) {
        if (description == null) return null;
        String normalized = description.trim();
        if (normalized.length() > 10000) throw invalid("Mô tả không được vượt quá 10000 ký tự.");
        return normalized.isEmpty() ? null : normalized;
    }

    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 0 || parsed > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return parsed;
        } catch (NumberFormatException error) { throw invalid(field + " phải là số nguyên."); }
    }

    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }

    private static UUID filterId(String value, String field) {
        if (value == null) return null;
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return id;
        } catch (IllegalArgumentException error) { throw invalid(field + " phải là UUID hợp lệ."); }
    }
}
