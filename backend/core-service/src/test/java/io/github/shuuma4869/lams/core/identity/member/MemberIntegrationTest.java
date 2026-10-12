package io.github.shuuma4869.lams.core.identity.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class MemberIntegrationTest {
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

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private String email() { return "member-" + UUID.randomUUID() + "@example.test"; }

    private JsonNode register(String address, String fullName) throws Exception {
        var result = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", fullName, "email", address,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private String login(String address) throws Exception {
        var result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", address,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).path("accessToken").asText();
    }

    @Test
    void currentProfileUsesAuthenticatedPrincipalAndDoesNotWrite() throws Exception {
        String address = email();
        JsonNode registered = register(address, "Nguyễn Thị Minh");
        String userId = registered.path("user").path("id").asText();
        String token = registered.path("accessToken").asText();
        int usersBefore = jdbc.queryForObject("SELECT count(*) FROM users", Integer.class);
        int tokenRowsBefore = jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class);

        mvc.perform(get("/api/v1/me/profile").header("Authorization", "Bearer " + token)
                        .param("userId", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(userId))
                .andExpect(jsonPath("$.memberCode").value(registered.path("user").path("memberCode").asText()))
                .andExpect(jsonPath("$.fullName").value("Nguyễn Thị Minh"))
                .andExpect(jsonPath("$.email").value(address))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.profile").doesNotExist());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(usersBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class)).isEqualTo(tokenRowsBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.tables "
                + "WHERE table_schema='public' AND table_name='member_profiles'", Integer.class)).isZero();
    }

    @Test
    void currentProfileRequiresAuthenticationAndActiveIdentity() throws Exception {
        mvc.perform(get("/api/v1/me/profile")).andExpect(status().isUnauthorized());
        JsonNode registered = register(email(), "Reader");
        UUID userId = UUID.fromString(registered.path("user").path("id").asText());
        jdbc.update("UPDATE users SET status='DISABLED' WHERE id=?", userId);
        mvc.perform(get("/api/v1/me/profile").header("Authorization",
                        "Bearer " + registered.path("accessToken").asText()))
                .andExpect(status().isForbidden());
    }

    @Test
    void memberListIsStaffOnlyAndReturnsAllowlistedFields() throws Exception {
        mvc.perform(get("/api/v1/members")).andExpect(status().isUnauthorized());
        String readerEmail = email();
        JsonNode reader = register(readerEmail, "Reader Person");
        String readerToken = reader.path("accessToken").asText();
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isForbidden());

        UUID readerId = UUID.fromString(reader.path("user").path("id").asText());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", readerId);
        jdbc.update("INSERT INTO user_roles(user_id, role_code) VALUES (?, 'LIBRARIAN')", readerId);
        String staffToken = login(readerEmail);

        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + staffToken)
                        .param("query", "Reader Person"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].userId").value(readerId.toString()))
                .andExpect(jsonPath("$.items[0].fullName").value("Reader Person"))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.items[0].roles").doesNotExist())
                .andExpect(jsonPath("$.page.number").value(0))
                .andExpect(jsonPath("$.page.size").value(20))
                .andExpect(jsonPath("$.page.totalElements").value(1));
    }

    @Test
    void listFiltersPaginatesAndValidatesSortAndStatus() throws Exception {
        String staffEmail = email();
        JsonNode staff = register(staffEmail, "Library Staff");
        UUID staffId = UUID.fromString(staff.path("user").path("id").asText());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", staffId);
        jdbc.update("INSERT INTO user_roles(user_id, role_code) VALUES (?, 'ADMIN')", staffId);
        String token = login(staffEmail);
        register(email(), "Alpha Member");
        register(email(), "Beta Member");

        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("query", "Member").param("status", "ACTIVE").param("page", "0")
                        .param("size", "1").param("sort", "fullName,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].fullName").value("Alpha Member"))
                .andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.page.totalPages").value(2));

        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("size", "101"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("size", "0"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("page", "-1"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("query", "x".repeat(151)))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("status", "ROOT"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("sort", "member_code,asc"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void queryTreatsLikeWildcardsAsLiteral() throws Exception {
        String staffEmail = email();
        JsonNode staff = register(staffEmail, "Librarian");
        UUID staffId = UUID.fromString(staff.path("user").path("id").asText());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", staffId);
        jdbc.update("INSERT INTO user_roles(user_id, role_code) VALUES (?, 'LIBRARIAN')", staffId);
        String token = login(staffEmail);
        register(email(), "100% Reader");
        register(email(), "1000 Reader");

        mvc.perform(get("/api/v1/members").header("Authorization", "Bearer " + token)
                        .param("query", "100%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].fullName").value("100% Reader"));
    }
}
