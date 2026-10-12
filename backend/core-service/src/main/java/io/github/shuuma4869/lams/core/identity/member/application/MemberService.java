package io.github.shuuma4869.lams.core.identity.member.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.identity.member.infrastructure.MemberRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class MemberService {
    public record ProfileMetadata(java.time.Instant createdAt, java.time.Instant updatedAt) {}

    public record CurrentProfile(UUID userId, String memberCode, String fullName, String email, String status,
                                 ProfileMetadata profile) {}

    public record MemberItem(UUID userId, String memberCode, String fullName, String status) {}

    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}

    public record MemberPage(List<MemberItem> items, PageMetadata page) {}

    private final MemberRepository members;

    public MemberService(MemberRepository members) {
        this.members = members;
    }

    public CurrentProfile current(UUID principalId) {
        var identity = members.findProfile(principalId)
                .orElseThrow(() -> new AuthFailure(401, "Phiên đăng nhập không hợp lệ."));
        if (identity.status() != UserStatus.ACTIVE) {
            throw new AuthFailure(403, "Tài khoản không còn hoạt động.");
        }
        // Identity owns all currently approved profile fields; no Member-specific profile data exists yet.
        return new CurrentProfile(identity.userId(), identity.memberCode(), identity.fullName(), identity.email(),
                identity.status().name(), null);
    }

    public MemberPage list(String query, String statusValue, String pageValue, String sizeValue, String sortValue) {
        String normalizedQuery = query == null ? null : query.trim();
        if (normalizedQuery != null && normalizedQuery.length() > 150) {
            throw invalid("query không được dài quá 150 ký tự.");
        }
        int page = parseInteger(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parseInteger(sizeValue, 20, 100, "size");
        if (size < 1) throw invalid("size phải nằm trong khoảng 1–100.");

        UserStatus status = null;
        if (statusValue != null && !statusValue.isBlank()) {
            try {
                status = UserStatus.valueOf(statusValue.trim().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException invalidStatus) {
                throw invalid("status chỉ nhận ACTIVE, LOCKED hoặc DISABLED.");
            }
        }

        String sort = sortValue == null || sortValue.isBlank() ? "memberCode,asc" : sortValue.trim();
        String[] parts = sort.split(",", -1);
        if (parts.length != 2 || !(parts[0].equals("memberCode") || parts[0].equals("fullName"))
                || !(parts[1].equalsIgnoreCase("asc") || parts[1].equalsIgnoreCase("desc"))) {
            throw invalid("sort chỉ nhận memberCode,asc|desc hoặc fullName,asc|desc.");
        }
        boolean ascending = parts[1].equalsIgnoreCase("asc");

        var result = members.search(normalizedQuery, status, page, size, parts[0], ascending);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        var items = result.items().stream().map(row -> new MemberItem(row.userId(), row.memberCode(), row.fullName(),
                row.status().name())).toList();
        return new MemberPage(items, new PageMetadata(page, size, result.totalElements(), pages));
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
}
