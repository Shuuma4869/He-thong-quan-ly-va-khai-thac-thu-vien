package io.github.shuuma4869.lams.core.catalog.edition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
class EditionIntegrationTest {
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
    void clearCatalogData() {
        if (tableExists("book_copies")) jdbc.update("DELETE FROM book_copies");
        jdbc.update("DELETE FROM editions");
        jdbc.update("DELETE FROM book_authors");
        jdbc.update("DELETE FROM book_categories");
        jdbc.update("DELETE FROM books");
        jdbc.update("DELETE FROM publishers");
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class,
                "public." + name));
    }

    private String staffToken() throws Exception {
        String email = "edition-" + UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        UUID id = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?, 'LIBRARIAN')", id);
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private UUID createBook(String token) throws Exception {
        var result = mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Tác phẩm\",\"authorIds\":[],\"categoryIds\":[]}"))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    }

    private String request(Integer year, String isbn, UUID publisher) throws Exception {
        var value = new java.util.LinkedHashMap<String, Object>();
        value.put("publicationYear", year);
        value.put("isbn13", isbn);
        value.put("publisherId", publisher);
        value.put("language", "vi");
        return json.writeValueAsString(value);
    }

    @Test
    void multipleEditionsRemainDistinctAndIsbnMayBeNull() throws Exception {
        String token = staffToken();
        UUID bookId = createBook(token);
        String firstPath = "/api/v1/books/" + bookId + "/editions";
        var first = mvc.perform(post(firstPath).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(request(2020, null, null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.isbn13").doesNotExist()).andReturn();
        var second = mvc.perform(post(firstPath).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(request(2024, null, null)))
                .andExpect(status().isCreated()).andReturn();
        JsonNode firstEdition = json.readTree(first.getResponse().getContentAsString());
        JsonNode secondEdition = json.readTree(second.getResponse().getContentAsString());
        assertThat(firstEdition.path("id").asText()).isNotEqualTo(secondEdition.path("id").asText());
        mvc.perform(get(firstPath).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(2));
        mvc.perform(get(firstPath + "/" + firstEdition.path("id").asText())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bookId").value(bookId.toString()));
    }

    @Test
    void rejectsInvalidYearAndMissingBookAndRestrictsDeleteWhenCopyExists() throws Exception {
        String token = staffToken();
        UUID bookId = createBook(token);
        String path = "/api/v1/books/" + bookId + "/editions";
        mvc.perform(post(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(request(999, null, null)))
                .andExpect(status().isUnprocessableEntity());
        UUID missingBook = UUID.randomUUID();
        mvc.perform(post("/api/v1/books/" + missingBook + "/editions")
                        .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content(request(null, null, null)))
                .andExpect(status().isNotFound());

        var result = mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(request(2022, null, null)))
                .andExpect(status().isCreated()).andReturn();
        UUID editionId = UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("id").asText());
        UUID branchId = UUID.randomUUID();
        UUID shelfId = UUID.randomUUID();
        jdbc.update("INSERT INTO branches(id,code,name,status) VALUES (?,?,?,'ACTIVE')",
                branchId, "ED-" + branchId.toString().substring(0, 8), "Chi nhánh kiểm thử");
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,?,?)",
                shelfId, branchId, "A-1", "Kệ kiểm thử");
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)",
                UUID.randomUUID(), editionId, "ED-" + UUID.randomUUID(), shelfId);
        mvc.perform(delete(path + "/" + editionId).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
    }
}
