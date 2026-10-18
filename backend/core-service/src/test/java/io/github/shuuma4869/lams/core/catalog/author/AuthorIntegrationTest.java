package io.github.shuuma4869.lams.core.catalog.author;

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
class AuthorIntegrationTest {
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
    void clearAuthorsAndReferenceFixtures() {
        jdbc.execute("DROP TABLE IF EXISTS author_reference_fixture");
        if (tableExists("book_authors")) jdbc.update("DELETE FROM book_authors");
        if (tableExists("book_categories")) jdbc.update("DELETE FROM book_categories");
        if (tableExists("books")) jdbc.update("DELETE FROM books");
        jdbc.update("DELETE FROM authors");
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class,
                "public." + name));
    }

    private String address() { return "author-" + UUID.randomUUID() + "@example.test"; }

    private String staffToken() throws Exception {
        String email = address();
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên thư viện", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        UUID userId = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
        jdbc.update("INSERT INTO user_roles(user_id, role_code) VALUES (?, 'LIBRARIAN')", userId);
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private JsonNode createAuthor(String token, String name) throws Exception {
        var response = mvc.perform(post("/api/v1/authors").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("name", name))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString());
    }

    @Test
    void createsReadsUpdatesAndDeletesAuthor() throws Exception {
        String token = staffToken();
        JsonNode created = createAuthor(token, "  Nguyễn Du  ");
        String id = created.path("id").asText();
        assertThat(created.path("name").asText()).isEqualTo("Nguyễn Du");

        mvc.perform(get("/api/v1/authors/{id}", id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Nguyễn Du"));
        mvc.perform(patch("/api/v1/authors/{id}", id).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Nam Cao\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Nam Cao"));
        mvc.perform(delete("/api/v1/authors/{id}", id).header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM authors WHERE id=?", Integer.class, UUID.fromString(id)))
                .isZero();
    }

    @Test
    void rejectsBlankOrOversizedNamesWithoutWritingRows() throws Exception {
        String token = staffToken();
        int before = jdbc.queryForObject("SELECT count(*) FROM authors", Integer.class);
        for (String body : new String[]{"{\"name\":\"   \"}", "{\"name\":\"" + "x".repeat(201) + "\"}"}) {
            mvc.perform(post("/api/v1/authors").header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnprocessableEntity());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM authors", Integer.class)).isEqualTo(before);
    }

    @Test
    void authorEndpointsRequireStaffAuthorization() throws Exception {
        mvc.perform(get("/api/v1/authors")).andExpect(status().isUnauthorized());
        var registration = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Reader", "email", address(),
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated()).andReturn();
        String readerToken = json.readTree(registration.getResponse().getContentAsString())
                .path("accessToken").asText();
        mvc.perform(get("/api/v1/authors").header("Authorization", "Bearer " + readerToken))
                .andExpect(status().isOk());
    }

    @Test
    void listsAuthorsWithStablePaginationAndRejectsInvalidPage() throws Exception {
        String token = staffToken();
        createAuthor(token, "Trần Hưng Đạo");
        createAuthor(token, "Lê Quý Đôn");

        mvc.perform(get("/api/v1/authors").header("Authorization", "Bearer " + token)
                        .param("page", "0").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Lê Quý Đôn"))
                .andExpect(jsonPath("$.page.number").value(0))
                .andExpect(jsonPath("$.page.size").value(1))
                .andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.page.totalPages").value(2));
        mvc.perform(get("/api/v1/authors").header("Authorization", "Bearer " + token).param("size", "101"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void missingAuthorReturnsNotFoundAndReferencedAuthorReturnsConflict() throws Exception {
        String token = staffToken();
        String missingId = UUID.randomUUID().toString();
        mvc.perform(get("/api/v1/authors/{id}", missingId).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/authors/{id}", missingId).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Không tồn tại\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/authors/{id}", missingId).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());

        JsonNode author = createAuthor(token, "Tác giả đang được dùng");
        UUID authorId = UUID.fromString(author.path("id").asText());
        jdbc.execute("CREATE TABLE author_reference_fixture (author_id UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT)");
        jdbc.update("INSERT INTO author_reference_fixture (author_id) VALUES (?)", authorId);

        mvc.perform(delete("/api/v1/authors/{id}", authorId).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Không thể xóa tác giả đang được sách tham chiếu."));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM authors WHERE id=?", Integer.class, authorId)).isEqualTo(1);
    }
}
