package io.github.shuuma4869.lams.core.inventory.branch.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.inventory.branch.domain.Branch;
import io.github.shuuma4869.lams.core.inventory.branch.infrastructure.BranchRepository;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BranchService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}

    public record BranchPage(List<Branch> items, PageMetadata page) {}

    private final BranchRepository branches;
    private final AuthService identity;

    public BranchService(BranchRepository branches, AuthService identity) {
        this.branches = branches;
        this.identity = identity;
    }

    @Transactional
    public Branch create(UUID actorId, String code, String name, String statusValue) {
        requireStaff(actorId);
        var branch = new Branch(UUID.randomUUID(), normalizeCode(code), normalize(name, 200, "tên chi nhánh"),
                normalizeStatus(statusValue));
        try {
            return branches.create(branch);
        } catch (DataIntegrityViolationException duplicate) {
            throw new AuthFailure(409, "Mã chi nhánh đã tồn tại.");
        }
    }

    public Branch get(UUID actorId, UUID branchId) {
        requireStaff(actorId);
        return find(branchId);
    }

    public BranchPage list(UUID actorId, String pageValue, String sizeValue) {
        requireStaff(actorId);
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = branches.list(page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new BranchPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }

    @Transactional
    public Branch update(UUID actorId, UUID branchId, String code, String name, String statusValue) {
        requireStaff(actorId);
        find(branchId);
        var branch = new Branch(branchId, normalizeCode(code), normalize(name, 200, "tên chi nhánh"),
                normalizeStatus(statusValue));
        try {
            if (!branches.update(branch)) throw new AuthFailure(404, "Không tìm thấy chi nhánh.");
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Mã chi nhánh đã tồn tại.");
        }
        return branch;
    }

    private Branch find(UUID id) {
        return branches.find(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy chi nhánh."));
    }

    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền quản lý chi nhánh.");
        }
    }

    private static String normalize(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) throw invalid("Tên hoặc mã không được để trống.");
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw invalid("Độ dài " + field + " vượt giới hạn.");
        return normalized;
    }

    private static String normalizeCode(String code) {
        return normalize(code, 30, "mã chi nhánh").toUpperCase(Locale.ROOT);
    }

    private static String normalizeStatus(String value) {
        String status = value == null || value.isBlank() ? "ACTIVE" : value.trim().toUpperCase(Locale.ROOT);
        if (!status.equals("ACTIVE") && !status.equals("DISABLED")) {
            throw invalid("Trạng thái chi nhánh chỉ nhận ACTIVE hoặc DISABLED.");
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
