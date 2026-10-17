package io.github.shuuma4869.lams.core.catalog.book;

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
class BookIntegrationTest {
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
    void clearCatalogFixtureData() {
        jdbc.execute("DROP TABLE IF EXISTS book_reference_fixture");
        if (tableExists("book_copies")) jdbc.update("DELETE FROM book_copies");
        if (tableExists("editions")) jdbc.update("DELETE FROM editions");
        jdbc.update("DELETE FROM book_authors");
        jdbc.update("DELETE FROM book_categories");
        jdbc.update("DELETE FROM books");
        jdbc.update("DELETE FROM authors");
        jdbc.update("DELETE FROM categories");
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class,
                "public." + name));
    }

    private String token(boolean staff) throws Exception {
        String email = "book-" + UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên thư viện", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        if (staff) {
            UUID userId = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
            jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?, 'LIBRARIAN')", userId);
        }
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private UUID createReference(String token, String path, String name) throws Exception {
        var result = mvc.perform(post(path).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", name))))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    }

    private String bookBody(String title, UUID authorId, UUID categoryId) throws Exception {
        return json.writeValueAsString(Map.of("title", title, "authorIds", java.util.List.of(authorId, authorId),
                "categoryIds", java.util.List.of(categoryId, categoryId)));
    }

    @Test
    void createUpdateReadAndListBookWithoutDuplicatingRelations() throws Exception {
        String token = token(true);
        UUID authorId = createReference(token, "/api/v1/authors", "Tác giả mẫu");
        UUID categoryId = createReference(token, "/api/v1/categories", "Khoa học");
        var created = mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(bookBody("  Tác phẩm   mẫu ", authorId, categoryId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Tác phẩm mẫu"))
                .andExpect(jsonPath("$.authors.length()").value(1))
                .andExpect(jsonPath("$.categories.length()").value(1))
                .andReturn();
        JsonNode book = json.readTree(created.getResponse().getContentAsString());
        UUID bookId = UUID.fromString(book.path("id").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_authors WHERE book_id=?", Integer.class, bookId)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_categories WHERE book_id=?", Integer.class, bookId)).isOne();
        assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns "
                        + "WHERE table_schema='public' AND table_name='books'", String.class))
                .doesNotContain("available", "total", "barcode");

        mvc.perform(get("/api/v1/books/{id}", bookId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authors[0].name").value("Tác giả mẫu"));
        mvc.perform(get("/api/v1/books").header("Authorization", "Bearer " + token).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(bookId.toString()))
                .andExpect(jsonPath("$.page.totalElements").value(1));

        UUID replacementAuthor = createReference(token, "/api/v1/authors", "Tác giả khác");
        mvc.perform(patch("/api/v1/books/{id}", bookId).header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bookBody("Tác phẩm cập nhật", replacementAuthor, categoryId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Tác phẩm cập nhật"))
                .andExpect(jsonPath("$.authors.length()").value(1))
                .andExpect(jsonPath("$.authors[0].id").value(replacementAuthor.toString()));
    }

    @Test
    void rejectsBlankTitleAndMissingRelationWithoutPartialInsert() throws Exception {
        String token = token(true);
        UUID authorId = createReference(token, "/api/v1/authors", "Tác giả tồn tại");
        UUID categoryId = createReference(token, "/api/v1/categories", "Thể loại tồn tại");
        int before = jdbc.queryForObject("SELECT count(*) FROM books", Integer.class);
        mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\" \"}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bookBody("Thiếu thể loại", authorId, UUID.randomUUID())))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM books", Integer.class)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_authors", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_categories", Integer.class)).isZero();
    }

    @Test
    void deleteIsRestrictedWhenAnEditionStillReferencesBook() throws Exception {
        String token = token(true);
        var created = mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", "Có ấn bản",
                                "authorIds", java.util.List.of(), "categoryIds", java.util.List.of()))))
                .andExpect(status().isCreated()).andReturn();
        UUID bookId = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).path("id").asText());
        jdbc.execute("CREATE TABLE book_reference_fixture (book_id UUID NOT NULL "
                + "REFERENCES books(id) ON DELETE RESTRICT)");
        jdbc.update("INSERT INTO book_reference_fixture(book_id) VALUES (?)", bookId);
        mvc.perform(delete("/api/v1/books/{id}", bookId).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?", Integer.class, bookId)).isOne();
    }
}
