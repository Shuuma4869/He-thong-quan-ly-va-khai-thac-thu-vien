package io.github.shuuma4869.lams.core.identity.member.infrastructure;

import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MemberRepository {
    public record IdentityProfile(UUID userId, String memberCode, String fullName, String email,
                                  UserStatus status) {}

    public record MemberRow(UUID userId, String memberCode, String fullName, UserStatus status) {}

    public record MemberPage(List<MemberRow> items, long totalElements) {}

    private final JdbcTemplate jdbc;

    public MemberRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<IdentityProfile> findProfile(UUID userId) {
        return jdbc.query("SELECT id, member_code, full_name, email, status FROM users WHERE id = ?",
                (rs, row) -> new IdentityProfile(rs.getObject("id", UUID.class), rs.getString("member_code"),
                        rs.getString("full_name"), rs.getString("email"),
                        UserStatus.valueOf(rs.getString("status"))), userId)
                .stream().findFirst();
    }

    public MemberPage search(String query, UserStatus status, int page, int size, String sortField,
                             boolean ascending) {
        StringBuilder where = new StringBuilder(" FROM users WHERE TRUE");
        var parameters = new java.util.ArrayList<Object>();
        if (query != null && !query.isBlank()) {
            String pattern = "%" + escapeLike(query) + "%";
            where.append(" AND (member_code ILIKE ? ESCAPE E'\\\\' OR full_name ILIKE ? ESCAPE E'\\\\')");
            parameters.add(pattern);
            parameters.add(pattern);
        }
        if (status != null) {
            where.append(" AND status = ?");
            parameters.add(status.name());
        }

        Long total = jdbc.queryForObject("SELECT count(*)" + where, Long.class, parameters.toArray());
        String orderBy = switch (sortField) {
            case "fullName" -> "full_name";
            default -> "member_code";
        };
        String direction = ascending ? "ASC" : "DESC";
        long offset = (long) page * size;
        var rows = jdbc.query("SELECT id, member_code, full_name, status" + where + " ORDER BY " + orderBy + " "
                        + direction + ", id ASC LIMIT ? OFFSET ?",
                (rs, row) -> new MemberRow(rs.getObject("id", UUID.class), rs.getString("member_code"),
                        rs.getString("full_name"), UserStatus.valueOf(rs.getString("status"))),
                append(parameters, size, offset));
        return new MemberPage(rows, total == null ? 0 : total);
    }

    private static Object[] append(List<Object> values, Object... tail) {
        var all = new java.util.ArrayList<>(values);
        java.util.Collections.addAll(all, tail);
        return all.toArray();
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
