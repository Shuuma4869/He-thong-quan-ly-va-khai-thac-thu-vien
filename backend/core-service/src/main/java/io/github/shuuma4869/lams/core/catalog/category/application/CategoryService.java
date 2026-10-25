package io.github.shuuma4869.lams.core.catalog.category.application;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryAliasRepository;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryRepository;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryTermLock;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record CategoryPage(List<Category> items, PageMetadata page) {}
    private final CategoryRepository categories;
    private final CategoryAliasRepository aliases;
    private final CategoryTermLock termLock;
    private final AuthService identity;

    public CategoryService(CategoryRepository categories, CategoryAliasRepository aliases,
                           CategoryTermLock termLock, AuthService identity) {
        this.categories = categories;
        this.aliases = aliases;
        this.termLock = termLock;
        this.identity = identity;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Category create(UUID actorId, String name) {
        requireStaff(actorId);
        String display = normalizeDisplay(name);
        String normalized = normalizeKey(display);
        termLock.acquire();
        ensureNoAliasCollision(normalized);
        try { return categories.create(new Category(UUID.randomUUID(), display), normalized); }
        catch (DataIntegrityViolationException duplicate) {
            throw new AuthFailure(409, "Tên thể loại đã tồn tại.");
        }
    }

    public Category get(UUID actorId, UUID id) { CatalogAccess.requireReader(identity, actorId); return find(id); }

    public CategoryPage list(UUID actorId, String pageValue, String sizeValue) {
        CatalogAccess.requireReader(identity, actorId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = categories.list(page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new CategoryPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Category update(UUID actorId, UUID id, String name) {
        requireStaff(actorId);
        find(id);
        String display = normalizeDisplay(name);
        String normalized = normalizeKey(display);
        termLock.acquire();
        ensureNoAliasCollision(normalized);
        try {
            if (!categories.update(new Category(id, display), normalized))
                throw new AuthFailure(404, "Không tìm thấy thể loại.");
        } catch (DataIntegrityViolationException duplicate) {
            throw new AuthFailure(409, "Tên thể loại đã tồn tại.");
        }
        return new Category(id, display);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void delete(UUID actorId, UUID id) {
        requireStaff(actorId);
        find(id);
        termLock.acquire();
        try {
            if (!categories.delete(id)) throw new AuthFailure(404, "Không tìm thấy thể loại.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể xóa thể loại đang được sách hoặc bí danh tham chiếu.");
        }
    }

    private Category find(UUID id) {
        return categories.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy thể loại."));
    }
    private void ensureNoAliasCollision(String normalizedName) {
        if (aliases.aliasKeyExists(normalizedName, null)) {
            throw new AuthFailure(409, "Tên thể loại đã được dùng làm bí danh.");
        }
    }
    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(r -> r == RoleCode.LIBRARIAN || r == RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản lý thể loại.");
    }
    private static String normalizeDisplay(String value) {
        String name = CatalogText.display(value);
        if (name.isEmpty()) throw invalid("Tên thể loại không được để trống.");
        if (name.length() > 150 || normalizeKey(name).length() > 150)
            throw invalid("Tên thể loại không được vượt quá 150 ký tự sau chuẩn hóa.");
        return name;
    }
    private static String normalizeKey(String value) { return value.toLowerCase(Locale.ROOT); }
    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 0 || parsed > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return parsed;
        } catch (NumberFormatException error) { throw invalid(field + " phải là số nguyên."); }
    }
    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
}
