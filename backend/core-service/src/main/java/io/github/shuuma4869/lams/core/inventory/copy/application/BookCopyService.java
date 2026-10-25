package io.github.shuuma4869.lams.core.inventory.copy.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.inventory.copy.domain.BookCopy;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeCopy;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeFilter;
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

    public record CopyPage(List<InventoryScopeCopy> items, PageMetadata page) {}

    private final BookCopyRepository copies;
    private final InventoryScopeQueryService inventoryScope;
    private final AuthService identity;
    private final JdbcTemplate jdbc;

    public BookCopyService(BookCopyRepository copies, InventoryScopeQueryService inventoryScope,
                           AuthService identity, JdbcTemplate jdbc) {
        this.copies = copies;
        this.inventoryScope = inventoryScope;
        this.identity = identity;
        this.jdbc = jdbc;
    }

    @Transactional
    public BookCopy create(UUID actorId, UUID editionId, String barcode, UUID shelfId) {
        requireStaff(actorId);
        requireEdition(editionId);
        lockShelf(shelfId);
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
    @Transactional(readOnly=true)
    public BookCopy byBarcode(UUID actorId,String barcode) {
        requireStaff(actorId);
        return copies.findBarcode(normalizeBarcode(barcode)).orElseThrow(()->new AuthFailure(404,"Không tìm thấy bản sách có mã vạch này."));
    }

    public CopyPage list(UUID actorId, UUID editionId, UUID shelfId, String statusValue,
                         String pageValue, String sizeValue) {
        return list(actorId, null, editionId, shelfId, null, statusValue, pageValue, sizeValue);
    }

    public CopyPage list(UUID actorId, UUID branchId, UUID editionId, UUID shelfId, String barcode,
                         String statusValue, String pageValue, String sizeValue) {
        var result = inventoryScope.page(actorId,
                new InventoryScopeFilter(branchId, editionId, shelfId, barcode, statusValue), pageValue, sizeValue);
        return new CopyPage(result.items(), new PageMetadata(result.page().number(), result.page().size(),
                result.page().totalElements(), result.page().totalPages()));
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
        // Lock only the destination; removing a copy cannot make a shelf nonempty.
        // Each maintenance transaction locks one shelf before updating its copy.
        lockShelf(shelfId);
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

    private void lockShelf(UUID id) {
        if (jdbc.query("SELECT id FROM shelves WHERE id=? FOR UPDATE",
                (rs, row) -> rs.getObject(1, UUID.class), id).isEmpty()) {
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

    private static AuthFailure invalid(String message) {
        return new AuthFailure(422, message);
    }
}
