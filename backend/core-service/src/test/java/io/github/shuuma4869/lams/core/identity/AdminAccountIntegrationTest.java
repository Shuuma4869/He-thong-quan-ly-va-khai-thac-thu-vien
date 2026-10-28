package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.identity.application.AdminAccountService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class AdminAccountIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("account_admin").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "admin-accounts-secret-with-at-least-32-bytes");
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AdminAccountService accounts;

    private record User(UUID id, String email, String token) {}
    private User register() throws Exception {
        String email = "admin-test-" + UUID.randomUUID() + "@example.test";
        var response = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Người thử", "email", email,
                                "password", "CurrentPassword123"))))
                .andExpect(status().isCreated()).andReturn();
        var body = json.readTree(response.getResponse().getContentAsString());
        return new User(UUID.fromString(body.path("user").path("id").asText()), email,
                body.path("accessToken").asText());
    }
    private String login(User user) throws Exception {
        var response = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", user.email(),
                                "password", "CurrentPassword123"))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).path("accessToken").asText();
    }
    private String body(Map<String, ?> values) throws Exception { return json.writeValueAsString(values); }
    private String root(UUID target) { return "/api/v1/admin/accounts/" + target; }

    @Test void readerCannotInspectAccountsAndAdminCanFilterWithoutSensitiveFields() throws Exception {
        User admin = register(), reader = register();
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'ADMIN')", admin.id());
        String token = login(admin);
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", "Bearer " + reader.token()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", "Bearer " + token)
                        .param("query", reader.email()).param("status", "ACTIVE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(reader.id().toString()))
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist());
        mvc.perform(get(root(reader.id())).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", "Bearer " + token)
                        .param("query", "%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test void roleAndStatusChangesRevokeSessionsAndKeepAudit() throws Exception {
        User admin = register(), target = register();
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'ADMIN')", admin.id());
        String token = login(admin);
        mvc.perform(patch(root(target.id()) + "/roles/LIBRARIAN").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("expectedVersion", 0, "grant", true, "reason", "Phân công thủ thư"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.roles[0]").value("LIBRARIAN"));
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + target.token()))
                .andExpect(status().isUnauthorized());
        mvc.perform(patch(root(target.id()) + "/status").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("expectedVersion", 0, "status", "LOCKED", "reason", "Tạm khóa để kiểm tra"))))
                .andExpect(status().isConflict());
        mvc.perform(patch(root(target.id()) + "/status").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("expectedVersion", 1, "status", "LOCKED", "reason", "Tạm khóa để kiểm tra"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("LOCKED"))
                .andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(root(target.id()) + "/audit").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE user_id=? AND revoked_at IS NULL",
                Long.class, target.id())).isZero();
    }

    @Test void lastActiveAdminCannotRemoveOwnAccess() throws Exception {
        User admin = register();
        jdbc.update("DELETE FROM user_roles WHERE role_code='ADMIN' AND user_id<>?", admin.id());
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'ADMIN')", admin.id());
        String token = login(admin);
        mvc.perform(patch(root(admin.id()) + "/roles/ADMIN").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("expectedVersion", 0, "grant", false, "reason", "Thử thu hồi quyền"))))
                .andExpect(status().isConflict());
        mvc.perform(patch(root(admin.id()) + "/status").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("expectedVersion", 0, "status", "LOCKED", "reason", "Thử tự khóa tài khoản"))))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id=?", String.class, admin.id()))
                .isEqualTo("ACTIVE");
    }

    @Test void twoAdminsCannotOverwriteTheSameVersion() throws Exception {
        User first = register(), second = register(), target = register();
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'ADMIN'),(?,'ADMIN')",
                first.id(), second.id());
        CountDownLatch release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> grantAfter(release, first.id(), target.id(), "LIBRARIAN"));
            var b = pool.submit(() -> grantAfter(release, second.id(), target.id(), "ADMIN"));
            release.countDown();
            assertThat(a.get(10, TimeUnit.SECONDS) + b.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT admin_version FROM users WHERE id=?", Integer.class, target.id()))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM account_admin_audit WHERE target_id=?", Long.class, target.id()))
                .isEqualTo(1);
    }

    @Test void disabledEmailProviderDoesNotStoreADeadRequest() throws Exception {
        User reader = register();
        mvc.perform(get("/api/v1/me/account").header("Authorization", "Bearer " + reader.token()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.emailVerificationEnabled").value(false));
        mvc.perform(post("/api/v1/me/account/email-request").header("Authorization", "Bearer " + reader.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("currentPassword", "CurrentPassword123", "email", "new@example.test"))))
                .andExpect(status().isServiceUnavailable());
        assertThat(jdbc.queryForObject("SELECT pending_email FROM users WHERE id=?", String.class, reader.id()))
                .isNull();
    }

    private int grantAfter(CountDownLatch release, UUID actor, UUID target, String role) throws InterruptedException {
        release.await();
        try { accounts.changeRole(actor, target, 0, role, true, "Phân công thử nghiệm"); return 1; }
        catch (AuthFailure conflict) { return 0; }
    }
}
