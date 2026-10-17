package io.github.shuuma4869.lams.core.inventory;

import static org.assertj.core.api.Assertions.assertThat;
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
class InventoryCatalogIntegrationTest {
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
    void clearFixtures() {
        jdbc.update("DELETE FROM book_copies");
        jdbc.update("DELETE FROM editions");
        jdbc.update("DELETE FROM shelves");
        jdbc.update("DELETE FROM book_authors");
        jdbc.update("DELETE FROM book_categories");
        jdbc.update("DELETE FROM books");
        jdbc.update("DELETE FROM authors");
        jdbc.update("DELETE FROM categories");
        jdbc.update("DELETE FROM publishers");
        jdbc.update("DELETE FROM branches");
    }

    private String staffToken() throws Exception {
        String email = "inventory-" + UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        UUID userId = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?, 'LIBRARIAN')", userId);
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private JsonNode postJson(String token, String path, Object body, int expected) throws Exception {
        var result = mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().is(expected)).andReturn();
        return result.getResponse().getContentAsString().isBlank() ? json.createObjectNode()
                : json.readTree(result.getResponse().getContentAsString());
    }

    private UUID branch(String token, String code, String name) throws Exception {
        return UUID.fromString(postJson(token, "/api/v1/branches",
                Map.of("code", code, "name", name), 201).path("id").asText());
    }

    private UUID shelf(String token, UUID branchId, String code, String label) throws Exception {
        return UUID.fromString(postJson(token, "/api/v1/shelves",
                Map.of("branchId", branchId, "code", code, "label", label), 201).path("id").asText());
    }

    private UUID edition(String token) throws Exception {
        UUID bookId = UUID.fromString(postJson(token, "/api/v1/books", Map.of("title", "Tác phẩm",
                "authorIds", java.util.List.of(), "categoryIds", java.util.List.of()), 201)
                .path("id").asText());
        return UUID.fromString(postJson(token, "/api/v1/books/" + bookId + "/editions",
                Map.of("publicationYear", 2020), 201).path("id").asText());
    }

    @Test
    void branchCodeIsUniqueAndShelfCodeIsUniqueOnlyWithinBranch() throws Exception {
        String token = staffToken();
        UUID firstBranch = branch(token, "HN", "Hà Nội");
        mvc.perform(post("/api/v1/branches").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\" hn \",\"name\":\"Trùng mã\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/branches").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"\",\"name\":\"Thiếu mã\"}"))
                .andExpect(status().isUnprocessableEntity());
        UUID secondBranch = branch(token, "HCM", "Hồ Chí Minh");
        UUID firstShelf = shelf(token, firstBranch, "A-01", "Kệ A01");
        UUID secondShelf = shelf(token, secondBranch, "A-01", "Kệ A01");
        assertThat(firstShelf).isNotEqualTo(secondShelf);
        mvc.perform(post("/api/v1/shelves").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("branchId", firstBranch, "code", "a-01", "label", "Trùng"))))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/v1/shelves").header("Authorization", "Bearer " + token)
                        .param("branchId", firstBranch.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].branchId").value(firstBranch.toString()));
        mvc.perform(post("/api/v1/shelves").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("branchId", UUID.randomUUID(), "code", "K2", "label", "Kệ sai"))))
                .andExpect(status().isNotFound());
        UUID movableShelf = shelf(token, firstBranch, "B-01", "Kệ chuyển");
        mvc.perform(patch("/api/v1/shelves/{id}", movableShelf).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("branchId", secondBranch,"code", "B-01","label", "Đã chuyển"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.branchId").value(secondBranch.toString()));
    }

    @Test
    void copyStartsInProcessUsesVersionAndCannotBypassCirculationState() throws Exception {
        String token = staffToken();
        UUID branchA = branch(token, "A", "Chi nhánh A");
        UUID branchB = branch(token, "B", "Chi nhánh B");
        UUID shelfA = shelf(token, branchA, "K1", "Kệ một");
        UUID shelfB = shelf(token, branchB, "K1", "Kệ một");
        UUID editionId = edition(token);
        var created = postJson(token, "/api/v1/copies", Map.of("editionId", editionId,
                "barcode", "BC-001", "shelfId", shelfA), 201);
        UUID copyId = UUID.fromString(created.path("id").asText());
        assertThat(created.path("status").asText()).isEqualTo("IN_PROCESS");
        assertThat(created.path("version").asLong()).isZero();
        assertThat(created.has("available")).isFalse();

        jdbc.update("UPDATE book_copies SET status='AVAILABLE' WHERE id=?", copyId);
        var moved = mvc.perform(patch("/api/v1/copies/{id}", copyId).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("editionId", editionId,"barcode", "BC-001",
                                "shelfId", shelfB,"version", 0,"status", "ON_LOAN"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.shelfId").value(shelfB.toString()))
                .andExpect(jsonPath("$.status").value("AVAILABLE")).andExpect(jsonPath("$.version").value(1))
                .andReturn();
        assertThat(json.readTree(moved.getResponse().getContentAsString()).path("status").asText()).isEqualTo("AVAILABLE");

        jdbc.update("UPDATE book_copies SET status='ON_LOAN' WHERE id=?", copyId);
        mvc.perform(patch("/api/v1/copies/{id}", copyId).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("editionId", editionId,"barcode", "BC-001",
                                "shelfId", shelfA,"version", 1))))
                .andExpect(status().isConflict());
        mvc.perform(patch("/api/v1/shelves/{id}", shelfB).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("branchId", branchA,"code", "K1","label", "Chuyển kệ"))))
                .andExpect(status().isConflict());
    }

    @Test
    void copyCreationChecksForeignKeysAndUniqueBarcode() throws Exception {
        String token = staffToken();
        UUID branchId = branch(token, "A", "Chi nhánh A");
        UUID shelfId = shelf(token, branchId, "K1", "Kệ một");
        UUID editionId = edition(token);
        postJson(token, "/api/v1/copies", Map.of("editionId", editionId, "barcode", "BAR-1", "shelfId", shelfId), 201);
        mvc.perform(post("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("editionId", editionId,"barcode", "BAR-1","shelfId", shelfId))))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("editionId", UUID.randomUUID(),"barcode", "BAR-2","shelfId", shelfId))))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("editionId", editionId,"barcode", "BAR-3","shelfId", UUID.randomUUID()))))
                .andExpect(status().isNotFound());
    }
}
