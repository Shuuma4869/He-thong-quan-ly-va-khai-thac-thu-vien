package io.github.shuuma4869.lams.core.catalog.referencedata;

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
import org.junit.jupiter.api.BeforeEach;
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

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReferenceCatalogIntegrationTest {
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

    @BeforeEach
    void clearReferenceData() {
        jdbc.execute("DROP TABLE IF EXISTS publisher_reference_fixture");
        if (tableExists("book_categories")) jdbc.update("DELETE FROM book_categories");
        if (tableExists("editions")) jdbc.update("DELETE FROM editions");
        jdbc.update("DELETE FROM categories");
        jdbc.update("DELETE FROM publishers");
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class,
                "public." + name));
    }

    private String token(boolean staff) throws Exception {
        String email = "catalog-" + UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên thư viện", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        if (staff) {
            UUID userId = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
            jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?, 'LIBRARIAN')", userId);
        }
        var result = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private JsonNode create(String path, String token, String name) throws Exception {
        var result = mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", name))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void categoryNamesAreNormalizedUniqueAndCrudIsPaginated() throws Exception {
        String token = token(true);
        JsonNode first = create("/api/v1/categories", token, "  Khoa   học  ");
        assertThat(first.path("name").asText()).isEqualTo("Khoa học");
        mvc.perform(post("/api/v1/categories").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"KHOA HỌC\"}"))
                .andExpect(status().isConflict());
        JsonNode second = create("/api/v1/categories", token, "Văn học");
        mvc.perform(get("/api/v1/categories").header("Authorization", "Bearer " + token)
                        .param("page", "0").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Khoa học"))
                .andExpect(jsonPath("$.page.totalElements").value(2));
        mvc.perform(patch("/api/v1/categories/{id}", second.path("id").asText())
                        .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"KHOA    HỌC\"}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/categories/{id}", first.path("id").asText())
                        .header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
    }

    @Test
    void publisherNamesAreNotAssumedUniqueAndReferencesPreventDelete() throws Exception {
        String token = token(true);
        JsonNode first = create("/api/v1/publishers", token, "Nhà xuất bản A");
        create("/api/v1/publishers", token, "Nhà xuất bản A");
        mvc.perform(get("/api/v1/publishers").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(2));

        jdbc.execute("CREATE TABLE publisher_reference_fixture (publisher_id UUID NOT NULL "
                + "REFERENCES publishers(id) ON DELETE RESTRICT)");
        jdbc.update("INSERT INTO publisher_reference_fixture(publisher_id) VALUES (?)",
                UUID.fromString(first.path("id").asText()));
        mvc.perform(delete("/api/v1/publishers/{id}", first.path("id").asText())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM publishers WHERE id=?", Integer.class,
                UUID.fromString(first.path("id").asText()))).isEqualTo(1);
    }

    @Test
    void readerCannotManageReferenceCatalogAndBlankNamesAreRejected() throws Exception {
        String readerToken = token(false);
        mvc.perform(get("/api/v1/categories").header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/categories").header("Authorization", "Bearer " + readerToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Không có quyền\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/publishers").header("Authorization", "Bearer " + readerToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Nhà xuất bản thử\"}"))
                .andExpect(status().isForbidden());

        String staffToken = token(true);
        mvc.perform(post("/api/v1/publishers").header("Authorization", "Bearer " + staffToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\" \"}"))
                .andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM publishers", Integer.class)).isZero();
    }
}
