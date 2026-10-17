package io.github.shuuma4869.lams.core.catalog.author.application;

import io.github.shuuma4869.lams.core.catalog.author.domain.Author;
import io.github.shuuma4869.lams.core.catalog.author.infrastructure.AuthorRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthorService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}

    public record AuthorPage(List<Author> items, PageMetadata page) {}

    private final AuthorRepository authors;
    private final AuthService identity;

    public AuthorService(AuthorRepository authors, AuthService identity) {
        this.authors = authors;
        this.identity = identity;
    }

    @Transactional
    public Author create(UUID actorId, String name) {
        requireStaff(actorId);
        return authors.create(new Author(UUID.randomUUID(), normalizeName(name)));
    }

    public Author get(UUID actorId, UUID authorId) {
        requireStaff(actorId);
        return find(authorId);
    }

    public AuthorPage list(UUID actorId, String pageValue, String sizeValue) {
        requireStaff(actorId);
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size < 1) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = authors.list(page, size);
        long totalPages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new AuthorPage(result.items(), new PageMetadata(page, size, result.totalElements(), totalPages));
    }

    @Transactional
    public Author update(UUID actorId, UUID authorId, String name) {
        requireStaff(actorId);
        String normalizedName = normalizeName(name);
        find(authorId);
        try {
            if (!authors.update(new Author(authorId, normalizedName))) {
                throw new AuthFailure(404, "Không tìm thấy tác giả.");
            }
        } catch (DataIntegrityViolationException conflict) {
            throw conflict("Không thể cập nhật tác giả vì dữ liệu đang được tham chiếu.");
        }
        return new Author(authorId, normalizedName);
    }

    @Transactional
    public void delete(UUID actorId, UUID authorId) {
        requireStaff(actorId);
        find(authorId);
        try {
            if (!authors.delete(authorId)) {
                throw new AuthFailure(404, "Không tìm thấy tác giả.");
            }
        } catch (DataIntegrityViolationException referenced) {
            throw conflict("Không thể xóa tác giả đang được sách tham chiếu.");
        }
    }

    private Author find(UUID authorId) {
        return authors.findById(authorId)
                .orElseThrow(() -> new AuthFailure(404, "Không tìm thấy tác giả."));
    }

    private void requireStaff(UUID actorId) {
        var actor = identity.currentUser(actorId);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền quản lý tác giả.");
        }
    }

    private static String normalizeName(String name) {
        if (name == null || name.isBlank()) throw invalid("Tên tác giả không được để trống.");
        String normalized = name.trim();
        if (normalized.length() > 200) throw invalid("Tên tác giả không được vượt quá 200 ký tự.");
        return normalized;
    }

    private static int parseInteger(String value, int defaultValue, int max, String field) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            int number = Integer.parseInt(value);
            if (number < 0 || number > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return number;
        } catch (NumberFormatException error) {
            throw invalid(field + " phải là số nguyên.");
        }
    }

    private static AuthFailure invalid(String message) {
        return new AuthFailure(422, message);
    }

    private static AuthFailure conflict(String message) {
        return new AuthFailure(409, message);
    }
}
