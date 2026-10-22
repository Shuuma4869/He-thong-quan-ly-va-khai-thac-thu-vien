package io.github.shuuma4869.lams.core.catalog.favorite;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FavoriteIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("lams_favorites").withUsername("lams").withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "favorites-integration-secret-at-least-32-bytes");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clearFavorites() {
        jdbc.update("DELETE FROM favorites");
    }

    @Test
    void addIsPersistentIdempotentAndRemoveIsIdempotent() throws Exception {
        UUID user = user("READER");
        UUID book = book("Persistent favorite");
        var token = token(user, "READER");

        mvc.perform(put("/api/v1/me/favorites/{bookId}", book).with(token))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.bookId").value(book.toString()))
                .andExpect(jsonPath("$.bookTitle").value("Persistent favorite"))
                .andExpect(jsonPath("$.favoritedAt").isNotEmpty())
                .andExpect(jsonPath("$.userId").doesNotExist());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isOne();

        mvc.perform(put("/api/v1/me/favorites/{bookId}", book).with(token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.bookId").value(book.toString()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isOne();
        mvc.perform(get("/api/v1/me/favorites").with(token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));

        mvc.perform(delete("/api/v1/me/favorites/{bookId}", book).with(token)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/me/favorites/{bookId}", book).with(token)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isZero();
    }

    @Test
    void concurrentAddsCreateExactlyOneFavorite() throws Exception {
        UUID user = user("READER");
        UUID book = book("Concurrent favorite");
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> addStatus(user, book, start));
            var second = pool.submit(() -> addStatus(user, book, start));
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 200);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isOne();
    }

    @Test
    void principalScopesListAndDeleteToTheCurrentUser() throws Exception {
        UUID owner = user("READER");
        UUID other = user("READER");
        UUID book = book("Private association");
        mvc.perform(put("/api/v1/me/favorites/{bookId}", book).with(token(owner, "READER")))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/me/favorites").with(token(other, "READER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(delete("/api/v1/me/favorites/{bookId}", book).with(token(other, "READER")))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE user_id=? AND book_id=?",
                Integer.class, owner, book)).isOne();
    }

    @Test
    void anonymousLockedAndRevokedUsersAreRejected() throws Exception {
        UUID book = book("Protected favorite");
        mvc.perform(get("/api/v1/me/favorites")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/v1/me/favorites/{bookId}", book)).andExpect(status().isUnauthorized());

        UUID locked = user("READER");
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", locked);
        mvc.perform(get("/api/v1/me/favorites").with(token(locked, "READER")))
                .andExpect(status().isForbidden());

        UUID revoked = user("READER");
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", revoked);
        mvc.perform(put("/api/v1/me/favorites/{bookId}", book).with(token(revoked, "READER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void missingBookIsNotFoundAndPaginationSortHasStableBookIdTieBreak() throws Exception {
        UUID user = user("READER");
        var token = token(user, "READER");
        UUID missing = UUID.randomUUID();
        mvc.perform(put("/api/v1/me/favorites/{bookId}", missing).with(token)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/me/favorites/{bookId}", missing).with(token)).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/me/favorites/not-a-uuid").with(token))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                        .contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400));

        UUID later = UUID.fromString("10000000-0000-0000-0000-000000000002");
        UUID earlier = UUID.fromString("10000000-0000-0000-0000-000000000001");
        insertBook(later, "Later ID");
        insertBook(earlier, "Earlier ID");
        Timestamp sameTime = Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"));
        jdbc.update("INSERT INTO favorites(user_id,book_id,created_at) VALUES (?,?,?),(?,?,?)",
                user, later, sameTime, user, earlier, sameTime);

        mvc.perform(get("/api/v1/me/favorites").with(token).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].bookId").value(earlier.toString()))
                .andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.page.totalPages").value(2));
        mvc.perform(get("/api/v1/me/favorites").with(token).param("page", "1").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].bookId").value(later.toString()));
        mvc.perform(get("/api/v1/me/favorites").with(token).param("size", "101"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/me/favorites").with(token).param("sort", "bookTitle,desc"))
                .andExpect(status().isUnprocessableEntity());
    }

    private int addStatus(UUID userId, UUID bookId, CountDownLatch start) {
        try {
            start.await();
            return mvc.perform(put("/api/v1/me/favorites/{bookId}", bookId).with(token(userId, "READER")))
                    .andReturn().getResponse().getStatus();
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        String suffix = id.toString();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                        + "VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())",
                id, "T-" + suffix.substring(0, 16), suffix + "@favorite.test", suffix + "@favorite.test", "Favorite test");
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,?)", id, role);
        return id;
    }

    private UUID book(String title) {
        UUID id = UUID.randomUUID();
        insertBook(id, title);
        return id;
    }

    private void insertBook(UUID id, String title) {
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,?,?)",
                id, title, title.toLowerCase(java.util.Locale.ROOT));
    }

    private static RequestPostProcessor token(UUID id, String role) {
        return jwt().jwt(jwt -> jwt.subject(id.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }
}
