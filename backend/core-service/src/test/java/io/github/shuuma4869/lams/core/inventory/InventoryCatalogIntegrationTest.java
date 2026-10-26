package io.github.shuuma4869.lams.core.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.inventory.copy.application.InventoryScopeQueryService;
import io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeFilter;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.InventoryScopeRepository;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doAnswer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
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
        registry.add("lams.inventory.scope-batch-size", () -> 1);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired InventoryScopeQueryService inventoryScope;
    @Autowired AuthService authService;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoSpyBean InventoryScopeRepository inventoryScopeRepository;

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

    @Test void barcodeLookupIsExactReadOnlyAndRequiresCurrentStaff() throws Exception {
        String token=staffToken(); UUID branch=branch(token,"LOOKUP","Chi nhánh tra cứu");
        UUID shelf=shelf(token,branch,"L1","Kệ tra cứu"),edition=edition(token);
        var copy=postJson(token,"/api/v1/copies",Map.of("editionId",edition,"barcode","A_%'/?","shelfId",shelf),201);
        String path="/api/v1/copies/by-barcode";
        mvc.perform(get(path).header("Authorization","Bearer "+token).param("barcode"," A_%'/? "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(copy.path("id").asText()))
                .andExpect(jsonPath("$.version").value(0)).andExpect(jsonPath("$.status").value("IN_PROCESS"));
        for(String missing:List.of("A_%","a_%'/?","' OR 1=1--"))
            mvc.perform(get(path).header("Authorization","Bearer "+token).param("barcode",missing)).andExpect(status().isNotFound());
        for(String invalid:List.of(" ","A".repeat(101)))
            mvc.perform(get(path).header("Authorization","Bearer "+token).param("barcode",invalid)).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).param("barcode","A_%'/?")).andExpect(status().isUnauthorized());
        var user=mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andReturn();
        UUID actor=UUID.fromString(json.readTree(user.getResponse().getContentAsString()).path("id").asText());
        jdbc.update("DELETE FROM user_roles WHERE user_id=? AND role_code='LIBRARIAN'",actor);
        mvc.perform(get(path).header("Authorization","Bearer "+token).param("barcode","A_%'/?")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_copies",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT version FROM book_copies WHERE id=?",Long.class,UUID.fromString(copy.path("id").asText()))).isZero();
    }

    private String staffToken() throws Exception {
        return staffToken("LIBRARIAN");
    }

    private String staffToken(String role) throws Exception {
        String email = "inventory-" + UUID.randomUUID() + "@example.test";
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Nhân viên", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated());
        UUID userId = jdbc.queryForObject("SELECT id FROM users WHERE email_normalized=?", UUID.class, email);
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?, ?)", userId, role);
        var login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", email,
                                "password", "correct-password-123", "remember", false))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(login.getResponse().getContentAsString()).path("accessToken").asText();
    }

    private UUID actorId(String token) throws Exception {
        var response = mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn();
        return UUID.fromString(json.readTree(response.getResponse().getContentAsString()).path("id").asText());
    }

    private String readerToken() throws Exception {
        String email = "inventory-reader-" + UUID.randomUUID() + "@example.test";
        var registration = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("fullName", "Bạn đọc", "email", email,
                                "password", "correct-password-123"))))
                .andExpect(status().isCreated()).andReturn();
        return json.readTree(registration.getResponse().getContentAsString()).path("accessToken").asText();
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

    @Test
    void inventoryQueriesFilterBranchShelfAndCopyWithoutChangingState() throws Exception {
        String token = staffToken();
        UUID activeBranch = branch(token, "Q-A", "Chi nhánh query A");
        UUID disabledBranch = UUID.fromString(postJson(token, "/api/v1/branches",
                Map.of("code", "Q-B", "name", "Chi nhánh query B", "status", "DISABLED"), 201)
                .path("id").asText());

        UUID activeShelf = shelf(token, activeBranch, "Q-1", "Kệ query A");
        UUID otherShelf = shelf(token, disabledBranch, "Q-1", "Kệ query B");
        UUID editionId = edition(token);
        var first = postJson(token, "/api/v1/copies", Map.of("editionId", editionId,
                "barcode", "A_%'/?", "shelfId", activeShelf), 201);
        UUID firstCopy = UUID.fromString(first.path("id").asText());
        var second = postJson(token, "/api/v1/copies", Map.of("editionId", editionId,
                "barcode", "SCOPE-A2", "shelfId", activeShelf), 201);
        UUID secondCopy = UUID.fromString(second.path("id").asText());
        var other = postJson(token, "/api/v1/copies", Map.of("editionId", editionId,
                "barcode", "SCOPE-B", "shelfId", otherShelf), 201);
        UUID otherCopy = UUID.fromString(other.path("id").asText());
        jdbc.update("UPDATE book_copies SET status='AVAILABLE' WHERE id IN (?,?)", firstCopy, secondCopy);
        jdbc.update("UPDATE book_copies SET status='LOST' WHERE id=?", otherCopy);

        mvc.perform(get("/api/v1/shelves").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(activeShelf.toString()));
        mvc.perform(get("/api/v1/shelves").header("Authorization", "Bearer " + token)
                        .param("branchId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("status", "AVAILABLE")
                        .param("page", "0").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].id").value(firstCopy.toString()))
                .andExpect(jsonPath("$.items[0].copyId").value(firstCopy.toString()))
                .andExpect(jsonPath("$.items[0].branchId").value(activeBranch.toString()))
                .andExpect(jsonPath("$.items[0].shelfId").value(activeShelf.toString()))
                .andExpect(jsonPath("$.items[0].barcode").value("A_%'/?"))
                .andExpect(jsonPath("$.items[0].status").value("AVAILABLE"))
                .andExpect(jsonPath("$.items[0].version").value(0));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("status", "AVAILABLE")
                        .param("page", "1").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(secondCopy.toString()));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("shelfId", activeShelf.toString())
                        .param("barcode", " A_%'/? ").param("status", "available"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].copyId").value(firstCopy.toString()));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("barcode", "a_%'/?"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("barcode", "A_%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("shelfId", otherShelf.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", disabledBranch.toString()).param("status", "LOST"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(otherCopy.toString()));
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("shelfId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + token)
                        .param("branchId", activeBranch.toString()).param("status", "UNKNOWN"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + readerToken()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/copies")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/copies").header("Authorization", "Bearer " + staffToken("ADMIN")))
                .andExpect(status().isOk());

        assertThat(jdbc.query("SELECT status,version FROM book_copies WHERE id IN (?,?,?) ORDER BY barcode",
                (rs, row) -> rs.getString("status") + ":" + rs.getLong("version"), firstCopy, secondCopy, otherCopy))
                .containsExactly("AVAILABLE:0", "AVAILABLE:0", "LOST:0");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM book_copies WHERE id=? AND version=0", Integer.class, firstCopy)).isOne();
    }

    @Test
    void repeatableReadSnapshotKeepsAllKeysetBatchesAtOneDatabaseState() throws Exception {
        String token = staffToken();
        UUID actor = actorId(token);
        UUID branch = branch(token, "SNAP", "Snapshot");
        UUID shelf = shelf(token, branch, "S-1", "Snapshot shelf");
        UUID edition = edition(token);
        var first = postJson(token, "/api/v1/copies", Map.of("editionId", edition,
                "barcode", "SNAP-A", "shelfId", shelf), 201);
        var second = postJson(token, "/api/v1/copies", Map.of("editionId", edition,
                "barcode", "SNAP-B", "shelfId", shelf), 201);
        UUID firstId = UUID.fromString(first.path("id").asText());
        UUID secondId = UUID.fromString(second.path("id").asText());
        jdbc.update("UPDATE book_copies SET status='AVAILABLE' WHERE id IN (?,?)", firstId, secondId);

        var firstBatchRead = new CountDownLatch(1);
        var allowSnapshotToContinue = new CountDownLatch(1);
        var paused = new AtomicBoolean();
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            var batch = (List<io.github.shuuma4869.lams.core.inventory.copy.domain.InventoryScopeCopy>)
                    invocation.callRealMethod();
            if (paused.compareAndSet(false, true)) {
                firstBatchRead.countDown();
                if (!allowSnapshotToContinue.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Timed out waiting to continue snapshot test.");
                }
            }
            return batch;
        }).when(inventoryScopeRepository).nextBatch(any(InventoryScopeFilter.class), nullable(String.class),
                nullable(UUID.class), anyInt());

        var executor = Executors.newSingleThreadExecutor();
        try {
            var future = executor.submit(() -> inventoryScope.snapshot(actor,
                    new InventoryScopeFilter(branch, null, shelf, null, "AVAILABLE")));
            assertThat(firstBatchRead.await(10, TimeUnit.SECONDS)).isTrue();
            new TransactionTemplate(transactionManager).executeWithoutResult(transaction ->
                    jdbc.update("UPDATE book_copies SET status='LOST',version=version+1 WHERE id=?", secondId));
            allowSnapshotToContinue.countDown();
            var snapshot = future.get(10, TimeUnit.SECONDS);

            assertThat(snapshot).extracting("copyId").containsExactly(firstId, secondId);
            assertThat(snapshot).extracting("status").containsExactly("AVAILABLE", "AVAILABLE");
            assertThat(snapshot).extracting("version").containsExactly(0L, 0L);
            assertThat(jdbc.queryForObject("SELECT status FROM book_copies WHERE id=?", String.class, secondId))
                    .isEqualTo("LOST");
            assertThat(jdbc.queryForObject("SELECT version FROM book_copies WHERE id=?", Long.class, secondId))
                    .isEqualTo(1L);
        } finally {
            allowSnapshotToContinue.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void pagedCountAndItemsKeepOneDatabaseSnapshotDuringConcurrentInsert() throws Exception {
        String token = staffToken();
        UUID actor = actorId(token);
        UUID branch = branch(token, "PAGE", "Trang nhất quán");
        UUID shelf = shelf(token, branch, "P-1", "Kệ phân trang");
        UUID edition = edition(token);
        postJson(token, "/api/v1/copies", Map.of("editionId", edition,
                "barcode", "PAGE-A", "shelfId", shelf), 201);

        var countRead = new CountDownLatch(1);
        var allowItems = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object count = invocation.callRealMethod();
            countRead.countDown();
            if (!allowItems.await(20, TimeUnit.SECONDS))
                throw new IllegalStateException("Timed out waiting to continue page test.");
            return count;
        }).when(inventoryScopeRepository).count(any(InventoryScopeFilter.class));

        var executor = Executors.newSingleThreadExecutor();
        try {
            var filter = new InventoryScopeFilter(branch, null, shelf, null, null);
            var future = executor.submit(() -> inventoryScope.page(actor, filter, "0", "20"));
            assertThat(countRead.await(20, TimeUnit.SECONDS)).isTrue();
            postJson(token, "/api/v1/copies", Map.of("editionId", edition,
                    "barcode", "PAGE-B", "shelfId", shelf), 201);
            allowItems.countDown();
            var result = future.get(20, TimeUnit.SECONDS);
            assertThat(result.page().totalElements()).isEqualTo(1);
            assertThat(result.items()).extracting("barcode").containsExactly("PAGE-A");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM book_copies WHERE shelf_id=?",
                    Long.class, shelf)).isEqualTo(2);
        } finally {
            allowItems.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void snapshotRejectsScopeLargerThanSessionLimitBeforeReturningIt() throws Exception {
        String token = staffToken();
        UUID actor = actorId(token);
        UUID branch = branch(token, "BOUND", "Giới hạn snapshot");
        UUID shelf = shelf(token, branch, "B-1", "Kệ lớn");
        UUID edition = edition(token);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status,version) "
                + "SELECT gen_random_uuid(), ?, 'BOUND-' || lpad(n::text, 5, '0'), ?, 'AVAILABLE', 0 "
                + "FROM generate_series(1, 5001) AS n", edition, shelf);

        // Use a larger batch for this boundary test; the concurrency test above keeps batch size 1.
        var bounded = new InventoryScopeQueryService(inventoryScopeRepository, authService, 1000);
        assertThatThrownBy(() -> bounded.snapshot(actor,
                new InventoryScopeFilter(branch, null, shelf, null, null)))
                .isInstanceOf(AuthFailure.class)
                .hasMessageContaining("vượt 5000");
    }
}
