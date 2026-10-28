package io.github.shuuma4869.lams.core.identity.application;

import java.time.Instant;
import java.time.Duration;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
public class AccountCenterService {
    public record Account(UUID userId, String memberCode, String fullName, String email, String status,
                          String phone, String pendingEmail, Instant pendingEmailRequestedAt,
                          boolean emailVerificationEnabled) {}
    private record Locked(String email, String passwordHash, String status, String pendingEmail,
                          String codeHash, Instant expiresAt, int attempts, Instant requestedAt,
                          Instant windowStartedAt, int sendCount) {}
    private static final Pattern PHONE = Pattern.compile("^\\+[1-9][0-9]{7,14}$");
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final EmailVerificationSender sender;
    private final boolean emailVerificationEnabled;

    public AccountCenterService(JdbcTemplate jdbc, PasswordEncoder passwords, EmailVerificationSender sender,
            @Value("${lams.email.enabled:false}") boolean emailVerificationEnabled) {
        this.jdbc = jdbc; this.passwords = passwords; this.sender = sender;
        this.emailVerificationEnabled = emailVerificationEnabled;
    }

    public Account current(UUID actor) {
        Account account = jdbc.query("SELECT id,member_code,full_name,email,status,phone_e164,pending_email,"
                        + "pending_email_requested_at FROM users WHERE id=?", (rs, row) -> new Account(
                        rs.getObject("id", UUID.class), rs.getString("member_code"), rs.getString("full_name"),
                        rs.getString("email"), rs.getString("status"), rs.getString("phone_e164"),
                        rs.getString("pending_email"), rs.getTimestamp("pending_email_requested_at") == null
                                ? null : rs.getTimestamp("pending_email_requested_at").toInstant(),
                        emailVerificationEnabled), actor)
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
        if (!emailVerificationEnabled)
            throw new AuthFailure(503, "Chức năng gửi mã xác minh chưa được cấu hình.");
        Locked user = locked(actor);
        requirePassword(currentPassword, user.passwordHash());
        Instant now = Instant.now();
        if (user.requestedAt() != null && user.requestedAt().isAfter(now.minus(Duration.ofMinutes(1))))
            throw new AuthFailure(429, "Vui lòng chờ một phút trước khi yêu cầu mã mới.");
        boolean newWindow = user.windowStartedAt() == null
                || !user.windowStartedAt().isAfter(now.minus(Duration.ofHours(24)));
        if (!newWindow && user.sendCount() >= 5)
            throw new AuthFailure(429, "Bạn đã dùng hết lượt gửi mã trong 24 giờ. Vui lòng thử lại sau.");
        String normalized = email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320 || !normalized.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new AuthFailure(422, "Email mới không hợp lệ.");
        if (normalized.equals(user.email().toLowerCase(Locale.ROOT)))
            throw new AuthFailure(422, "Email mới cần khác email hiện tại.");
        StringBuilder code = new StringBuilder(12);
        for (int i = 0; i < 12; i++) code.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        try {
            jdbc.update("UPDATE users SET pending_email=?,pending_email_normalized=?,"
                    + "pending_email_requested_at=?,pending_email_code_hash=?,pending_email_expires_at=?,"
                    + "pending_email_attempts=0,email_verification_window_started_at=?,"
                    + "email_verification_send_count=?,updated_at=now() WHERE id=?",
                    normalized, normalized, Timestamp.from(now), passwords.encode(code.toString()),
                    Timestamp.from(now.plus(Duration.ofMinutes(15))),
                    Timestamp.from(newWindow ? now : user.windowStartedAt()), newWindow ? 1 : user.sendCount() + 1, actor);
            sender.send(normalized, code.toString());
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Không thể sử dụng địa chỉ email này.");
        }
        return current(actor);
    }

    @Transactional(noRollbackFor = AuthFailure.class)
    public void confirmEmail(UUID actor, String code) {
        Locked user = locked(actor);
        if (user.pendingEmail() == null || user.codeHash() == null || user.expiresAt() == null
                || !user.expiresAt().isAfter(Instant.now()) || user.attempts() >= 5)
            throw new AuthFailure(422, "Mã không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.");
        String normalizedCode = code == null ? "" : code.strip().toUpperCase(Locale.ROOT);
        if (!normalizedCode.matches("[A-HJ-NP-Z2-9]{12}") || !passwords.matches(normalizedCode, user.codeHash())) {
            jdbc.update("UPDATE users SET pending_email_attempts=pending_email_attempts+1 WHERE id=?", actor);
            throw new AuthFailure(422, "Mã không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.");
        }
        if (jdbc.queryForObject("SELECT count(*) FROM users WHERE email_normalized=? AND id<>?",
                Long.class, user.pendingEmail(), actor) > 0)
            throw new AuthFailure(409, "Không thể sử dụng địa chỉ email này.");
        try {
            jdbc.update("UPDATE users SET email=pending_email,email_normalized=pending_email_normalized,"
                    + "pending_email=NULL,pending_email_normalized=NULL,pending_email_requested_at=NULL,"
                    + "pending_email_code_hash=NULL,pending_email_expires_at=NULL,pending_email_attempts=0,"
                    + "credential_version=credential_version+1,updated_at=now() WHERE id=?", actor);
        } catch (DataIntegrityViolationException conflict) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            throw new AuthFailure(409, "Không thể sử dụng địa chỉ email này.");
        }
        jdbc.update("UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=? AND revoked_at IS NULL", actor);
    }

    @Transactional
    public void cancelEmail(UUID actor) {
        locked(actor);
        jdbc.update("UPDATE users SET pending_email=NULL,pending_email_normalized=NULL,"
                + "pending_email_requested_at=NULL,pending_email_code_hash=NULL,pending_email_expires_at=NULL,"
                + "pending_email_attempts=0,updated_at=now() WHERE id=?", actor);
    }

    private Locked locked(UUID actor) {
        Locked user = jdbc.query("SELECT email,password_hash,status,pending_email,pending_email_code_hash,"
                        + "pending_email_expires_at,pending_email_attempts,pending_email_requested_at,"
                        + "email_verification_window_started_at,email_verification_send_count FROM users WHERE id=? FOR UPDATE",
                (rs, row) -> new Locked(rs.getString("email"), rs.getString("password_hash"),
                        rs.getString("status"), rs.getString("pending_email"), rs.getString("pending_email_code_hash"),
                        rs.getTimestamp("pending_email_expires_at") == null ? null
                                : rs.getTimestamp("pending_email_expires_at").toInstant(), rs.getInt("pending_email_attempts"),
                        rs.getTimestamp("pending_email_requested_at") == null ? null
                                : rs.getTimestamp("pending_email_requested_at").toInstant(),
                        rs.getTimestamp("email_verification_window_started_at") == null ? null
                                : rs.getTimestamp("email_verification_window_started_at").toInstant(),
                        rs.getInt("email_verification_send_count")), actor).stream().findFirst()
                .orElseThrow(() -> new AuthFailure(401, "Phiên đăng nhập không hợp lệ."));
        if (!user.status().equals("ACTIVE")) throw new AuthFailure(403, "Tài khoản không còn hoạt động.");
        return user;
    }

    private void requirePassword(String supplied, String encoded) {
        if (supplied == null || !passwords.matches(supplied, encoded))
            throw new AuthFailure(403, "Mật khẩu hiện tại không đúng.");
    }
}
