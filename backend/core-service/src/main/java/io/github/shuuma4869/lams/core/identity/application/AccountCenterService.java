package io.github.shuuma4869.lams.core.identity.application;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountCenterService {
    public record Account(UUID userId, String memberCode, String fullName, String email, String status,
                          String phone, String pendingEmail, Instant pendingEmailRequestedAt) {}
    private record Locked(String email, String passwordHash, String status) {}
    private static final Pattern PHONE = Pattern.compile("^\\+[1-9][0-9]{7,14}$");
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;

    public AccountCenterService(JdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc; this.passwords = passwords;
    }

    public Account current(UUID actor) {
        Account account = jdbc.query("SELECT id,member_code,full_name,email,status,phone_e164,pending_email,"
                        + "pending_email_requested_at FROM users WHERE id=?", (rs, row) -> new Account(
                        rs.getObject("id", UUID.class), rs.getString("member_code"), rs.getString("full_name"),
                        rs.getString("email"), rs.getString("status"), rs.getString("phone_e164"),
                        rs.getString("pending_email"), rs.getTimestamp("pending_email_requested_at") == null
                                ? null : rs.getTimestamp("pending_email_requested_at").toInstant()), actor)
                .stream().findFirst().orElseThrow(() -> new AuthFailure(401, "Phiên đăng nhập không hợp lệ."));
        if (!account.status().equals("ACTIVE")) throw new AuthFailure(403, "Tài khoản không còn hoạt động.");
        return account;
    }

    @Transactional
    public Account update(UUID actor, String fullName, String phone) {
        locked(actor);
        String name = fullName == null ? "" : fullName.strip().replaceAll("\\s+", " ");
        if (name.isBlank() || name.length() > 150 || name.chars().anyMatch(Character::isISOControl))
            throw new AuthFailure(422, "Họ tên phải có từ 1 đến 150 ký tự hợp lệ.");
        String normalizedPhone = phone == null || phone.isBlank() ? null : phone.strip();
        if (normalizedPhone != null && !PHONE.matcher(normalizedPhone).matches())
            throw new AuthFailure(422, "Số điện thoại cần có mã quốc gia, ví dụ +84901234567.");
        try {
            jdbc.update("UPDATE users SET full_name=?,phone_e164=?,updated_at=now() WHERE id=?", name, normalizedPhone, actor);
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Số điện thoại đã được sử dụng.");
        }
        return current(actor);
    }

    @Transactional
    public void changePassword(UUID actor, String currentPassword, String newPassword) {
        Locked user = locked(actor);
        requirePassword(currentPassword, user.passwordHash());
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 128
                || !newPassword.matches("(?s).*\\p{L}.*") || !newPassword.matches("(?s).*\\d.*"))
            throw new AuthFailure(422, "Mật khẩu mới cần 12–128 ký tự, có chữ và số.");
        if (passwords.matches(newPassword, user.passwordHash()))
            throw new AuthFailure(422, "Mật khẩu mới cần khác mật khẩu hiện tại.");
        jdbc.update("UPDATE users SET password_hash=?,credential_version=credential_version+1,updated_at=now() WHERE id=?",
                passwords.encode(newPassword), actor);
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=? AND revoked_at IS NULL", actor);
    }

    @Transactional
    public Account requestEmail(UUID actor, String currentPassword, String email) {
        Locked user = locked(actor);
        requirePassword(currentPassword, user.passwordHash());
        String normalized = email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320 || !normalized.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new AuthFailure(422, "Email mới không hợp lệ.");
        if (normalized.equals(user.email().toLowerCase(Locale.ROOT)))
            throw new AuthFailure(422, "Email mới cần khác email hiện tại.");
        if (jdbc.queryForObject("SELECT count(*) FROM users WHERE email_normalized=?", Long.class, normalized) > 0)
            throw new AuthFailure(409, "Email đã được sử dụng.");
        try {
            jdbc.update("UPDATE users SET pending_email=?,pending_email_normalized=?,"
                    + "pending_email_requested_at=now(),updated_at=now() WHERE id=?", normalized, normalized, actor);
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Email đã được sử dụng.");
        }
        return current(actor);
    }

    @Transactional
    public void cancelEmail(UUID actor) {
        locked(actor);
        jdbc.update("UPDATE users SET pending_email=NULL,pending_email_normalized=NULL,"
                + "pending_email_requested_at=NULL,updated_at=now() WHERE id=?", actor);
    }

    private Locked locked(UUID actor) {
        Locked user = jdbc.query("SELECT email,password_hash,status FROM users WHERE id=? FOR UPDATE",
                (rs, row) -> new Locked(rs.getString("email"), rs.getString("password_hash"),
                        rs.getString("status")), actor).stream().findFirst()
                .orElseThrow(() -> new AuthFailure(401, "Phiên đăng nhập không hợp lệ."));
        if (!user.status().equals("ACTIVE")) throw new AuthFailure(403, "Tài khoản không còn hoạt động.");
        return user;
    }

    private void requirePassword(String supplied, String encoded) {
        if (supplied == null || !passwords.matches(supplied, encoded))
            throw new AuthFailure(403, "Mật khẩu hiện tại không đúng.");
    }
}
