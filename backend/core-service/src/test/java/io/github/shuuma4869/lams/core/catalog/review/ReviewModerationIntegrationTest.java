package io.github.shuuma4869.lams.core.catalog.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
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
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class ReviewModerationIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("lams_review_moderation").withUsername("lams").withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "review-moderation-secret-at-least-32-bytes");
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clear() {
        jdbc.update("DELETE FROM review_moderation_audit");
        jdbc.update("DELETE FROM review_reports");
        jdbc.update("DELETE FROM reviews");
    }

    @Test
    void reportAndHideRequireAdminAndRemoveReviewFromPublicRatings() throws Exception {
        UUID owner = user("READER"), reporter = user("READER"), librarian = user("LIBRARIAN"), admin = user("ADMIN");
        UUID book = book(), review = review(owner, book);
        String reportUrl = "/api/v1/books/" + book + "/reviews/" + review + "/reports";
        String payload = "{\"reason\":\"Nội dung xúc phạm người khác\"}";

        mvc.perform(post(reportUrl).with(token(owner, "READER")).contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isUnprocessableEntity());
        var result = mvc.perform(post(reportUrl).with(token(reporter, "READER"))
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isCreated()).andReturn();
        UUID report = UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("reportId").asText());
        mvc.perform(post(reportUrl).with(token(reporter, "READER"))
                        .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT body_snapshot FROM review_reports WHERE id=?", String.class, report))
                .isEqualTo("Review content");

        mvc.perform(get("/api/v1/admin/review-reports").with(token(librarian, "LIBRARIAN")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/review-reports").with(token(admin, "ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        String decision = "/api/v1/admin/review-reports/" + report + "/decisions";
        mvc.perform(post(decision).with(token(librarian, "LIBRARIAN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"HIDE\",\"reason\":\"Nội dung vi phạm quy định\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(decision).with(token(admin, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"HIDE\",\"reason\":\"Nội dung vi phạm quy định\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("HIDDEN"));
        mvc.perform(get("/api/v1/books/{book}/reviews", book).with(token(reporter, "READER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/books/{book}/reviews/summary", book).with(token(reporter, "READER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));
        mvc.perform(get("/api/v1/me/reviews").with(token(owner, "READER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].moderationStatus").value("HIDDEN"));
        mvc.perform(get("/api/v1/public/catalog/books/{id}", book))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ratingCount").value(0));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM review_moderation_audit WHERE report_id=?",
                Integer.class, report)).isOne();
        mvc.perform(post(decision).with(token(admin, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"HIDE\",\"reason\":\"Lặp lại quyết định\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void dismissLeavesRatingVisibleAndLiveRoleCheckRejectsRevokedAdmin() throws Exception {
        UUID owner = user("READER"), reporter = user("READER"), admin = user("ADMIN");
        UUID book = book(), review = review(owner, book);
        var result = mvc.perform(post("/api/v1/books/{book}/reviews/{review}/reports", book, review)
                        .with(token(reporter, "READER")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Tôi nghi ngờ nội dung sai lệch\"}"))
                .andExpect(status().isCreated()).andReturn();
        UUID report = UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("reportId").asText());
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?", admin);
        mvc.perform(get("/api/v1/admin/review-reports").with(token(admin, "ADMIN")))
                .andExpect(status().isForbidden());
        jdbc.update("UPDATE users SET status='ACTIVE' WHERE id=?", admin);
        mvc.perform(post("/api/v1/admin/review-reports/{id}/decisions", report)
                        .with(token(admin, "ADMIN")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"DISMISS\",\"reason\":\"Không có cơ sở để ẩn đánh giá\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reviewStatus").value("VISIBLE"));
        mvc.perform(get("/api/v1/books/{book}/reviews/summary", book).with(token(owner, "READER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void reportLimitIsEnforcedAcrossBooks() throws Exception {
        UUID owner = user("READER"), reporter = user("READER");
        for (int number = 0; number < 21; number++) {
            UUID book = book(), review = review(owner, book);
            mvc.perform(post("/api/v1/books/{book}/reviews/{review}/reports", book, review)
                            .with(token(reporter, "READER")).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"Nội dung cần được xem xét\"}"))
                    .andExpect(number == 20 ? status().isTooManyRequests() : status().isCreated());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM review_reports WHERE reporter_id=?",
                Integer.class, reporter)).isEqualTo(20);
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        String key = id.toString();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,"
                        + "created_at,updated_at) VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())",
                id, "M-" + key.substring(0, 16), key + "@review.test", key + "@review.test", "Review test");
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,?)", id, role);
        return id;
    }

    private UUID book() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Review book','review book')", id);
        return id;
    }

    private UUID review(UUID owner, UUID book) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Review content',4)",
                id, owner, book);
        return id;
    }

    private static RequestPostProcessor token(UUID id, String role) {
        return jwt().jwt(jwt -> jwt.subject(id.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }
}
