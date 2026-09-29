package io.github.shuuma4869.lams.core.identity.application;

import io.github.shuuma4869.lams.core.identity.domain.IdentityUser;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.identity.infrastructure.IdentityRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AuthService {
    public record UserView(UUID id, String memberCode, String email, String fullName, List<RoleCode> roles) {}
    public record Session(String accessToken, Instant accessTokenExpiresAt, UserView user,
                          String refreshToken, Instant refreshTokenExpiresAt, boolean remember) {}

    private static final String INVALID_LOGIN = "Email/mã thành viên hoặc mật khẩu không đúng.";
    private final IdentityRepository repository;
    private final PasswordEncoder passwords;
    private final JwtEncoder jwt;
    private final TransactionTemplate transactions;
    private final SecureRandom random = new SecureRandom();
    private final Duration accessTtl;
    private final Duration refreshTtl;
    private final Duration rememberTtl;

    public AuthService(IdentityRepository repository, PasswordEncoder passwords, JwtEncoder jwt,
                       TransactionTemplate transactions,
                       @Value("${lams.auth.access-ttl}") Duration accessTtl,
                       @Value("${lams.auth.refresh-ttl}") Duration refreshTtl,
                       @Value("${lams.auth.remember-ttl}") Duration rememberTtl) {
        this.repository = repository;
        this.passwords = passwords;
        this.jwt = jwt;
        this.transactions = transactions;
        this.accessTtl = accessTtl;
        this.refreshTtl = refreshTtl;
        this.rememberTtl = rememberTtl;
    }

    @Transactional
    public Session register(String fullName, String email, String password) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        UUID id = UUID.randomUUID();
        String code = "TV-" + id.toString().replace("-", "").substring(0, 16).toUpperCase(Locale.ROOT);
        var user = new IdentityUser(id, code, normalized, fullName.trim(), passwords.encode(password),
                UserStatus.ACTIVE, List.of(RoleCode.READER));
        try {
            repository.createUser(user);
        } catch (DataIntegrityViolationException conflict) {
            throw new AuthFailure(409, "Email đã được sử dụng.");
        }
        return issueSession(user, UUID.randomUUID(), false);
    }

    @Transactional
    public Session login(String identifier, String password, boolean remember) {
        var user = repository.findByIdentifier(identifier.trim()).orElse(null);
        if (user == null || !passwords.matches(password, user.passwordHash()) || user.status() != UserStatus.ACTIVE)
            throw new AuthFailure(401, INVALID_LOGIN);
        return issueSession(user, UUID.randomUUID(), remember);
    }

    public Session refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw new AuthFailure(401, "Phiên đăng nhập không hợp lệ.");
        Session result = transactions.execute(tx -> {
            var old = repository.lockToken(hash(rawToken)).orElse(null);
            if (old == null) return null;
            Instant now = Instant.now();
            if (old.revokedAt() != null) {
                // Commit việc thu hồi cả family ngay cả khi request bị từ chối.
                repository.revokeFamily(old.familyId(), now);
                return null;
            }
            if (!old.expiresAt().isAfter(now)) return null;
            var user = repository.findById(old.userId()).orElse(null);
            if (user == null || user.status() != UserStatus.ACTIVE) {
                repository.revokeFamily(old.familyId(), now);
                return null;
            }
            UUID replacement = UUID.randomUUID();
            Session session = issueSession(user, old.familyId(), old.rememberMe(), replacement);
            repository.rotate(old, replacement, now);
            return session;
        });
        if (result == null) throw new AuthFailure(401, "Phiên đăng nhập không hợp lệ.");
        return result;
    }

    public void logout(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        transactions.executeWithoutResult(tx -> repository.lockToken(hash(rawToken))
                .ifPresent(token -> repository.revokeFamily(token.familyId(), Instant.now())));
    }

    public UserView currentUser(UUID id) {
        var user = repository.findById(id).orElseThrow(() -> new AuthFailure(401, "Phiên đăng nhập không hợp lệ."));
        if (user.status() != UserStatus.ACTIVE) throw new AuthFailure(403, "Tài khoản không còn hoạt động.");
        return view(user);
    }

    private Session issueSession(IdentityUser user, UUID family, boolean remember) {
        return issueSession(user, family, remember, UUID.randomUUID());
    }

    private Session issueSession(IdentityUser user, UUID family, boolean remember, UUID tokenId) {
        Instant now = Instant.now();
        Instant accessExpiry = now.plus(accessTtl);
        Instant refreshExpiry = now.plus(remember ? rememberTtl : refreshTtl);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        repository.createToken(tokenId, user.id(), family, hash(raw), now, refreshExpiry, remember);
        var claims = JwtClaimsSet.builder().issuer("lams-core").subject(user.id().toString())
                .issuedAt(now).expiresAt(accessExpiry).id(UUID.randomUUID().toString())
                .claim("email", user.email()).claim("memberCode", user.memberCode())
                .claim("roles", user.roles().stream().map(Enum::name).toList()).build();
        String access = jwt.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new Session(access, accessExpiry, view(user), raw, refreshExpiry, remember);
    }

    private static UserView view(IdentityUser user) {
        return new UserView(user.id(), user.memberCode(), user.email(), user.fullName(), user.roles());
    }

    public static String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
