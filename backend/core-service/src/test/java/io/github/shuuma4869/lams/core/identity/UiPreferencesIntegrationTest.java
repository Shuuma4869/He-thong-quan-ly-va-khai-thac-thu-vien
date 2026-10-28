package io.github.shuuma4869.lams.core.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class UiPreferencesIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("ui_preferences").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "ui-preferences-test-secret-with-32-bytes");
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String register() throws Exception {
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                        "fullName", "Người đọc", "email", "appearance-" + UUID.randomUUID() + "@example.test",
                        "password", "CurrentPassword123")))).andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private String update(int revision, Map<String, Object> values) throws Exception {
        return json.writeValueAsString(Map.of("schemaVersion", 1, "revision", revision, "values", values));
    }

    @Test void preferencesBelongToAccountAndRejectUnknownValuesAndStaleRevision() throws Exception {
        String first = register(), second = register();
        mvc.perform(get("/api/v1/me/ui-preferences")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(0));
        mvc.perform(put("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON).content(update(0, Map.of("accent", "teal", "widgets", java.util.List.of("inventory")))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + second))
                .andExpect(status().isOk()).andExpect(jsonPath("$.values.accent").doesNotExist());
        mvc.perform(put("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON).content(update(0, Map.of("accent", "blue"))))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON).content(update(1, Map.of("accent", "url(javascript:evil)"))))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(put("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON).content(update(1, Map.of("widgets", java.util.List.of("inventory", "inventory")))))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(put("/api/v1/me/ui-preferences").header("Authorization", "Bearer " + first)
                .contentType(MediaType.APPLICATION_JSON).content("{\"schemaVersion\":1,\"values\":{\"accent\":\"blue\"}}"))
                .andExpect(status().isUnprocessableEntity());
    }
}
