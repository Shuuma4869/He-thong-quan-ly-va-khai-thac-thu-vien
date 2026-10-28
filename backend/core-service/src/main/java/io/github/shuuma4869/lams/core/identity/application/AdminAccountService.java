package io.github.shuuma4869.lams.core.identity.application;

import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminAccountService {
    public record Account(UUID id, String memberCode, String fullName, String email, String status,
                          List<String> roles, int version, Instant createdAt) {}
    public record Page(List<Account> items, int number, int size, long totalElements) {}
    public record Audit(UUID id, UUID actorId, UUID targetId, String action, String beforeValue,
                        String afterValue, String reason, int targetVersion, Instant createdAt) {}

    private final JdbcTemplate jdbc;
    private final AuthService auth;

    public AdminAccountService(JdbcTemplate jdbc, AuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    @Transactional(readOnly = true)
    public Page list(UUID actor, String query, String status, int page, int size) {
        requireAdmin(actor);
        if (page < 0 || page > 10000 || size < 1 || size > 100)
            throw new AuthFailure(422, "Trang hoặc số dòng không hợp lệ.");
        String normalizedStatus = validateStatusFilter(status);
        String term = query == null ? "" : query.strip();
        if (term.length() > 150) throw new AuthFailure(422, "Từ khóa không được quá 150 ký tự.");
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (!term.isEmpty()) {
            where.append(" AND (lower(u.member_code) LIKE ? ESCAPE '\\' OR lower(u.full_name) LIKE ? ESCAPE '\\'"
                    + " OR u.email_normalized LIKE ? ESCAPE '\\')");
            String pattern = "%" + term.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            args.add(pattern); args.add(pattern); args.add(pattern);
        }
        if (normalizedStatus != null) { where.append(" AND u.status=?"); args.add(normalizedStatus); }
        long total = jdbc.queryForObject("SELECT count(*) FROM users u" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(size); pageArgs.add(page * size);
        List<Account> items = jdbc.query("SELECT u.id,u.member_code,u.full_name,u.email,u.status,u.admin_version,"
                + "u.created_at,string_agg(ur.role_code,',' ORDER BY ur.role_code) AS roles FROM users u "
                + "LEFT JOIN user_roles ur ON ur.user_id=u.id" + where + " GROUP BY u.id "
                + "ORDER BY u.member_code,u.id LIMIT ? OFFSET ?", this::map, pageArgs.toArray());
        return new Page(items, page, size, total);
    }

    @Transactional(readOnly = true)
    public Account detail(UUID actor, UUID target) {
        requireAdmin(actor);
        return load(target);
    }

    @Transactional(readOnly = true)
    public List<Audit> audit(UUID actor, UUID target) {
        requireAdmin(actor);
        load(target);
        return jdbc.query("SELECT * FROM account_admin_audit WHERE target_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
                (rs, row) -> new Audit(rs.getObject("id", UUID.class), rs.getObject("actor_id", UUID.class),
                        rs.getObject("target_id", UUID.class), rs.getString("action"),
                        rs.getString("before_value"), rs.getString("after_value"), rs.getString("reason"),
                        rs.getInt("target_version"), rs.getTimestamp("created_at").toInstant()), target);
    }

    @Transactional
    public Account changeStatus(UUID actor, UUID target, int expectedVersion, String newStatus, String reason) {
        validateReason(reason);
        if (!"ACTIVE".equals(newStatus) && !"LOCKED".equals(newStatus))
            throw new AuthFailure(422, "Chỉ có thể khóa hoặc mở khóa tài khoản.");
        lockAdminMutation(actor);
        Account before = lockedTarget(target, expectedVersion);
        if (before.status().equals("DISABLED")) throw new AuthFailure(409, "Tài khoản đã ngừng sử dụng.");
        if (before.status().equals(newStatus)) return before;
        if (before.roles().contains("ADMIN") && "ACTIVE".equals(before.status()) && "LOCKED".equals(newStatus))
            requireAnotherActiveAdmin(target);
        jdbc.update("UPDATE users SET status=?,admin_version=admin_version+1,credential_version=credential_version+1,"
                + "updated_at=now() WHERE id=?", newStatus, target);
        revokeSessions(target);
        writeAudit(actor, target, "STATUS", before.status(), newStatus, reason, before.version() + 1);
        return load(target);
    }

    @Transactional
    public Account changeRole(UUID actor, UUID target, int expectedVersion, String roleValue,
                              boolean grant, String reason) {
        validateReason(reason);
        RoleCode role;
        try { role = RoleCode.valueOf(roleValue); }
        catch (RuntimeException invalid) { throw new AuthFailure(422, "Vai trò không hợp lệ."); }
        lockAdminMutation(actor);
        Account before = lockedTarget(target, expectedVersion);
        boolean existing = before.roles().contains(role.name());
        if (existing == grant) return before;
        if (!grant && before.roles().size() == 1)
            throw new AuthFailure(422, "Tài khoản cần giữ ít nhất một vai trò.");
        if (!grant && role == RoleCode.ADMIN && "ACTIVE".equals(before.status()))
            requireAnotherActiveAdmin(target);
        if (grant) jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,?)", target, role.name());
        else jdbc.update("DELETE FROM user_roles WHERE user_id=? AND role_code=?", target, role.name());
        jdbc.update("UPDATE users SET admin_version=admin_version+1,credential_version=credential_version+1,"
                + "updated_at=now() WHERE id=?", target);
        revokeSessions(target);
        writeAudit(actor, target, grant ? "ROLE_GRANT" : "ROLE_REVOKE", existing ? role.name() : "NONE",
                grant ? role.name() : "NONE", reason, before.version() + 1);
        return load(target);
    }

    private void lockAdminMutation(UUID actor) {
        // Serialize all admin mutations before locking a target row, including the last-admin check.
        jdbc.query("SELECT pg_advisory_xact_lock(671294, 1)", rs -> null);
        requireAdmin(actor);
    }

    private Account lockedTarget(UUID target, int expectedVersion) {
        boolean exists = !jdbc.query("SELECT id FROM users WHERE id=? FOR UPDATE",
                (rs, row) -> rs.getObject(1, UUID.class), target).isEmpty();
        if (!exists) throw new AuthFailure(404, "Không tìm thấy tài khoản.");
        Account account = load(target);
        if (account.version() != expectedVersion)
            throw new AuthFailure(409, "Tài khoản đã thay đổi. Hãy tải lại trước khi lưu.");
        return account;
    }

    private Account load(UUID target) {
        return jdbc.query("SELECT u.id,u.member_code,u.full_name,u.email,u.status,u.admin_version,u.created_at,"
                        + "string_agg(ur.role_code,',' ORDER BY ur.role_code) AS roles FROM users u "
                        + "LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE u.id=? GROUP BY u.id",
                this::map, target).stream().findFirst()
                .orElseThrow(() -> new AuthFailure(404, "Không tìm thấy tài khoản."));
    }

    private Account map(ResultSet rs, int row) throws SQLException {
        String roles = rs.getString("roles");
        return new Account(rs.getObject("id", UUID.class), rs.getString("member_code"),
                rs.getString("full_name"), rs.getString("email"), rs.getString("status"),
                roles == null ? List.of() : Arrays.asList(roles.split(",")), rs.getInt("admin_version"),
                rs.getTimestamp("created_at").toInstant());
    }

    private void requireAdmin(UUID actor) {
        if (!auth.currentUser(actor).roles().contains(RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản trị tài khoản.");
    }

    private void requireAnotherActiveAdmin(UUID target) {
        Long remaining = jdbc.queryForObject("SELECT count(*) FROM users u JOIN user_roles r ON r.user_id=u.id "
                + "WHERE r.role_code='ADMIN' AND u.status='ACTIVE' AND u.id<>?", Long.class, target);
        if (remaining == null || remaining == 0)
            throw new AuthFailure(409, "Không thể khóa hoặc thu hồi quyền của quản trị viên hoạt động cuối cùng.");
    }

    private void revokeSessions(UUID target) {
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=? AND revoked_at IS NULL", target);
    }

    private void writeAudit(UUID actor, UUID target, String action, String before, String after,
                            String reason, int version) {
        jdbc.update("INSERT INTO account_admin_audit(id,actor_id,target_id,action,before_value,after_value,reason,"
                + "target_version) VALUES (?,?,?,?,?,?,?,?)", UUID.randomUUID(), actor, target,
                action, before, after, reason.strip(), version);
    }

    private static void validateReason(String reason) {
        if (reason == null || reason.strip().length() < 5 || reason.strip().length() > 250
                || reason.chars().anyMatch(Character::isISOControl))
            throw new AuthFailure(422, "Lý do cần có từ 5 đến 250 ký tự hợp lệ.");
    }

    private static String validateStatusFilter(String status) {
        if (status == null || status.isBlank()) return null;
        String normalized = status.strip().toUpperCase(Locale.ROOT);
        if (!normalized.equals("ACTIVE") && !normalized.equals("LOCKED") && !normalized.equals("DISABLED"))
            throw new AuthFailure(422, "Trạng thái không hợp lệ.");
        return normalized;
    }
}
