package io.github.shuuma4869.lams.core.catalog.category.application;

import io.github.shuuma4869.lams.core.catalog.category.domain.Category;
import io.github.shuuma4869.lams.core.catalog.category.domain.CategoryAlias;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryAliasRepository;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryRepository;
import io.github.shuuma4869.lams.core.catalog.category.infrastructure.CategoryTermLock;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Internal Category alias management and canonical term resolver; no public HTTP API is exposed. */
@Service
public class CategoryAliasService {
    private final CategoryAliasRepository aliases;
    private final CategoryRepository categories;
    private final CategoryTermLock termLock;
    private final AuthService identity;

    public CategoryAliasService(CategoryAliasRepository aliases, CategoryRepository categories,
                                CategoryTermLock termLock, AuthService identity) {
        this.aliases = aliases;
        this.categories = categories;
        this.termLock = termLock;
        this.identity = identity;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public CategoryAlias create(UUID actorId, UUID categoryId, String aliasName) {
        requireStaff(actorId);
        var name = normalizeAlias(aliasName);
        termLock.acquire();
        requireCategory(categoryId);
        requireTermAvailable(name.normalized(), null);
        var alias = new CategoryAlias(UUID.randomUUID(), categoryId, name.display(), name.normalized());
        try {
            return aliases.create(alias);
        } catch (DataIntegrityViolationException conflict) {
            throw duplicateTerm();
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public CategoryAlias update(UUID actorId, UUID aliasId, UUID categoryId, String aliasName) {
        requireStaff(actorId);
        termLock.acquire();
        aliases.findById(aliasId).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy bí danh thể loại."));
        var name = normalizeAlias(aliasName);
        requireCategory(categoryId);
        requireTermAvailable(name.normalized(), aliasId);
        var alias = new CategoryAlias(aliasId, categoryId, name.display(), name.normalized());
        try {
            if (!aliases.update(alias)) throw new AuthFailure(404, "Không tìm thấy bí danh thể loại.");
        } catch (DataIntegrityViolationException conflict) {
            throw duplicateTerm();
        }
        return alias;
    }

    @Transactional(readOnly = true)
    public Category resolve(String value) {
        var name = normalizeAlias(value);
        List<Category> matches = aliases.findTermMatches(name.normalized());
        if (matches.isEmpty()) throw new AuthFailure(404, "Không tìm thấy thể loại cho tên đã nhập.");
        if (matches.size() > 1) throw new AuthFailure(409, "Tên thể loại khớp với nhiều Category chuẩn.");
        return matches.getFirst();
    }

    private void requireTermAvailable(String normalized, UUID exceptAliasId) {
        if (aliases.canonicalKeyExists(normalized) || aliases.aliasKeyExists(normalized, exceptAliasId)) {
            throw duplicateTerm();
        }
    }

    private void requireCategory(UUID categoryId) {
        if (categoryId == null || categories.findById(categoryId).isEmpty()) {
            throw new AuthFailure(404, "Không tìm thấy Category chuẩn.");
        }
    }

    private void requireStaff(UUID actorId) {
        var actor = identity.currentUser(actorId);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền quản lý bí danh thể loại.");
        }
    }

    private static AliasName normalizeAlias(String value) {
        String display = CatalogText.display(value);
        String normalized = CatalogText.key(display);
        if (display.isEmpty()) throw invalid("Tên bí danh không được để trống.");
        if (display.length() > 150 || normalized.length() > 150) {
            throw invalid("Tên bí danh không được vượt quá 150 ký tự sau chuẩn hóa.");
        }
        return new AliasName(display, normalized);
    }

    private static AuthFailure duplicateTerm() {
        return new AuthFailure(409, "Tên chuẩn hóa đã được dùng bởi Category hoặc bí danh khác.");
    }

    private static AuthFailure invalid(String message) {
        return new AuthFailure(422, message);
    }

    private record AliasName(String display, String normalized) {}
}
