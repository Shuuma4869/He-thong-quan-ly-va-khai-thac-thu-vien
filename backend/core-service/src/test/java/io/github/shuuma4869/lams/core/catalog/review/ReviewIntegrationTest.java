package io.github.shuuma4869.lams.core.catalog.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ReviewIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("lams_reviews").withUsername("lams").withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "reviews-integration-secret-at-least-32-bytes");
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clearReviews() {
        jdbc.update("DELETE FROM reviews");
    }

    @Test
    void createDuplicateAndListArePersistentWithoutExposingUserId() throws Exception {
        UUID user = user("READER");
        UUID book = book("Review persistence");
        RequestPostProcessor token = token(user, "READER");

        var created = create(token, book, "  Useful review  ", 4)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("Useful review"))
                .andExpect(jsonPath("$.rating").value(4))
                .andExpect(jsonPath("$.mine").value(true))
                .andExpect(jsonPath("$.userId").doesNotExist())
                .andReturn();
        UUID reviewId = UUID.fromString(json.readTree(created.getResponse().getContentAsString())
                .path("reviewId").asText());

        create(token, book, "Second review", 5).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isOne();
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].reviewId").value(reviewId.toString()))
                .andExpect(jsonPath("$.items[0].mine").value(true));
    }

    @Test
    void concurrentCreateForSameUserAndBookHasOneWinner() throws Exception {
        UUID user = user("READER");
        UUID book = book("Concurrent review");
        RequestPostProcessor token = token(user, "READER");
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> createStatus(token, book, "Review A", start));
            var second = pool.submit(() -> createStatus(token, book, "Review B", start));
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews WHERE user_id=? AND book_id=?",
                Integer.class, user, book)).isOne();
    }

    @Test
    void onlyOwnerCanUpdateOrDeleteAndOtherUsersSeeNoIdentity() throws Exception {
        UUID owner = user("READER");
        UUID other = user("LIBRARIAN");
        UUID book = book("Owner scope");
        var result = create(token(owner, "READER"), book, "Owner review", 3)
                .andExpect(status().isCreated()).andReturn();
        UUID reviewId = UUID.fromString(json.readTree(result.getResponse().getContentAsString())
                .path("reviewId").asText());
        RequestPostProcessor otherToken = token(other, "LIBRARIAN");

        mvc.perform(patch("/api/v1/books/{bookId}/reviews/{reviewId}", book, reviewId)
                        .with(otherToken).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/books/{bookId}/reviews/{reviewId}", book, reviewId)
                        .with(otherToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(otherToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].mine").value(false))
                .andExpect(jsonPath("$.items[0].userId").doesNotExist());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews WHERE id=?", Integer.class, reviewId)).isOne();
    }

    @Test
    void validatesBodyAndRatingAtTheApiBoundary() throws Exception {
        UUID user = user("READER");
        UUID book = book("Validation");
        RequestPostProcessor token = token(user, "READER");
        create(token, book, " ", 3).andExpect(status().isUnprocessableEntity());
        create(token, book, "Valid body", 0).andExpect(status().isUnprocessableEntity());
        create(token, book, "Valid body", 6).andExpect(status().isUnprocessableEntity());
        create(token, book, "x".repeat(5001), 4).andExpect(status().isUnprocessableEntity());
        create(token, book, "Valid body", 4).andExpect(status().isCreated());
        mvc.perform(patch("/api/v1/books/{bookId}/reviews/{reviewId}", book, UUID.randomUUID())
                        .with(token).contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews WHERE book_id=?", Integer.class, book)).isOne();
    }

    @Test
    void editAndDeleteKeepRatingAggregateConsistentAndEmptyIsNull() throws Exception {
        UUID book = book("Rating aggregate");
        UUID firstUser = user("READER");
        UUID secondUser = user("READER");
        UUID thirdUser = user("ADMIN");
        UUID first = createAndReadId(token(firstUser, "READER"), book, "First", 4);
        UUID second = createAndReadId(token(secondUser, "READER"), book, "Second", 5);
        UUID third = createAndReadId(token(thirdUser, "ADMIN"), book, "Third", 5);

        summary(token(firstUser, "READER"), book).andExpect(status().isOk())
                .andExpect(jsonPath("$.average").value(4.67)).andExpect(jsonPath("$.count").value(3));
        mvc.perform(patch("/api/v1/books/{bookId}/reviews/{reviewId}", book, first)
                        .with(token(firstUser, "READER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rating\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rating").value(1))
                .andExpect(jsonPath("$.body").value("First"));
        summary(token(firstUser, "READER"), book).andExpect(status().isOk())
                .andExpect(jsonPath("$.average").value(3.67)).andExpect(jsonPath("$.count").value(3));

        mvc.perform(delete("/api/v1/books/{bookId}/reviews/{reviewId}", book, first)
                        .with(token(firstUser, "READER")))
                .andExpect(status().isNoContent());
        summary(token(firstUser, "READER"), book).andExpect(status().isOk())
                .andExpect(jsonPath("$.average").value(5.00)).andExpect(jsonPath("$.count").value(2));
        mvc.perform(delete("/api/v1/books/{bookId}/reviews/{reviewId}", book, second)
                        .with(token(secondUser, "READER")))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/books/{bookId}/reviews/{reviewId}", book, third)
                        .with(token(thirdUser, "ADMIN")))
                .andExpect(status().isNoContent());
        summary(token(firstUser, "READER"), book).andExpect(status().isOk())
                .andExpect(jsonPath("$.average").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void anonymousMissingBookPaginationAndSortAreHandled() throws Exception {
        UUID book = book("Review page");
        UUID user = user("READER");
        RequestPostProcessor token = token(user, "READER");
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/books/{bookId}/reviews/summary", book)).andExpect(status().isUnauthorized());
        UUID missing = UUID.randomUUID();
        create(token, missing, "Unknown book", 4).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/books/{bookId}/reviews", missing).with(token))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/books/{bookId}/reviews/summary", missing)
                        .with(token)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/books/not-a-uuid/reviews").with(token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));

        UUID firstUser = user("READER");
        UUID secondUser = user("READER");
        UUID first = UUID.fromString("20000000-0000-0000-0000-000000000001");
        UUID second = UUID.fromString("20000000-0000-0000-0000-000000000002");
        Timestamp sameTime = Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"));
        jdbc.update("INSERT INTO reviews(id,user_id,book_id,body,rating,created_at,updated_at) "
                        + "VALUES (?,?,?,'First',3,?,?),(?,?,?,'Second',4,?,?)",
                first, firstUser, book, sameTime, sameTime, second, secondUser, book, sameTime, sameTime);
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(token)
                        .param("page", "0").param("size", "1").param("sort", "createdAt,asc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].reviewId").value(first.toString()))
                .andExpect(jsonPath("$.page.totalElements").value(2));
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(token)
                        .param("page", "1").param("size", "1").param("sort", "createdAt,asc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].reviewId").value(second.toString()));
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(token)
                        .param("size", "101"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/books/{bookId}/reviews", book).with(token)
                        .param("sort", "body,asc"))
                .andExpect(status().isUnprocessableEntity());
    }

    private org.springframework.test.web.servlet.ResultActions create(RequestPostProcessor token, UUID book, String body, int rating)
            throws Exception {
        return mvc.perform(post("/api/v1/books/{bookId}/reviews", book)
                .with(token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(java.util.Map.of("body", body, "rating", rating))));
    }

    private int createStatus(RequestPostProcessor token, UUID book, String body, CountDownLatch start) {
        try {
            start.await();
            return create(token, book, body, 4).andReturn().getResponse().getStatus();
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private UUID createAndReadId(RequestPostProcessor token, UUID book, String body, int rating) throws Exception {
        var result = create(token, book, body, rating).andExpect(status().isCreated()).andReturn();
        JsonNode jsonBody = json.readTree(result.getResponse().getContentAsString());
        return UUID.fromString(jsonBody.path("reviewId").asText());
    }

    private org.springframework.test.web.servlet.ResultActions summary(RequestPostProcessor token, UUID book) throws Exception {
        return mvc.perform(get("/api/v1/books/{bookId}/reviews/summary", book)
                .with(token));
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        String suffix = id.toString();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                        + "VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())",
                id, "R-" + suffix.substring(0, 16), suffix + "@review.test", suffix + "@review.test", "Review test");
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,?)", id, role);
        return id;
    }

    private UUID book(String title) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,?,?)",
                id, title, title.toLowerCase(java.util.Locale.ROOT));
        return id;
    }

    private static RequestPostProcessor token(UUID id, String role) {
        return jwt().jwt(jwt -> jwt.subject(id.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }

}
