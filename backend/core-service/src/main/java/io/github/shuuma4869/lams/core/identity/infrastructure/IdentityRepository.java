package io.github.shuuma4869.lams.core.identity.infrastructure;

import io.github.shuuma4869.lams.core.identity.domain.IdentityUser;
import io.github.shuuma4869.lams.core.identity.domain.RefreshToken;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IdentityRepository {
    private final JdbcTemplate jdbc;

    public IdentityRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void createUser(IdentityUser user) {
        var now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)", user.id(), user.memberCode(), user.email(),
                user.email().toLowerCase(java.util.Locale.ROOT), user.fullName(), user.passwordHash(),
                user.status().name(), now, now);
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,?)", user.id(), RoleCode.READER.name());
    }

    public Optional<IdentityUser> findByIdentifier(String identifier) {
        var users = jdbc.query("SELECT * FROM users WHERE email_normalized=? OR member_code=?",
                (rs, row) -> mapUser(rs), identifier.toLowerCase(java.util.Locale.ROOT),
                identifier.toUpperCase(java.util.Locale.ROOT));
        return users.stream().findFirst();
    }

    public Optional<IdentityUser> findById(UUID id) {
        return jdbc.query("SELECT * FROM users WHERE id=?", (rs, row) -> mapUser(rs), id).stream().findFirst();
    }

    private IdentityUser mapUser(ResultSet rs) throws SQLException {
        UUID id = rs.getObject("id", UUID.class);
        List<RoleCode> roles = jdbc.query("SELECT role_code FROM user_roles WHERE user_id=? ORDER BY role_code",
                (r, row) -> RoleCode.valueOf(r.getString(1)), id);
        return new IdentityUser(id, rs.getString("member_code"), rs.getString("email"), rs.getString("full_name"),
                rs.getString("password_hash"), UserStatus.valueOf(rs.getString("status")), roles);
    }

    public void createToken(UUID id, UUID userId, UUID familyId, String hash, Instant created, Instant expires,
                            boolean remember) {
        jdbc.update("INSERT INTO refresh_tokens(id,user_id,family_id,token_hash,created_at,expires_at,remember_me) "
                        + "VALUES (?,?,?,?,?,?,?)", id, userId, familyId, hash, Timestamp.from(created),
                Timestamp.from(expires), remember);
    }

    public Optional<RefreshToken> lockToken(String hash) {
        return jdbc.query("SELECT * FROM refresh_tokens WHERE token_hash=? FOR UPDATE", (rs, row) ->
                new RefreshToken(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getObject("family_id", UUID.class), rs.getTimestamp("expires_at").toInstant(),
                        rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant(),
                        rs.getObject("replaced_by_token_id", UUID.class), rs.getBoolean("remember_me")), hash)
                .stream().findFirst();
    }

    public void rotate(RefreshToken old, UUID replacement, Instant now) {
        jdbc.update("UPDATE refresh_tokens SET revoked_at=?, replaced_by_token_id=? WHERE id=? AND revoked_at IS NULL",
                Timestamp.from(now), replacement, old.id());
    }

    public void revokeFamily(UUID familyId, Instant now) {
        jdbc.update("UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL",
                Timestamp.from(now), familyId);
    }
}
