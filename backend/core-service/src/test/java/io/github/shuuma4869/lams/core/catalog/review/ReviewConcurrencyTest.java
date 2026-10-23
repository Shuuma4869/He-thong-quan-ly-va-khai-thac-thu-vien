package io.github.shuuma4869.lams.core.catalog.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.shuuma4869.lams.core.catalog.review.application.ReviewService;
import io.github.shuuma4869.lams.core.catalog.review.domain.Review;
import io.github.shuuma4869.lams.core.catalog.review.infrastructure.ReviewRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
class ReviewConcurrencyTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::getJdbcUrl);
        r.add("spring.datasource.username", DB::getUsername);
        r.add("spring.datasource.password", DB::getPassword);
        r.add("lams.auth.jwt-secret", () -> "review-concurrency-test-secret-at-least-32-bytes");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthService identity;
    @Autowired ReviewService service;
    @Autowired ReviewRepository repository;
    @Autowired PlatformTransactionManager transactions;
    @Autowired io.github.shuuma4869.lams.core.catalog.favorite.application.FavoriteService favorites;

    private record Fixture(UUID user, UUID book, UUID review) {}
    private Fixture fixture() {
        UUID user = UUID.randomUUID(), book = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                + "VALUES (?,?,?,?,'Concurrency','test-only','ACTIVE',now(),now())",
                user, user.toString().substring(0, 20), user + "@test.local", user + "@test.local");
        jdbc.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'READER')", user);
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Concurrency','concurrency')", book);
        return new Fixture(user, book, service.create(user, book, "Ban đầu", 3).id());
    }

    private static void await(CountDownLatch latch) {
        try { assertThat(latch.await(10, TimeUnit.SECONDS)).as("Điểm đồng bộ transaction").isTrue(); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
    }

    // Chỉ chèn điểm đồng bộ sau SELECT thật; service, SQL và hai transaction đều chạy trên PostgreSQL.
    private ReviewService afterFirstReads(CountDownLatch read, CountDownLatch release, int count) {
        var remaining = new AtomicInteger(count);
        var coordinated = new ReviewRepository(jdbc) {
            @Override public Optional<Review> find(UUID book, UUID review) {
                var result = super.find(book, review);
                if (remaining.getAndDecrement() > 0) { read.countDown(); await(release); }
                return result;
            }
        };
        return new ReviewService(coordinated, identity);
    }

    @Test void concurrentBodyAndRatingPatchesPreserveBothChanges() throws Exception {
        var f = fixture();
        var read = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        var coordinated = afterFirstReads(read, release, 2);
        var tx = new TransactionTemplate(transactions);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var body = pool.submit(() -> tx.execute(s -> coordinated.update(f.user, f.book, f.review, "Nội dung mới", null)));
            var rating = pool.submit(() -> tx.execute(s -> coordinated.update(f.user, f.book, f.review, null, 5)));
            try { await(read); } finally { release.countDown(); }
            body.get(15, TimeUnit.SECONDS); rating.get(15, TimeUnit.SECONDS);
        }
        var result = repository.find(f.book, f.review).orElseThrow();
        assertThat(result.body()).isEqualTo("Nội dung mới");
        assertThat(result.rating()).isEqualTo(5);
    }

    @Test void sameFieldUsesLastDatabaseWriteAndDoesNotRestoreAnUnchangedField() throws Exception {
        var f = fixture();
        var read = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var delayed = afterFirstReads(read, release, 1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var last = pool.submit(() -> new TransactionTemplate(transactions).execute(
                    s -> delayed.update(f.user, f.book, f.review, "Ghi sau", null)));
            try { await(read); service.update(f.user, f.book, f.review, "Ghi trước", 5); }
            finally { release.countDown(); }
            last.get(15, TimeUnit.SECONDS);
        }
        var result = repository.find(f.book, f.review).orElseThrow();
        assertThat(result.body()).isEqualTo("Ghi sau");
        assertThat(result.rating()).isEqualTo(5);
    }

    @Test void deletionAfterOwnerReadCannotBeUndoneByPatch() throws Exception {
        var f = fixture();
        var read = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var delayed = afterFirstReads(read, release, 1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var patch = pool.submit(() -> new TransactionTemplate(transactions).execute(
                    s -> delayed.update(f.user, f.book, f.review, "Không được phục hồi", null)));
            try { await(read); service.delete(f.user, f.book, f.review); }
            finally { release.countDown(); }
            assertThatThrownBy(() -> patch.get(15, TimeUnit.SECONDS)).hasCauseInstanceOf(AuthFailure.class)
                    .satisfies(e -> assertThat(((AuthFailure) e.getCause()).status()).isEqualTo(404));
        }
        assertThat(repository.find(f.book, f.review)).isEmpty();
    }

    @Test void bookDeletionDuringReviewInsertReturnsNotFound() throws Exception { bookDeletionDuringInsert(false); }
    @Test void bookDeletionDuringFavoriteInsertReturnsNotFound() throws Exception { bookDeletionDuringInsert(true); }

    private void bookDeletionDuringInsert(boolean favorite) throws Exception {
        var f = fixture();
        service.delete(f.user, f.book, f.review);
        var deleted = new CountDownLatch(1);
        var commit = new CountDownLatch(1);
        var pid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var deleting = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(s -> {
                pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                jdbc.update("DELETE FROM books WHERE id=?", f.book);
                deleted.countDown(); await(commit);
            }));
            await(deleted);
            var creating = pool.submit(() -> favorite ? favorites.add(f.user, f.book)
                    : service.create(f.user, f.book, "Race", 4));
            try {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
                boolean blocked = false;
                while (System.nanoTime() < deadline && !creating.isDone()) {
                    blocked = Boolean.TRUE.equals(jdbc.queryForObject(
                            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)))",
                            Boolean.class, pid.get()));
                    if (blocked) break;
                    Thread.onSpinWait();
                }
                assertThat(blocked).as("INSERT thực sự chờ transaction xóa Book tại FK").isTrue();
            } finally { commit.countDown(); }
            deleting.get(15, TimeUnit.SECONDS);
            assertThatThrownBy(() -> creating.get(15, TimeUnit.SECONDS)).hasCauseInstanceOf(AuthFailure.class)
                    .satisfies(e -> assertThat(((AuthFailure) e.getCause()).status()).isEqualTo(404));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reviews WHERE book_id=?", Integer.class, f.book)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM favorites WHERE book_id=?", Integer.class, f.book)).isZero();
    }
}
