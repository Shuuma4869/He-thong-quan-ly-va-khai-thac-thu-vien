package io.github.shuuma4869.lams.core.acquisition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class AcquisitionFactsIntegrationTest {
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
    @Autowired AcquisitionFactsService service;
    @MockitoSpyBean AcquisitionFactsRepository repository;

    private record Account(UUID id, String token) {}

    private Account account(boolean staff) throws Exception {
        String email = "acquisition-" + UUID.randomUUID() + "@example.test";
        var created = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Người kiểm thử", "email", email,
                        "password", "correct-password-123"))))
                .andExpect(status().isCreated()).andReturn();
        UUID id = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).path("user").path("id").asText());
        if (staff) jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'LIBRARIAN')", id);
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("identifier", email, "password", "correct-password-123",
                        "remember", false)))).andExpect(status().isOk()).andReturn();
        return new Account(id, json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText());
    }

    private JsonNode create(String token, String path, Object body) throws Exception {
        var result = mvc.perform(post(path).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void readsRealCountsWithOneSnapshotAndRequiresStaff() throws Exception {
        Account staff = account(true);
        Account reader = account(false);
        UUID branch = UUID.fromString(create(staff.token(), "/api/v1/branches",
                Map.of("code", "ACQ", "name", "Chi nhánh đề xuất")).path("id").asText());
        UUID shelf = UUID.fromString(create(staff.token(), "/api/v1/shelves",
                Map.of("branchId", branch, "code", "A1", "label", "Kệ A1")).path("id").asText());
        UUID book = UUID.fromString(create(staff.token(), "/api/v1/books",
                Map.of("title", "Sách cần bổ sung", "authorIds", java.util.List.of(),
                        "categoryIds", java.util.List.of())).path("id").asText());
        UUID edition = UUID.fromString(create(staff.token(), "/api/v1/books/" + book + "/editions",
                Map.of("publicationYear", 2025)).path("id").asText());
        UUID loanCopy = UUID.fromString(create(staff.token(), "/api/v1/copies",
                Map.of("editionId", edition, "barcode", "ACQ-LOAN", "shelfId", shelf)).path("id").asText());
        UUID availableCopy = UUID.fromString(create(staff.token(), "/api/v1/copies",
                Map.of("editionId", edition, "barcode", "ACQ-AVAILABLE", "shelfId", shelf)).path("id").asText());
        jdbc.update("UPDATE book_copies SET status='ON_LOAN' WHERE id=?", loanCopy);
        jdbc.update("UPDATE book_copies SET status='AVAILABLE' WHERE id=?", availableCopy);

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        Instant borrowed = now.minus(2, ChronoUnit.DAYS);
        Instant from = now.minus(7, ChronoUnit.DAYS);
        Instant to = now.minus(1, ChronoUnit.HOURS);
        jdbc.update("""
                INSERT INTO loans(id,copy_id,edition_id,reader_id,branch_id,borrowed_by,borrowed_at,due_at,
                    policy_version,policy_snapshot)
                VALUES (?,?,?,?,?,?,?,?,?,?::jsonb)
                """, UUID.randomUUID(), loanCopy, edition, reader.id(), branch, staff.id(),
                Timestamp.from(borrowed), Timestamp.from(now.plus(14, ChronoUnit.DAYS)), "test-v1", "{}");
        UUID hold = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO holds(id,reader_id,book_id,branch_id,status,queued_at,policy_version,pickup_seconds)
                VALUES (?,?,?,?,'WAITING',?,?,?)
                """, hold, reader.id(), book, branch, Timestamp.from(borrowed), "test-v1", 86400);

        String path = "/api/v1/reports/acquisition-facts";
        mvc.perform(get(path).header("Authorization", "Bearer " + reader.token())
                .param("bookId", book.toString()).param("branchId", branch.toString())
                .param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isForbidden());
        mvc.perform(get(path).header("Authorization", "Bearer " + staff.token())
                .param("bookId", book.toString()).param("branchId", branch.toString())
                .param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.copiesOwned").value(2))
                .andExpect(jsonPath("$.copiesAvailable").value(1))
                .andExpect(jsonPath("$.waitingHolds.count").value(1))
                .andExpect(jsonPath("$.loansStarted.count").value(1))
                .andExpect(jsonPath("$.favoritesAdded.count").isEmpty());

        var copiesRead = new CountDownLatch(1);
        var continueReading = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            copiesRead.countDown();
            if (!continueReading.await(20, TimeUnit.SECONDS))
                throw new IllegalStateException("Timed out waiting for concurrent update.");
            return result;
        }).when(repository).copies(any(UUID.class), any(UUID.class));
        var executor = Executors.newSingleThreadExecutor();
        try {
            var pending = executor.submit(() -> service.load(staff.id(), book, branch,
                    from.toString(), to.toString()));
            assertThat(copiesRead.await(20, TimeUnit.SECONDS)).isTrue();
            jdbc.update("UPDATE holds SET status='CANCELLED', closed_at=? WHERE id=?",
                    Timestamp.from(now), hold);
            continueReading.countDown();
            var snapshot = pending.get(20, TimeUnit.SECONDS);
            assertThat(snapshot.copiesOwned()).isEqualTo(2);
            assertThat(snapshot.waitingHolds().count()).isEqualTo(1);
            assertThat(snapshot.loansStarted().count()).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM holds WHERE status='WAITING'", Long.class))
                    .isZero();
        } finally {
            continueReading.countDown(); executor.shutdownNow();
        }
    }
}
