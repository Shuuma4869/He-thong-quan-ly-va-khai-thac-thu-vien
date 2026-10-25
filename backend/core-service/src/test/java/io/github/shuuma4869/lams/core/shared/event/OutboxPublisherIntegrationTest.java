package io.github.shuuma4869.lams.core.shared.event;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.circulation.loan.api.BorrowRequest;
import io.github.shuuma4869.lams.core.circulation.loan.application.LoanCommandService;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;

@SpringBootTest(properties={"lams.outbox.enabled=true", "lams.outbox.job-enabled=false"})
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class OutboxPublisherIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @Container static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.1.0");
    static final String TOPIC = "lams.circulation.events.v1";
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", DB::getJdbcUrl); p.add("spring.datasource.username", DB::getUsername);
        p.add("spring.datasource.password", DB::getPassword); p.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        p.add("lams.auth.jwt-secret", () -> "outbox-integration-test-secret-at-least-32-bytes");
    }
    @BeforeAll static void topics() throws Exception {
        try (var admin = AdminClient.create(Map.of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(TOPIC, 1, (short)1),
                new NewTopic("lams.hold.events.v1", 1, (short)1))).all().get(20, TimeUnit.SECONDS);
        }
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired OutboxPublisher publisher;
    @Autowired OutboxRepository repository;
    @Autowired ObjectMapper json;
    @Autowired PlatformTransactionManager transactions;
    @Autowired LoanCommandService loans;
    @Autowired org.springframework.kafka.core.DefaultKafkaProducerFactory<String,String> outboxProducerFactory;
    @BeforeEach void clear() { jdbc.update("DELETE FROM outbox_events"); }

    @Test void committedEventKeepsEnvelopeAndKeyAndMarksOnlyAfterAcknowledgement() throws Exception {
        UUID aggregate = UUID.randomUUID(), id = event(aggregate, "COPY_BORROWED", 0);
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
        assertThat(published(id)).isNotNull();
        var records = received(id, 1);
        assertThat(records).hasSize(1);
        assertThat(records.getFirst().key()).isEqualTo(aggregate.toString());
        assertThat(json.readTree(records.getFirst().value()).path("eventId").asText()).isEqualTo(id.toString());
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.IDLE);
    }
    @Test void realBrokerOutageDoesNotUndoLoanAndRetryUsesPersistedRecord() throws Exception {
        UUID loanId = borrow();
        UUID id = jdbc.queryForObject("SELECT id FROM outbox_events WHERE aggregate_id=?", UUID.class, loanId.toString());
        KAFKA.getDockerClient().pauseContainerCmd(KAFKA.getContainerId()).exec();
        try {
            assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.RETRY);
            assertThat(published(id)).isNull();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM loans WHERE id=? AND returned_at IS NULL", Integer.class, loanId)).isOne();
            assertThat(jdbc.queryForObject("SELECT retry_count FROM outbox_events WHERE id=?", Integer.class, id)).isOne();
            assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.IDLE);
        } finally { KAFKA.getDockerClient().unpauseContainerCmd(KAFKA.getContainerId()).exec(); }
        jdbc.update("UPDATE outbox_events SET next_attempt_at=now() WHERE id=?", id);
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
        assertThat(published(id)).isNotNull();
        assertThat(received(id, 1)).isNotEmpty();
    }
    @Test void databaseFailureAfterBrokerAckProducesSameEventIdOnRedelivery() throws Exception {
        UUID id = event(UUID.randomUUID(), "COPY_BORROWED", 0);
        jdbc.execute("CREATE FUNCTION reject_outbox_mark() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only mark failure'; END $$");
        jdbc.execute("CREATE TRIGGER fail_outbox_mark BEFORE UPDATE OF published_at ON outbox_events FOR EACH ROW EXECUTE FUNCTION reject_outbox_mark()");
        try {
            assertThatThrownBy(() -> publisher.publishOne()).isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(published(id)).isNull();
        } finally { jdbc.execute("DROP TRIGGER fail_outbox_mark ON outbox_events"); jdbc.execute("DROP FUNCTION reject_outbox_mark()"); }
        outboxProducerFactory.reset();
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
        var duplicates = received(id, 2);
        assertThat(duplicates).hasSize(2);
        assertThat(duplicates.get(0).value()).isEqualTo(duplicates.get(1).value());
    }
    @Test void lockedAggregateCannotBeOvertakenButOtherAggregatesCanProceed() throws Exception {
        UUID firstAggregate = UUID.randomUUID();
        UUID first = event(firstAggregate, "COPY_BORROWED", 0);
        UUID second = event(firstAggregate, "LOAN_RENEWED", 1);
        UUID other = event(UUID.randomUUID(), "COPY_BORROWED", 0);
        var claimed = new CountDownLatch(1); var release = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var future = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                assertThat(repository.claim().orElseThrow().id()).isEqualTo(first);
                claimed.countDown();
                try { assertThat(release.await(15, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException e) { throw new RuntimeException(e); }
                return null;
            }));
            try {
                assertThat(claimed.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
                assertThat(published(other)).isNotNull(); assertThat(published(first)).isNull(); assertThat(published(second)).isNull();
                assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.IDLE);
            } finally { release.countDown(); }
            future.get(10, TimeUnit.SECONDS);
        }
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
        assertThat(published(first)).isNotNull(); assertThat(published(second)).isNull();
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
        assertThat(published(second)).isNotNull();
    }
    @Test void uncommittedAndRolledBackFactsNeverReachBroker() throws Exception {
        UUID[] id = new UUID[1];
        try (var executor = Executors.newSingleThreadExecutor()) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                id[0] = event(UUID.randomUUID(), "COPY_BORROWED", 0);
                try { assertThat(executor.submit(() -> publisher.publishOne()).get(10, TimeUnit.SECONDS)).isEqualTo(OutboxPublisher.Result.IDLE); }
                catch (Exception e) { throw new RuntimeException(e); }
                status.setRollbackOnly();
            });
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE id=?", Integer.class, id[0])).isZero();
    }
    @Test void badEnvelopeIsRetainedWithBackoffAndDoesNotSendLaterFactForSameAggregate() {
        UUID aggregate = UUID.randomUUID(), first = event(aggregate, "COPY_BORROWED", 0);
        UUID second = event(aggregate, "LOAN_RENEWED", 1);
        jdbc.update("UPDATE outbox_events SET payload=jsonb_set(payload,'{version}','2') WHERE id=?", first);
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.RETRY);
        assertThat(jdbc.queryForObject("SELECT last_error_code FROM outbox_events WHERE id=?", String.class, first)).isEqualTo("INVALID_ENVELOPE");
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.IDLE);
        assertThat(published(second)).isNull();
    }
    @Test void allLoanAndHoldTypesUseTheirDeclaredTopic() throws Exception {
        for (String type : List.of("COPY_BORROWED", "COPY_RETURNED", "LOAN_RENEWED", "HOLD_CREATED", "HOLD_READY", "HOLD_EXPIRED", "HOLD_CANCELLED", "HOLD_FULFILLED")) {
            UUID id = event(UUID.randomUUID(), type, 1);
            assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.SENT);
            assertThat(received(id, 1).getFirst().topic()).isEqualTo(type.startsWith("HOLD_") ? "lams.hold.events.v1" : TOPIC);
        }
    }
    @Test void hugeVersionUnknownTypeAndRetryOverflowRemainRecoverable() {
        UUID id = event(UUID.randomUUID(), "COPY_BORROWED", 0);
        jdbc.update("UPDATE outbox_events SET payload=jsonb_set(payload,'{version}','4294967297'),retry_count=2147483647 WHERE id=?", id);
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.RETRY);
        assertThat(published(id)).isNull();
        assertThat(jdbc.queryForObject("SELECT retry_count FROM outbox_events WHERE id=?", Integer.class, id)).isEqualTo(Integer.MAX_VALUE);
        assertThat(jdbc.queryForObject("SELECT extract(epoch FROM next_attempt_at-clock_timestamp()) FROM outbox_events WHERE id=?", Double.class, id)).isBetween(3500.0, 3600.0);
        UUID unknown = event(UUID.randomUUID(), "FUTURE_EVENT", 0);
        assertThat(publisher.publishOne()).isEqualTo(OutboxPublisher.Result.RETRY);
        assertThat(published(unknown)).isNull();
    }
    private UUID event(UUID aggregate, String type, int version) {
        UUID id = UUID.randomUUID();
        try {
            String payload = json.writeValueAsString(Map.of("eventId", id, "aggregateId", aggregate, "eventType", type,
                "version", 1, "aggregateVersion", version, "occurredAt", Instant.now(), "data", Map.of("loanId", aggregate)));
            jdbc.update("INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES (?,?,?,?,?::jsonb,now())", id, type.startsWith("HOLD_") ? "HOLD" : "LOAN", aggregate.toString(), type, payload);
        } catch (Exception e) { throw new RuntimeException(e); }
        return id;
    }
    private Object published(UUID id) { return jdbc.queryForObject("SELECT published_at FROM outbox_events WHERE id=?", Object.class, id); }
    private List<org.apache.kafka.clients.consumer.ConsumerRecord<String,String>> received(UUID id, int expected) throws Exception {
        var properties = new Properties();
        properties.put("bootstrap.servers", KAFKA.getBootstrapServers()); properties.put("group.id", UUID.randomUUID().toString());
        properties.put("auto.offset.reset", "earliest"); properties.put("enable.auto.commit", "false");
        properties.put("key.deserializer", StringDeserializer.class.getName()); properties.put("value.deserializer", StringDeserializer.class.getName());
        var matches = new ArrayList<org.apache.kafka.clients.consumer.ConsumerRecord<String,String>>();
        try (var consumer = new KafkaConsumer<String,String>(properties)) {
            consumer.subscribe(List.of(TOPIC, "lams.hold.events.v1"));
            long deadline = System.nanoTime()+Duration.ofSeconds(15).toNanos();
            while (matches.size()<expected && System.nanoTime()<deadline) {
                for (var record : consumer.poll(Duration.ofMillis(300)))
                    if (json.readTree(record.value()).path("eventId").asText().equals(id.toString())) matches.add(record);
            }
        }
        return matches;
    }
    private UUID borrow() {
        UUID staff = user("LIBRARIAN"), reader = user("READER"), book = UUID.randomUUID(), edition = UUID.randomUUID();
        UUID branch = UUID.randomUUID(), shelf = UUID.randomUUID(), copy = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Outbox','outbox')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Outbox')", branch, branch.toString().substring(0,20));
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Outbox')", shelf, branch);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?,'AVAILABLE')", copy, edition, copy.toString(), shelf);
        return loans.borrow(staff, new BorrowRequest(UUID.randomUUID(), copy, reader, branch, 0L)).loanId();
    }
    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,'Outbox','test-only','ACTIVE',now(),now())",
            id, id.toString().substring(0,20), id+"@test.local", id+"@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)", id, role); return id;
    }
}
