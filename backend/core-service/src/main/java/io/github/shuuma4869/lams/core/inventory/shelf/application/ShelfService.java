package io.github.shuuma4869.lams.core.inventory.shelf.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.inventory.shelf.domain.Shelf;
import io.github.shuuma4869.lams.core.inventory.shelf.infrastructure.ShelfRepository;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShelfService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}

    public record ShelfPage(List<Shelf> items, PageMetadata page) {}

    private final ShelfRepository shelves;
    private final AuthService identity;
    private final JdbcTemplate jdbc;

    public ShelfService(ShelfRepository shelves, AuthService identity, JdbcTemplate jdbc) {
        this.shelves = shelves;
        this.identity = identity;
        this.jdbc = jdbc;
    }

    @Transactional
    public Shelf create(UUID actorId, UUID branchId, String code, String label, Integer sortOrder) {
        requireStaff(actorId);
        requireBranch(branchId);
        Shelf shelf = createModel(UUID.randomUUID(), branchId, code, label, sortOrder);
        try {
            return shelves.create(shelf);
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Mã kệ đã tồn tại trong chi nhánh này.");
        }
    }

    public Shelf get(UUID actorId, UUID shelfId) {
        requireStaff(actorId);
        return find(shelfId);
    }

    public ShelfPage list(UUID actorId, UUID branchId, String pageValue, String sizeValue) {
        requireStaff(actorId);
        if (branchId != null) requireBranch(branchId);
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = shelves.list(branchId, page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new ShelfPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional
    public Shelf update(UUID actorId, UUID shelfId, UUID branchId, String code, String label, Integer sortOrder) {
        requireStaff(actorId);
        Shelf current = shelves.findForUpdate(shelfId)
                .orElseThrow(() -> new AuthFailure(404, "Không tìm thấy kệ."));
        requireBranch(branchId);
        if (!current.branchId().equals(branchId)
                && jdbc.queryForObject("SELECT count(*) FROM book_copies WHERE shelf_id=?", Integer.class, shelfId) > 0) {
            throw new AuthFailure(409, "Không thể chuyển kệ còn bản sách sang chi nhánh khác.");
        }
        Shelf shelf = createModel(shelfId, branchId, code, label, sortOrder);
        try {
            if (!shelves.update(shelf)) throw new AuthFailure(404, "Không tìm thấy kệ.");
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Mã kệ đã tồn tại trong chi nhánh này hoặc kệ đang được bản sách tham chiếu.");
        }
        return find(shelfId);
    }

    private Shelf createModel(UUID id, UUID branchId, String code, String label, Integer sortOrder) {
        String normalizedCode = normalize(code, 30, "Mã kệ").toUpperCase(Locale.ROOT);
        String normalizedLabel = normalize(label, 150, "Nhãn kệ");
        if (sortOrder != null && sortOrder < 0) throw invalid("Thứ tự kệ không được âm.");
        String branchCode = jdbc.query("SELECT code FROM branches WHERE id=?",
                rs -> rs.next() ? rs.getString(1) : null, branchId);
        return new Shelf(id, branchId, branchCode, normalizedCode, normalizedLabel,
                sortOrder == null ? 0 : sortOrder);
    }

    private void requireBranch(UUID branchId) {
        if (jdbc.queryForObject("SELECT count(*) FROM branches WHERE id=?", Integer.class, branchId) == 0) {
            throw new AuthFailure(404, "Không tìm thấy chi nhánh.");
        }
    }

    private Shelf find(UUID id) {
        return shelves.find(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy kệ."));
    }

    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền quản lý kệ.");
        }
    }

    private static String normalize(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) throw invalid(field + " không được để trống.");
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw invalid(field + " vượt quá giới hạn độ dài.");
        return normalized;
    }

    private static int parseInteger(String value, int defaultValue, int max, String field) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 0 || parsed > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return parsed;
        } catch (NumberFormatException error) {
            throw invalid(field + " phải là số nguyên.");
        }
    }

    private static AuthFailure invalid(String message) {
        return new AuthFailure(422, message);
    }
}
