package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import java.util.Base64;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(AuthIntegrationTest.ProtectedProbe.class)
class AuthIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("lams_core").withUsername("lams").withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "integration-test-secret-with-at-least-32-bytes");
    }

    @RestController
    static class ProtectedProbe {
        @GetMapping("/test-only/admin")
        @PreAuthorize("hasRole('ADMIN')")
        String admin() { return "ok"; }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private String email() { return "test-" + UUID.randomUUID() + "@example.test"; }

    private MvcResult register(String email) throws Exception {
        return mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(java.util.Map.of("fullName", "Nguyễn Thị Minh",
                        "email", email, "password", "correct-password-123"))))
                .andExpect(status().isCreated()).andReturn();
    }

    private JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    private String cookie(MvcResult result) {
        String header = result.getResponse().getHeader("Set-Cookie");
        assertThat(header).contains("HttpOnly", "SameSite=Lax", "Path=/api/v1/auth");
        return header.split(";", 2)[0].split("=", 2)[1];
    }
    private Cookie refreshCookie(String value) { return new Cookie("lams_refresh", value); }

    @Test
    void registrationPersistenceAndDuplicateConflict() throws Exception {
        String address = email();
        var created = register(address);
        var response = body(created);
        assertThat(response.has("refreshToken")).isFalse();
        assertThat(response.path("user").path("roles").get(0).asText()).isEqualTo("READER");
        assertThat(response.path("user").path("memberCode").asText()).startsWith("TV-");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE email_normalized=?", Integer.class, address)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT role_code FROM user_roles WHERE user_id=?", String.class,
                UUID.fromString(response.path("user").path("id").asText()))).isEqualTo("READER");
        String jwt = response.path("accessToken").asText();
        JsonNode claims = json.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
        assertThat(claims.path("sub").asText()).isEqualTo(response.path("user").path("id").asText());
        assertThat(claims.path("iss").asText()).isEqualTo("lams-core");
        assertThat(claims.path("email").asText()).isEqualTo(address);
        assertThat(claims.path("memberCode").asText()).isEqualTo(response.path("user").path("memberCode").asText());
        assertThat(claims.path("roles").get(0).asText()).isEqualTo("READER");
        assertThat(claims.has("jti") && claims.has("iat") && claims.has("exp")).isTrue();
        assertThat(claims.has("password") || claims.has("passwordHash") || claims.has("refreshToken")).isFalse();
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Another\",\"email\":\"" + address + "\",\"password\":\"correct-password-123\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.requestId").exists());
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Reader\",\"email\":\"" + email() + "\",\"password\":\"correct-password-123\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.user.roles[0]").value("READER"));
    }

    @Test
    void refreshTokenHashIsDeterministicAndNeverRaw() {
        String raw = "opaque-test-token";
        assertThat(AuthService.hash(raw)).hasSize(64).isEqualTo(AuthService.hash(raw)).isNotEqualTo(raw);
        assertThat(AuthService.hash(raw + "-different")).isNotEqualTo(AuthService.hash(raw));
    }

    @Test
    void loginMeRolesAndLockedAccount() throws Exception {
        var created = register(email());
        var user = body(created).path("user");
        for (String identifier : new String[]{user.path("email").asText(), user.path("memberCode").asText()}) {
            var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(java.util.Map.of("identifier", identifier,
                            "password", "correct-password-123", "remember", false))))
                    .andExpect(status().isOk()).andReturn();
            String jwt = body(login).path("accessToken").asText();
            mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + jwt))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(user.path("email").asText()));
            mvc.perform(get("/test-only/admin").header("Authorization", "Bearer " + jwt))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.requestId").exists());
        }
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.requestId").exists());
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"" + user.path("email").asText() + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Email/mã thành viên hoặc mật khẩu không đúng."));
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", UUID.fromString(user.path("id").asText()));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"" + user.path("email").asText() + "\",\"password\":\"correct-password-123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Email/mã thành viên hoặc mật khẩu không đúng."));
    }

    @Test
    void refreshRotationReuseAndLogout() throws Exception {
        String first = cookie(register(email()));
        var rotated = mvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(first)))
                .andExpect(status().isOk()).andReturn();
        String second = cookie(rotated);
        assertThat(second).isNotEqualTo(first);
        mvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(first)))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(second)))
                .andExpect(status().isUnauthorized());

        String fresh = cookie(register(email()));
        mvc.perform(post("/api/v1/auth/logout").cookie(refreshCookie(fresh)))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(fresh)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void concurrentRefreshDoesNotProduceTwoValidRotations() throws Exception {
        String old = cookie(register(email()));
        var gate = new CountDownLatch(1);
        var first = CompletableFuture.supplyAsync(() -> refreshAtGate(old, gate));
        var second = CompletableFuture.supplyAsync(() -> refreshAtGate(old, gate));
        gate.countDown();
        int successes = (first.get() == 200 ? 1 : 0) + (second.get() == 200 ? 1 : 0);
        assertThat(successes).isEqualTo(1);
    }

    private int refreshAtGate(String token, CountDownLatch gate) {
        try {
            gate.await();
            return mvc.perform(post("/api/v1/auth/refresh").cookie(refreshCookie(token)))
                    .andReturn().getResponse().getStatus();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
}
