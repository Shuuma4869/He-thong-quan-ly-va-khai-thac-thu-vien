package io.github.shuuma4869.lams.core.inventory.copy.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.inventory.copy.domain.BookCopy;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.BookCopyRepository;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookCopyService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}

    public record CopyPage(List<BookCopy> items, PageMetadata page) {}

    private final BookCopyRepository copies;
    private final AuthService identity;
    private final JdbcTemplate jdbc;

    public BookCopyService(BookCopyRepository copies, AuthService identity, JdbcTemplate jdbc) {
        this.copies = copies;
        this.identity = identity;
        this.jdbc = jdbc;
    }

    @Transactional
    public BookCopy create(UUID actorId, UUID editionId, String barcode, UUID shelfId) {
        requireStaff(actorId);
        requireEdition(editionId);
        requireShelf(shelfId);
        var copy = new BookCopy(UUID.randomUUID(), editionId, null, null, shelfId, null, null,
                normalizeBarcode(barcode), "IN_PROCESS", 0);
        try {
            copies.create(copy);
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Mã vạch đã được sử dụng hoặc vị trí tham chiếu không hợp lệ.");
        }
        return find(copy.id());
    }

    public BookCopy get(UUID actorId, UUID copyId) {
        requireStaff(actorId);
        return find(copyId);
    }

    public CopyPage list(UUID actorId, UUID editionId, UUID shelfId, String statusValue,
                         String pageValue, String sizeValue) {
        requireStaff(actorId);
        if (editionId != null) requireEdition(editionId);
        if (shelfId != null) requireShelf(shelfId);
        String status = normalizeStatusFilter(statusValue);
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = copies.list(editionId, shelfId, status, page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new CopyPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional
    public BookCopy update(UUID actorId, UUID copyId, UUID editionId, String barcode, UUID shelfId, Long version) {
        requireStaff(actorId);
        BookCopy current = find(copyId);
        if (current.status().equals("ON_LOAN") || current.status().equals("ON_HOLD")) {
            throw new AuthFailure(409, "Không thể đổi thông tin bản sách đang được mượn hoặc giữ chỗ.");
        }
        if (version == null || version < 0) throw invalid("Version bản sách không hợp lệ.");
        if (version != current.version()) throw new AuthFailure(409, "Bản sách đã được cập nhật; hãy tải lại dữ liệu.");
        requireEdition(editionId);
        requireShelf(shelfId);
        var change = new BookCopy(copyId, editionId, null, null, shelfId, null, null,
                normalizeBarcode(barcode), current.status(), version);
        try {
            if (!copies.update(change, version)) {
                throw new AuthFailure(409, "Bản sách đã được cập nhật; hãy tải lại dữ liệu.");
            }
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Mã vạch đã được sử dụng hoặc vị trí tham chiếu không hợp lệ.");
        }
        return find(copyId);
    }

    private BookCopy find(UUID id) {
        return copies.find(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy bản sách."));
    }

    private void requireEdition(UUID id) {
        if (jdbc.queryForObject("SELECT count(*) FROM editions WHERE id=?", Integer.class, id) == 0) {
            throw new AuthFailure(404, "Không tìm thấy ấn bản.");
        }
    }

    private void requireShelf(UUID id) {
        if (jdbc.query("SELECT id FROM shelves WHERE id=? FOR UPDATE",
                (rs, row) -> rs.getObject(1), id).isEmpty()) {
            throw new AuthFailure(404, "Không tìm thấy kệ.");
        }
    }

    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền quản lý bản sách.");
        }
    }

    private static String normalizeBarcode(String barcode) {
        if (barcode == null || barcode.isBlank()) throw invalid("Mã vạch không được để trống.");
        String value = barcode.trim();
        if (value.length() > 100) throw invalid("Mã vạch không được vượt quá 100 ký tự.");
        return value;
    }

    private static String normalizeStatusFilter(String value) {
        if (value == null || value.isBlank()) return null;
        String status = value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("IN_PROCESS", "AVAILABLE", "ON_LOAN", "ON_HOLD", "LOST", "DAMAGED", "WITHDRAWN")
                .contains(status)) {
            throw invalid("Trạng thái bản sách không hợp lệ.");
        }
        return status;
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
