package io.github.shuuma4869.lams.core.catalog.referencedata;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.catalog.category.application.CategoryAliasService;
import io.github.shuuma4869.lams.core.catalog.category.application.CategoryService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.text.Normalizer;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
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
    @Autowired CategoryService categories;
    @Autowired CategoryAliasService aliases;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void clearReferenceData() {
        jdbc.execute("DROP TRIGGER IF EXISTS trg_audit_fail_alias_update ON category_aliases");
        jdbc.execute("DROP FUNCTION IF EXISTS fn_audit_fail_alias_update()");
        jdbc.execute("DROP TABLE IF EXISTS alias_rollback_fixture");
        jdbc.execute("DROP TABLE IF EXISTS publisher_reference_fixture");
        if (tableExists("book_categories")) jdbc.update("DELETE FROM book_categories");
        if (tableExists("editions")) jdbc.update("DELETE FROM editions");
        jdbc.update("DELETE FROM category_aliases");
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

    private UUID actorId(String token) throws Exception {
        var response = mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn();
        return UUID.fromString(json.readTree(response.getResponse().getContentAsString()).path("id").asText());
    }

    private int statusOf(Callable<?> operation) {
        try {
            operation.call();
            return 201;
        } catch (AuthFailure failure) {
            return failure.status();
        } catch (Exception failure) {
            throw new IllegalStateException("Unexpected namespace write failure", failure);
        }
    }

    private int runContendedWrite(Runnable holderMutation, Callable<Integer> contender) throws Exception {
        CountDownLatch holderReady = new CountDownLatch(1);
        CountDownLatch releaseHolder = new CountDownLatch(1);
        AtomicInteger holderPid = new AtomicInteger();
        TransactionTemplate holderTransaction = new TransactionTemplate(transactionManager);
        holderTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        holderTransaction.setTimeout(10);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = executor.submit(() -> holderTransaction.execute(status -> {
                holderMutation.run();
                holderPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                holderReady.countDown();
                await(releaseHolder, "namespace lock holder release timed out");
                return null;
            }));
            assertThat(holderReady.await(5, TimeUnit.SECONDS)).as("holder committed its DML while retaining its tx lock").isTrue();
            Future<Integer> waitingWrite = executor.submit(contender);
            awaitAdvisoryWaiter(holderPid.get(), 4, TimeUnit.SECONDS);
            releaseHolder.countDown();
            holder.get(5, TimeUnit.SECONDS);
            return waitingWrite.get(5, TimeUnit.SECONDS);
        } finally {
            releaseHolder.countDown();
            executor.shutdownNow();
        }
    }

    private void awaitAdvisoryWaiter(int holderPid, long timeout, TimeUnit unit) {
        long deadline = System.nanoTime() + unit.toNanos(timeout);
        while (System.nanoTime() < deadline) {
            Integer held = jdbc.queryForObject("""
                    SELECT count(*) FROM pg_locks
                    WHERE locktype='advisory' AND granted AND pid=?
                    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
                    AND classid::bigint=((hashtextextended('lams:catalog:category-term',0) >> 32) & 4294967295)
                    AND objid::bigint=(hashtextextended('lams:catalog:category-term',0) & 4294967295)
                    AND objsubid=1
                    """, Integer.class, holderPid);
            Integer waiting = jdbc.queryForObject("""
                    SELECT count(*) FROM pg_locks
                    WHERE locktype='advisory' AND NOT granted AND pid<>?
                    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
                    AND classid::bigint=((hashtextextended('lams:catalog:category-term',0) >> 32) & 4294967295)
                    AND objid::bigint=(hashtextextended('lams:catalog:category-term',0) & 4294967295)
                    AND objsubid=1
                    """, Integer.class, holderPid);
            if (held != null && held > 0 && waiting != null && waiting > 0) return;
            LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
            if (Thread.currentThread().isInterrupted()) throw new AssertionError("interrupted while polling pg_locks");
        }
        throw new AssertionError("PostgreSQL did not show a blocked advisory-lock waiter for holder PID " + holderPid);
    }

    private static void await(CountDownLatch latch, String message) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException(message);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(message, interrupted);
        }
    }

    private void assertTermRows(String normalized, int canonical, int alias) {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name=?",
                Integer.class, normalized)).isEqualTo(canonical);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM category_aliases WHERE normalized_alias=?",
                Integer.class, normalized)).isEqualTo(alias);
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
    void nfcAndNfdCategoryNamesConflictWithoutChangingTheExistingCategory() throws Exception {
        String token = token(true);
        String nfc = Normalizer.normalize("Cà phê", Normalizer.Form.NFC);
        String nfd = Normalizer.normalize(nfc, Normalizer.Form.NFD);
        JsonNode created = create("/api/v1/categories", token, nfc);
        UUID categoryId = UUID.fromString(created.path("id").asText());

        mvc.perform(post("/api/v1/categories").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", nfd))))
                .andExpect(status().isConflict());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT id FROM categories", UUID.class)).isEqualTo(categoryId);
        assertThat(jdbc.queryForObject("SELECT name FROM categories WHERE id=?", String.class, categoryId))
                .isEqualTo("Cà phê");
        assertThat(jdbc.queryForObject("SELECT normalized_name FROM categories WHERE id=?", String.class, categoryId))
                .isEqualTo("cà phê");

        JsonNode unaccented = create("/api/v1/categories", token, "Ca phe");
        JsonNode ma = create("/api/v1/categories", token, "Ma");
        JsonNode maWithAccent = create("/api/v1/categories", token, "Má");
        assertThat(unaccented.path("id").asText()).isNotEqualTo(categoryId.toString());
        assertThat(ma.path("id").asText()).isNotEqualTo(maWithAccent.path("id").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class)).isEqualTo(4);
    }

    @Test
    void unicodeWhitespaceCategoryCollisionPreservesTheOriginalRow() throws Exception {
        String token = token(true);
        JsonNode created = create("/api/v1/categories", token, "\u00a0Khoa\t\u2003  học\u00a0");
        UUID categoryId = UUID.fromString(created.path("id").asText());
        assertThat(created.path("name").asText()).isEqualTo("Khoa học");

        mvc.perform(post("/api/v1/categories").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("name", "Khoa học"))))
                .andExpect(status().isConflict());

        assertThat(jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT id FROM categories", UUID.class)).isEqualTo(categoryId);
        assertThat(jdbc.queryForObject("SELECT normalized_name FROM categories WHERE id=?", String.class, categoryId))
                .isEqualTo("khoa học");
    }

    @Test
    void aliasesResolveDirectlyToOneCanonicalCategoryAndRejectCollisions() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID categoryId = UUID.fromString(create("/api/v1/categories", staffToken, "Cà phê")
                .path("id").asText());

        var coffee = aliases.create(staff, categoryId, "Coffee");
        var cafe = aliases.create(staff, categoryId, "Cafe");
        assertThat(aliases.resolve("  cOfFeE ").id()).isEqualTo(categoryId);
        assertThat(aliases.resolve("cafe").id()).isEqualTo(categoryId);
        assertThat(aliases.resolve("Cà phê").id()).isEqualTo(categoryId);
        assertThat(coffee.categoryId()).isEqualTo(categoryId);
        assertThat(cafe.categoryId()).isEqualTo(categoryId);

        assertThatThrownBy(() -> aliases.create(staff, categoryId, "  COFFEE "))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThatThrownBy(() -> aliases.create(staff, categoryId,
                Normalizer.normalize("Cà phê", Normalizer.Form.NFD)))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThatThrownBy(() -> aliases.create(staff, UUID.randomUUID(), "Unknown target"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
        assertThatThrownBy(() -> aliases.resolve("not registered"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
        assertThatThrownBy(() -> categories.create(staff, "COFFEE"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));

        UUID otherId = UUID.fromString(create("/api/v1/categories", staffToken, "Đồ uống")
                .path("id").asText());
        assertThatThrownBy(() -> categories.update(staff, otherId, "Cafe"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThat(categories.get(staff, otherId).name()).isEqualTo("Đồ uống");
        assertThatThrownBy(() -> aliases.update(staff, coffee.id(), otherId, "Đồ uống"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThat(aliases.resolve("coffee").id()).isEqualTo(categoryId);

        var renamedAlias = aliases.update(staff, coffee.id(), categoryId, "Coffee house");
        assertThat(aliases.resolve("coffee house").id()).isEqualTo(categoryId);
        assertThatThrownBy(() -> aliases.resolve("coffee"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
        assertThat(renamedAlias.id()).isEqualTo(coffee.id());

        assertThatThrownBy(() -> categories.delete(staff, categoryId))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThat(categories.get(staff, categoryId).id()).isEqualTo(categoryId);

        UUID reader = actorId(token(false));
        assertThatThrownBy(() -> aliases.create(reader, categoryId, "Reader alias"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(403));
    }

    @Test
    void aliasHttpManagementRequiresStaffAndPreservesCanonicalCategory() throws Exception {
        String staff = token(true);
        String reader = token(false);
        UUID categoryId = UUID.fromString(create("/api/v1/categories", staff, "Khoa học")
                .path("id").asText());
        String path = "/api/v1/category-aliases";
        String body = json.writeValueAsString(Map.of("categoryId", categoryId, "name", "Science"));

        mvc.perform(get(path).header("Authorization", "Bearer " + reader))
                .andExpect(status().isForbidden());
        mvc.perform(post(path).header("Authorization", "Bearer " + reader)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        var created = mvc.perform(post(path).header("Authorization", "Bearer " + staff)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.categoryId").value(categoryId.toString()))
                .andExpect(jsonPath("$.normalizedAlias").value("science")).andReturn();
        UUID aliasId = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).path("id").asText());
        mvc.perform(post(path).header("Authorization", "Bearer " + staff)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        mvc.perform(get(path).header("Authorization", "Bearer " + staff)
                .param("categoryId", categoryId.toString()).param("page", "0").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(aliasId.toString()));
        mvc.perform(get(path + "/" + aliasId).header("Authorization", "Bearer " + staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Science"));
        mvc.perform(patch(path + "/" + aliasId).header("Authorization", "Bearer " + staff)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("categoryId", categoryId, "name", "Sciences"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.normalizedAlias").value("sciences"));
        assertThat(aliases.resolve("Sciences").id()).isEqualTo(categoryId);
        mvc.perform(delete(path + "/" + aliasId).header("Authorization", "Bearer " + staff))
                .andExpect(status().isNoContent());
        mvc.perform(get(path).header("Authorization", "Bearer " + staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        assertThatThrownBy(() -> aliases.resolve("Sciences"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
    }

    @Test
    void aliasValidationHandlesNullBlankAndDatabaseLengthBoundaries() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID target = UUID.fromString(create("/api/v1/categories", staffToken, "Length target")
                .path("id").asText());

        assertThatThrownBy(() -> aliases.create(staff, target, null))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(422));
        assertThatThrownBy(() -> aliases.create(staff, target, ""))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(422));
        assertThatThrownBy(() -> aliases.create(staff, target, "\u00a0\u2003\t"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(422));

        var maxBmp = aliases.create(staff, target, "x".repeat(150));
        assertThat(maxBmp.normalizedAlias()).hasSize(150);
        assertThatThrownBy(() -> aliases.create(staff, target, "y".repeat(151)))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(422));

        // Java String.length() and PostgreSQL VARCHAR count supplementary characters differently.
        var nonBmpAtCurrentJavaBoundary = aliases.create(staff, target, "😀".repeat(75));
        assertThat(nonBmpAtCurrentJavaBoundary.normalizedAlias().length()).isEqualTo(150);
        assertThatThrownBy(() -> aliases.create(staff, target, "🚀".repeat(76)))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(422));
        assertThat(aliases.resolve("😀".repeat(75)).id()).isEqualTo(target);
    }

    @Test
    void resolverRejectsAnAmbiguousCanonicalAndAliasTerm() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID canonicalId = UUID.fromString(create("/api/v1/categories", staffToken, "Khoa học")
                .path("id").asText());
        UUID otherId = UUID.fromString(create("/api/v1/categories", staffToken, "Khác")
                .path("id").asText());

        // Simulate a legacy/manual row bypassing the service-level cross-table invariant.
        jdbc.update("INSERT INTO category_aliases(id,category_id,alias_name,normalized_alias) VALUES (?,?,?,?)",
                UUID.randomUUID(), otherId, "Bí danh lỗi", "khoa học");

        assertThatThrownBy(() -> aliases.resolve("KHOA HỌC"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));
        assertThat(categories.get(staff, canonicalId).id()).isEqualTo(canonicalId);
    }

    @Test
    void aliasKeysPreserveVietnameseAccentsAndUnicodeWhitespaceRules() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID firstCategory = UUID.fromString(create("/api/v1/categories", staffToken, "Khoa học")
                .path("id").asText());
        UUID secondCategory = UUID.fromString(create("/api/v1/categories", staffToken, "Văn học")
                .path("id").asText());

        aliases.create(staff, firstCategory, "Ma");
        aliases.create(staff, secondCategory, "Má");
        aliases.create(staff, firstCategory, "\u00a0Từ\t  khóa\u2003");
        String nfcAlias = Normalizer.normalize("Nhãn thay thế", Normalizer.Form.NFC);
        String nfdAlias = Normalizer.normalize(nfcAlias, Normalizer.Form.NFD);
        aliases.create(staff, firstCategory, nfcAlias);
        assertThatThrownBy(() -> aliases.create(staff, secondCategory, nfdAlias))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(409));

        assertThat(aliases.resolve("ma").id()).isEqualTo(firstCategory);
        assertThat(aliases.resolve("má").id()).isEqualTo(secondCategory);
        assertThat(aliases.resolve(" từ\u2003KHÓA ").id()).isEqualTo(firstCategory);
        assertThat(aliases.resolve(nfdAlias).id()).isEqualTo(firstCategory);
    }

    @Test
    void concurrentCategoryAndAliasWritesCannotClaimTheSameNormalizedTerm() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID targetId = UUID.fromString(create("/api/v1/categories", staffToken, "Target")
                .path("id").asText());
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var categoryWrite = executor.submit(() -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Category write gate timeout");
                try { categories.create(staff, "Concurrency term"); return 201; }
                catch (AuthFailure conflict) { return conflict.status(); }
            });
            var aliasWrite = executor.submit(() -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Alias write gate timeout");
                try { aliases.create(staff, targetId, " CONCURRENCY   TERM "); return 201; }
                catch (AuthFailure conflict) { return conflict.status(); }
            });
            start.countDown();
            assertThat(java.util.List.of(categoryWrite.get(10, TimeUnit.SECONDS),
                    aliasWrite.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 409);

            String key = "concurrency term";
            int canonicalMatches = jdbc.queryForObject(
                    "SELECT count(*) FROM categories WHERE normalized_name=?", Integer.class, key);
            int aliasMatches = jdbc.queryForObject(
                    "SELECT count(*) FROM category_aliases WHERE normalized_alias=?", Integer.class, key);
            assertThat(canonicalMatches + aliasMatches).isOne();
            assertThat(aliases.resolve("Concurrency term").id()).isNotNull();
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void repeatableReadCallerWithAnExistingSnapshotIsRejectedAndRolledBack() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID target = UUID.fromString(create("/api/v1/categories", staffToken, "RR target")
                .path("id").asText());
        UUID marker = UUID.randomUUID();
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch canonicalCommitted = new CountDownLatch(1);
        var repeatableRead = new TransactionTemplate(transactionManager);
        repeatableRead.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        var executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> outer = executor.submit(() -> repeatableRead.execute(status -> {
                jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?,?,?)",
                        marker, "RR rollback marker", "rr rollback marker");
                assertThat(jdbc.queryForObject("SHOW transaction_isolation", String.class))
                        .isEqualTo("repeatable read");
                jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class); // Establish the RR snapshot.
                snapshotReady.countDown();
                await(canonicalCommitted, "canonical writer did not commit");
                aliases.create(staff, target, "RR race term");
                return null;
            }));

            assertThat(snapshotReady.await(5, TimeUnit.SECONDS)).isTrue();
            categories.create(staff, "RR race term");
            canonicalCommitted.countDown();

            assertThatThrownBy(() -> outer.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(AuthFailure.class);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name=?",
                    Integer.class, "rr race term")).isOne();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM category_aliases WHERE normalized_alias=?",
                    Integer.class, "rr race term")).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE id=?",
                    Integer.class, marker)).isZero(); // Outer caller's earlier write rolled back.

            UUID categoryMarker = UUID.randomUUID();
            CountDownLatch categorySnapshotReady = new CountDownLatch(1);
            CountDownLatch aliasCommitted = new CountDownLatch(1);
            var categoryExecutor = Executors.newSingleThreadExecutor();
            try {
                Future<?> categoryOuter = categoryExecutor.submit(() -> repeatableRead.execute(status -> {
                    jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?,?,?)",
                            categoryMarker, "RR category rollback marker", "rr category rollback marker");
                    assertThat(jdbc.queryForObject("SHOW transaction_isolation", String.class))
                            .isEqualTo("repeatable read");
                    jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class);
                    categorySnapshotReady.countDown();
                    await(aliasCommitted, "alias writer did not commit");
                    categories.create(staff, "RR category race");
                    return null;
                }));

                assertThat(categorySnapshotReady.await(5, TimeUnit.SECONDS)).isTrue();
                aliases.create(staff, target, "RR category race");
                aliasCommitted.countDown();

                assertThatThrownBy(() -> categoryOuter.get(10, TimeUnit.SECONDS))
                        .isInstanceOf(ExecutionException.class)
                        .hasCauseInstanceOf(AuthFailure.class);
                assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name=?",
                        Integer.class, "rr category race")).isZero();
                assertThat(jdbc.queryForObject("SELECT count(*) FROM category_aliases WHERE normalized_alias=?",
                        Integer.class, "rr category race")).isOne();
                assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE id=?",
                        Integer.class, categoryMarker)).isZero();
            } finally {
                aliasCommitted.countDown();
                categoryExecutor.shutdownNow();
            }
        } finally {
            canonicalCommitted.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void namespaceWritesWaitForTheRealPostgresAdvisoryLockAcrossWritePairs() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID targetOne = UUID.fromString(create("/api/v1/categories", staffToken, "Lock target one")
                .path("id").asText());
        UUID targetTwo = UUID.fromString(create("/api/v1/categories", staffToken, "Lock target two")
                .path("id").asText());
        UUID renameCategory = UUID.fromString(create("/api/v1/categories", staffToken, "Rename source")
                .path("id").asText());
        UUID renameAgainstAlias = UUID.fromString(create("/api/v1/categories", staffToken, "Alias rename source")
                .path("id").asText());
        UUID deleteCategory = UUID.fromString(create("/api/v1/categories", staffToken, "Delete namespace term")
                .path("id").asText());

        int createRaceStatus = runContendedWrite(() -> categories.create(staff, "Race create"),
                () -> statusOf(() -> aliases.create(staff, targetOne, "Race create")));
        assertThat(createRaceStatus).as("canonical=%s alias=%s",
                jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name='race create'", Integer.class),
                jdbc.queryForObject("SELECT count(*) FROM category_aliases WHERE normalized_alias='race create'", Integer.class))
                .isEqualTo(409);
        assertTermRows("race create", 1, 0);

        assertThat(runContendedWrite(() -> categories.update(staff, renameCategory, "Race rename"),
                () -> statusOf(() -> aliases.create(staff, targetOne, "Race rename"))))
                .isEqualTo(409);
        assertThat(categories.get(staff, renameCategory).name()).isEqualTo("Race rename");
        assertTermRows("race rename", 1, 0);

        var updateToCreate = aliases.create(staff, targetOne, "Alias update source one");
        assertThat(runContendedWrite(() -> aliases.update(staff, updateToCreate.id(), targetOne, "Race update-create"),
                () -> statusOf(() -> categories.create(staff, "Race update-create"))))
                .isEqualTo(409);
        assertThat(aliases.resolve("race update-create").id()).isEqualTo(targetOne);
        assertTermRows("race update-create", 0, 1);

        var updateToRename = aliases.create(staff, targetOne, "Alias update source two");
        assertThat(runContendedWrite(() -> aliases.update(staff, updateToRename.id(), targetOne, "Race update-rename"),
                () -> statusOf(() -> categories.update(staff, renameAgainstAlias, "Race update-rename"))))
                .isEqualTo(409);
        assertThat(aliases.resolve("race update-rename").id()).isEqualTo(targetOne);
        assertThat(categories.get(staff, renameAgainstAlias).name()).isEqualTo("Alias rename source");
        assertTermRows("race update-rename", 0, 1);

        assertThat(runContendedWrite(() -> aliases.create(staff, targetOne, "Race alias-alias"),
                () -> statusOf(() -> aliases.create(staff, targetTwo, "Race alias-alias"))))
                .isEqualTo(409);
        assertThat(aliases.resolve("race alias-alias").id()).isEqualTo(targetOne);
        assertTermRows("race alias-alias", 0, 1);

        assertThat(runContendedWrite(() -> categories.delete(staff, deleteCategory),
                () -> statusOf(() -> aliases.create(staff, targetOne, "Delete namespace term"))))
                .isEqualTo(201);
        assertThat(categories.list(staff, "0", "100").items()).noneMatch(c -> c.id().equals(deleteCategory));
        assertThat(aliases.resolve("Delete namespace term").id()).isEqualTo(targetOne);
        assertTermRows("delete namespace term", 0, 1);
    }

    @Test
    void namespaceLockTimeoutRollsBackAndReturnsTheExistingConflictStatus() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        CountDownLatch releaseHolder = new CountDownLatch(1);
        CountDownLatch holderReady = new CountDownLatch(1);
        AtomicInteger holderPid = new AtomicInteger();
        var readCommitted = new TransactionTemplate(transactionManager);
        readCommitted.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        readCommitted.setTimeout(15);
        var executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = executor.submit(() -> readCommitted.execute(status -> {
                categories.create(staff, "Timeout holder term");
                holderPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                holderReady.countDown();
                await(releaseHolder, "test did not release advisory lock holder");
                return null;
            }));
            assertThat(holderReady.await(5, TimeUnit.SECONDS)).isTrue();
            Future<Integer> waiter = executor.submit(() -> statusOf(() -> categories.create(staff, "Timeout waiter term")));
            awaitAdvisoryWaiter(holderPid.get(), 4, TimeUnit.SECONDS);
            assertThat(waiter.get(8, TimeUnit.SECONDS)).isEqualTo(409);
            releaseHolder.countDown();
            holder.get(5, TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name=?",
                    Integer.class, "timeout holder term")).isOne();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM categories WHERE normalized_name=?",
                    Integer.class, "timeout waiter term")).isZero();
        } finally {
            releaseHolder.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void aliasUpdateFailureAfterTriggerDmlRollsBackBothAliasAndSideEffect() throws Exception {
        String staffToken = token(true);
        UUID staff = actorId(staffToken);
        UUID target = UUID.fromString(create("/api/v1/categories", staffToken, "Rollback target")
                .path("id").asText());
        var alias = aliases.create(staff, target, "Rollback alias");
        jdbc.execute("CREATE TABLE alias_rollback_fixture(id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
        jdbc.update("INSERT INTO alias_rollback_fixture(id,value) VALUES (1,'before')");
        jdbc.execute("""
                CREATE FUNCTION fn_audit_fail_alias_update() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    UPDATE alias_rollback_fixture SET value='after' WHERE id=1;
                    RAISE EXCEPTION 'forced failure after trigger DML';
                END;
                $$
                """);
        jdbc.execute("CREATE TRIGGER trg_audit_fail_alias_update AFTER UPDATE ON category_aliases "
                + "FOR EACH ROW EXECUTE FUNCTION fn_audit_fail_alias_update()");

        assertThatThrownBy(() -> aliases.update(staff, alias.id(), target, "Rolled back alias"))
                .isInstanceOf(DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT alias_name FROM category_aliases WHERE id=?", String.class, alias.id()))
                .isEqualTo("Rollback alias");
        assertThat(jdbc.queryForObject("SELECT normalized_alias FROM category_aliases WHERE id=?",
                String.class, alias.id())).isEqualTo("rollback alias");
        assertThat(jdbc.queryForObject("SELECT value FROM alias_rollback_fixture WHERE id=1", String.class))
                .isEqualTo("before");
        assertThat(aliases.resolve("rollback alias").id()).isEqualTo(target);
        assertThatThrownBy(() -> aliases.resolve("rolled back alias"))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
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
