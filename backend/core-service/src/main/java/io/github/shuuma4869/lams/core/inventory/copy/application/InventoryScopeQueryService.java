package io.github.shuuma4869.lams.core.inventory.copy.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeCopy;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeFilter;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.InventoryScopeRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Read-only inventory scope queries. snapshot() materializes the complete scope inside one DB snapshot. */
@Service
public class InventoryScopeQueryService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record PageResult(List<InventoryScopeCopy> items, PageMetadata page) {}

    private final InventoryScopeRepository scopes;
    private final AuthService identity;
    private final int batchSize;

    public InventoryScopeQueryService(InventoryScopeRepository scopes, AuthService identity,
                                      @Value("${lams.inventory.scope-batch-size:500}") int batchSize) {
        if (batchSize < 1) throw new IllegalArgumentException("Inventory scope batch size must be positive.");
        this.scopes = scopes;
        this.identity = identity;
        this.batchSize = batchSize;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, propagation = Propagation.REQUIRES_NEW)
    public PageResult page(UUID actorId, InventoryScopeFilter requested, String pageValue, String sizeValue) {
        requireStaff(actorId);
        InventoryScopeFilter filter = validateFilter(requested);
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = scopes.page(filter, page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new PageResult(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    /**
     * Fully materializes the matching scope in keyset batches within one PostgreSQL REPEATABLE READ
     * transaction. The returned immutable list is safe to hand to a future audit-session command;
     * the transaction is closed before this method returns and must never span HTTP requests.
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, propagation = Propagation.REQUIRES_NEW)
    public List<InventoryScopeCopy> snapshot(UUID actorId, InventoryScopeFilter requested) {
        requireStaff(actorId);
        InventoryScopeFilter filter = validateFilter(requested);
        var result = new ArrayList<InventoryScopeCopy>();
        String afterBarcode = null;
        UUID afterId = null;
        while (true) {
            var batch = scopes.nextBatch(filter, afterBarcode, afterId, batchSize);
            result.addAll(batch);
            if (batch.size() < batchSize) break;
            var last = batch.get(batch.size() - 1);
            afterBarcode = last.barcode();
            afterId = last.copyId();
        }
        return Collections.unmodifiableList(result);
    }

    private InventoryScopeFilter validateFilter(InventoryScopeFilter filter) {
        if (filter.branchId() != null && !scopes.branchExists(filter.branchId())) {
            throw new AuthFailure(404, "Không tìm thấy chi nhánh.");
        }
        if (filter.editionId() != null && !scopes.editionExists(filter.editionId())) {
            throw new AuthFailure(404, "Không tìm thấy ấn bản.");
        }
        if (filter.shelfId() != null && !scopes.shelfExists(filter.shelfId())) {
            throw new AuthFailure(404, "Không tìm thấy kệ.");
        }
        String barcode = normalizeBarcodeFilter(filter.barcode());
        String status = normalizeStatusFilter(filter.status());
        return new InventoryScopeFilter(filter.branchId(), filter.editionId(), filter.shelfId(), barcode, status);
    }

    private void requireStaff(UUID actorId) {
        var actor = identity.currentUser(actorId);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền truy vấn kiểm kê.");
        }
    }

    private static String normalizeBarcodeFilter(String value) {
        if (value == null) return null;
        if (value.isBlank()) throw invalid("barcode không được để trống.");
        String barcode = value.trim();
        if (barcode.length() > 100) throw invalid("barcode không được vượt quá 100 ký tự.");
        return barcode;
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
