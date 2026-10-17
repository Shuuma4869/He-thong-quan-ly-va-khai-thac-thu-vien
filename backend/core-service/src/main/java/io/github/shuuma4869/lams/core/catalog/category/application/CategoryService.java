package io.github.shuuma4869.lams.core.catalog.category.application;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record CategoryPage(List<Category> items, PageMetadata page) {}
    private final CategoryRepository categories;
    private final AuthService identity;

    public CategoryService(CategoryRepository categories, AuthService identity) {
        this.categories = categories;
        this.identity = identity;
    }

    @Transactional
    public Category create(UUID actorId, String name) {
        requireStaff(actorId);
        String display = normalizeDisplay(name);
        try { return categories.create(new Category(UUID.randomUUID(), display), normalizeKey(display)); }
        catch (DataIntegrityViolationException duplicate) {
            throw new AuthFailure(409, "Tên thể loại đã tồn tại.");
        }
    }

    public Category get(UUID actorId, UUID id) { requireStaff(actorId); return find(id); }

    public CategoryPage list(UUID actorId, String pageValue, String sizeValue) {
        requireStaff(actorId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = categories.list(page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new CategoryPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional
    public Category update(UUID actorId, UUID id, String name) {
        requireStaff(actorId);
        find(id);
        String display = normalizeDisplay(name);
        try {
            if (!categories.update(new Category(id, display), normalizeKey(display)))
                throw new AuthFailure(404, "Không tìm thấy thể loại.");
        } catch (DataIntegrityViolationException duplicate) {
            throw new AuthFailure(409, "Tên thể loại đã tồn tại.");
        }
        return new Category(id, display);
    }

    @Transactional
    public void delete(UUID actorId, UUID id) {
        requireStaff(actorId);
        find(id);
        try {
            if (!categories.delete(id)) throw new AuthFailure(404, "Không tìm thấy thể loại.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể xóa thể loại đang được sách tham chiếu.");
        }
    }

    private Category find(UUID id) {
        return categories.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy thể loại."));
    }
    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(r -> r == RoleCode.LIBRARIAN || r == RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản lý thể loại.");
    }
    private static String normalizeDisplay(String value) {
        if (value == null || value.isBlank()) throw invalid("Tên thể loại không được để trống.");
        String name = Normalizer.normalize(value.trim().replaceAll("\\s+", " "), Normalizer.Form.NFKC);
        if (name.length() > 150) throw invalid("Tên thể loại không được vượt quá 150 ký tự.");
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
