package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class AccountCenterIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("account_center").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "account-center-secret-with-at-least-32-bytes");
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private String register(String email) throws Exception {
        var result = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Người đọc", "email", email,
                                "password", "CurrentPassword123"))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).path("accessToken").asText();
    }
    private String address() { return "account-" + UUID.randomUUID() + "@example.test"; }
    private String payload(Map<String, String> body) throws Exception { return json.writeValueAsString(body); }

    @Test void personalChangesStayWithinThePrincipalAndPhoneIsUnique() throws Exception {
        String firstEmail = address(), secondEmail = address();
        String first = register(firstEmail), second = register(secondEmail);
        mvc.perform(get("/api/v1/me/account")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/me/account").header("Authorization", "Bearer " + first)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("fullName", "  Nguyễn  Thị  Minh  ", "phone", "+84901234567"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Nguyễn Thị Minh"))
                .andExpect(jsonPath("$.phone").value("+84901234567"))
                .andExpect(jsonPath("$.email").value(firstEmail))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        mvc.perform(get("/api/v1/me/account").header("Authorization", "Bearer " + second))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phone").doesNotExist());
        mvc.perform(patch("/api/v1/me/account").header("Authorization", "Bearer " + second)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("fullName", "Người thứ hai", "phone", "+84901234567"))))
                .andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/me/account").header("Authorization", "Bearer " + first)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("fullName", "Người đọc", "phone", "0901234567"))))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test void passwordChangeRequiresCurrentPasswordAndRevokesRefreshTokens() throws Exception {
        String email = address(), token = register(email);
        String endpoint = "/api/v1/me/account/password";
        mvc.perform(post(endpoint).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("currentPassword", "incorrect", "newPassword", "AnotherPassword123"))))
                .andExpect(status().isForbidden());
        mvc.perform(post(endpoint).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("currentPassword", "CurrentPassword123", "newPassword", "AnotherPassword123"))))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/account").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id "
                + "WHERE u.email=? AND rt.revoked_at IS NULL", Long.class, email)).isZero();
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("identifier", email, "password", "CurrentPassword123"))))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("identifier", email, "password", "AnotherPassword123"))))
                .andExpect(status().isOk());
    }

    @Test void emailRequestNeverChangesLoginAddressWithoutVerification() throws Exception {
        String current = address(), proposed = address(), token = register(current);
        String endpoint = "/api/v1/me/account/email-request";
        mvc.perform(post(endpoint).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("currentPassword", "incorrect", "email", proposed))))
                .andExpect(status().isForbidden());
        mvc.perform(post(endpoint).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(Map.of("currentPassword", "CurrentPassword123", "email", proposed))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(current))
                .andExpect(jsonPath("$.pendingEmail").value(proposed));
        assertThat(jdbc.queryForObject("SELECT email FROM users WHERE email_normalized=?", String.class, current))
                .isEqualTo(current);
        mvc.perform(delete(endpoint).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/account").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pendingEmail").doesNotExist());
    }
}
