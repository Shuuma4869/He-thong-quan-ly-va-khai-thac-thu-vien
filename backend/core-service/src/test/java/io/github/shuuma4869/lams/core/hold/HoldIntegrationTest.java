package io.github.shuuma4869.lams.core.hold;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.circulation.loan.api.*;
import io.github.shuuma4869.lams.core.circulation.loan.application.LoanCommandService;
import io.github.shuuma4869.lams.core.circulation.loan.application.LoanRenewalService;
import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import io.github.shuuma4869.lams.core.hold.api.HoldRequest;
import io.github.shuuma4869.lams.core.hold.application.HoldQueries;
import io.github.shuuma4869.lams.core.hold.application.HoldNoShowService;
import io.github.shuuma4869.lams.core.hold.application.HoldService;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(properties="lams.circulation.hold-job-enabled=false")
@AutoConfigureMockMvc
@Import(HoldIntegrationTest.TimeConfig.class)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class HoldIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB=new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",DB::getJdbcUrl);
        p.add("spring.datasource.username",DB::getUsername);
        p.add("spring.datasource.password",DB::getPassword);
        p.add("lams.auth.jwt-secret",()->"hold-integration-test-secret-at-least-32-bytes");
    }
    static class TestClock extends Clock {
        volatile Instant value;
        @Override public Instant instant() {return value;}
        @Override public ZoneId getZone() {return ZoneOffset.UTC;}
        @Override public Clock withZone(ZoneId zone) {return Clock.fixed(value,zone);}
    }
    @TestConfiguration static class TimeConfig {
        @Bean @Primary TestClock testClock() {return new TestClock();}
    }
    @Autowired TestClock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired HoldService service;
    @Autowired HoldRepository holds;
    @Autowired HoldQueries queries;
    @Autowired HoldNoShowService noShows;
    @Autowired LoanCommandService loans;
    @Autowired LoanRenewalService renewals;
    @Autowired CopyStateService states;
    @Autowired io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository locks;
    @Autowired PlatformTransactionManager transactions;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @BeforeEach void time() {clock.value=Instant.now().truncatedTo(ChronoUnit.MICROS);}

    record Fixture(UUID staff,UUID reader,UUID book,UUID edition,UUID branch,UUID shelf,UUID copy) {}

    @Test void availableCopyIsReservedAndOnlyOwnerCanPickUpWithSafeReplay() {
        var f=fixture(); var request=request(f,f.edition,false); var hold=service.create(f.reader,request);
        assertThat(hold.status()).isEqualTo("READY");
        assertThat(hold.expiresAt()).isEqualTo(clock.instant().plus(Duration.ofHours(48)));
        assertThat(service.create(f.reader,request)).isEqualTo(hold);
        failure(409,()->loans.borrow(f.staff,borrow(f,user("READER"))));
        var pickup=borrow(f,f.reader); var loan=loans.borrow(f.staff,pickup);
        assertThat(holds.find(hold.id()).orElseThrow().status()).isEqualTo("FULFILLED");
        assertThat(holds.find(hold.id()).orElseThrow().loanId()).isEqualTo(loan.loanId());
        assertThat(loans.borrow(f.staff,pickup)).isEqualTo(loan);
        assertThat(count("hold_changes","hold_id",hold.id())).isEqualTo(3);
        assertThat(copyStatus(f.copy)).isEqualTo("ON_LOAN");
    }

    @Test void duplicateActiveBookAcrossBranchesAndAmbiguousEditionAreRejected() {
        var f=fixture(); var hold=service.create(f.reader,request(f,null,true));
        UUID branch=branch();
        copyAt(f,branch,f.edition,"AVAILABLE");
        failure(409,()->service.create(f.reader,new HoldRequest(UUID.randomUUID(),f.book,branch,f.edition,false)));
        failure(422,()->service.create(user("READER"),request(f,f.edition,true)));
        failure(422,()->service.create(user("READER"),request(f,null,false)));
        failure(422,()->service.create(user("READER"),request(f,UUID.randomUUID(),false)));
        service.cancel(f.reader,hold.id(),version(hold.version()));
        assertThat(service.create(f.reader,new HoldRequest(UUID.randomUUID(),f.book,branch,f.edition,false)).status()).isEqualTo("READY");
    }

    @Test void refusesHoldWhenSelectedBranchHasNoManagedPhysicalCopy() {
        var f=fixture();
        jdbc.update("UPDATE book_copies SET status='WITHDRAWN' WHERE id=?",f.copy);
        failure(409,()->service.create(f.reader,request(f,f.edition,false)));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM holds WHERE book_id=?",Integer.class,f.book)).isZero();
    }

    @Test void returnAllocatesCompatibleQueueAndCancellationPassesCopyToNextReader() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        UUID different=edition(f.book), first=user("READER"), second=user("READER"), third=user("READER");
        copyAt(f,f.branch,different,"IN_PROCESS");
        var incompatible=service.create(first,request(f,different,false));
        tick(); var a=service.create(second,request(f,f.edition,false));
        tick(); var b=service.create(third,request(f,null,true));
        var returned=loans.returnLoan(f.staff,loan.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L));
        assertThat(returned.copyVersion()).isEqualTo(4);
        assertThat(holds.find(incompatible.id()).orElseThrow().status()).isEqualTo("WAITING");
        assertThat(holds.find(a.id()).orElseThrow().status()).isEqualTo("READY");
        var cancel=version(1); var closed=service.cancel(second,a.id(),cancel);
        assertThat(service.cancel(second,a.id(),cancel)).isEqualTo(closed);
        assertThat(holds.find(b.id()).orElseThrow().status()).isEqualTo("READY");
        assertThat(copyStatus(f.copy)).isEqualTo("ON_HOLD");
    }

    @Test void expiryBoundaryBlocksPickupAndRepeatedWorkerReallocatesOnlyOnce() {
        var f=fixture(); var first=service.create(f.reader,request(f,null,true));
        tick(); UUID other=user("READER"); var next=service.create(other,request(f,null,true));
        clock.value=first.expiresAt();
        failure(409,()->loans.borrow(f.staff,borrow(f,f.reader)));
        var job=new io.github.shuuma4869.lams.core.hold.application.HoldExpiryJob(jdbc,service);
        job.sweep(); job.sweep();
        assertThat(holds.find(first.id()).orElseThrow().status()).isEqualTo("EXPIRED");
        var ready=holds.find(next.id()).orElseThrow();
        assertThat(ready.status()).isEqualTo("READY");
        assertThat(ready.expiresAt()).isEqualTo(clock.instant().plus(Duration.ofHours(48)));
        assertThat(count("hold_changes","hold_id",next.id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM holds WHERE copy_id=? AND status='READY'",Integer.class,f.copy)).isOne();
    }

    @Test void noShowNeedsBusinessEventAndAdminDecisionWithVersionedAudit() throws Exception {
        var f = fixture();
        var active = service.create(f.reader, request(f, null, true));
        assertThat(noShows.mine(f.reader).unreviewed()).isZero();
        failure(404, () -> noShows.decide(user("ADMIN"), active.id(), 0, "CONFIRMED", "Đã kiểm tra tại quầy"));
        clock.value = active.expiresAt();
        service.reconcileBook(f.book);
        var initial = noShows.mine(f.reader);
        assertThat(initial.unreviewed()).isOne();
        assertThat(initial.confirmed()).isZero();
        assertThat(initial.restrictionsEnabled()).isFalse();
        assertThat(initial.recentIncidents().getFirst().decision()).isEqualTo("UNREVIEWED");
        assertThat(noShows.forStaff(f.staff, f.reader).unreviewed()).isOne();
        failure(403, () -> noShows.forStaff(f.reader, f.reader));
        failure(403, () -> noShows.decide(f.staff, active.id(), 0, "CONFIRMED", "Đã kiểm tra tại quầy"));
        UUID admin = user("ADMIN");
        var confirmed = noShows.decide(admin, active.id(), 0, "CONFIRMED", "Đã đối chiếu sổ nhận sách");
        assertThat(confirmed.confirmed()).isOne();
        assertThat(confirmed.recentIncidents().getFirst().decisionVersion()).isOne();
        failure(409, () -> noShows.decide(admin, active.id(), 0, "EXCUSED", "Chi nhánh đã đóng cửa"));
        var excused = noShows.decide(admin, active.id(), 1, "EXCUSED", "Chi nhánh đã đóng cửa");
        assertThat(excused.confirmed()).isZero();
        assertThat(excused.excused()).isOne();
        assertThat(count("hold_no_show_decisions", "hold_id", active.id())).isEqualTo(2);
        var owner = jwt().jwt(j -> j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        mvc.perform(get("/api/v1/me/hold-reliability").with(owner)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/staff/readers/" + f.reader + "/hold-reliability").with(owner))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me/hold-reliability")).andExpect(status().isUnauthorized());
        String path = "/api/v1/admin/holds/" + active.id() + "/no-show";
        String body = "{\"expectedVersion\":2,\"decision\":\"CONFIRMED\",\"reason\":\"Đã đối chiếu lại tại quầy\"}";
        mvc.perform(patch(path).with(owner).contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        var adminToken = jwt().jwt(j -> j.subject(admin.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
        mvc.perform(patch(path).with(adminToken).contentType("application/json").content(body))
                .andExpect(status().isOk());
        assertThat(count("hold_no_show_decisions", "hold_id", active.id())).isEqualTo(3);
    }

    @Test void competingNoShowDecisionsKeepOneVersionAndPreserveEvidence() throws Exception {
        var f = fixture();
        var hold = service.create(f.reader, request(f, null, true));
        clock.value = hold.expiresAt();
        service.reconcileBook(f.book);
        UUID firstAdmin = user("ADMIN"), secondAdmin = user("ADMIN");
        assertThat(race(() -> noShows.decide(firstAdmin, hold.id(), 0, "CONFIRMED", "Đã đối chiếu tại quầy"),
                () -> noShows.decide(secondAdmin, hold.id(), 0, "EXCUSED", "Chi nhánh đóng cửa đột xuất")))
                .containsExactlyInAnyOrder(200, 409);
        assertThat(count("hold_no_show_decisions", "hold_id", hold.id())).isOne();
        assertThat(noShows.mine(f.reader).confirmed() + noShows.mine(f.reader).excused()).isOne();
    }

    @Test void suspendedReaderIsSkippedWithoutLosingQueueAndCanReceiveAfterReactivation() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        UUID a=user("READER"), b=user("READER"); var first=service.create(a,request(f,null,true));
        tick(); var next=service.create(b,request(f,null,true));
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?",a);
        loans.returnLoan(f.staff,loan.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L));
        assertThat(holds.find(first.id()).orElseThrow().status()).isEqualTo("WAITING");
        assertThat(holds.find(next.id()).orElseThrow().status()).isEqualTo("READY");
        jdbc.update("UPDATE users SET status='ACTIVE' WHERE id=?",a);
        service.cancel(b,next.id(),version(1));
        assertThat(holds.find(first.id()).orElseThrow().status()).isEqualTo("READY");
    }

    @Test void equalQueueTimesUsePostgresUuidOrderAndNeverChooseAnotherBranch() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        var a=service.create(user("READER"),request(f,null,true));
        var b=service.create(user("READER"),request(f,null,true));
        UUID otherBranch=branch();
        copyAt(f,otherBranch,f.edition,"IN_PROCESS");
        var elsewhere=service.create(user("READER"),new HoldRequest(UUID.randomUUID(),f.book,otherBranch,null,true));
        UUID expected=jdbc.queryForObject("SELECT id FROM holds WHERE book_id=? AND branch_id=? ORDER BY queued_at,id LIMIT 1",UUID.class,f.book,f.branch);
        loans.returnLoan(f.staff,loan.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L));
        assertThat(holds.assigned(f.copy).orElseThrow().id()).isEqualTo(expected);
        assertThat(holds.find(elsewhere.id()).orElseThrow().status()).isEqualTo("WAITING");
        assertThat(queries.get(f.staff,expected).queuePosition()).isNull();
        UUID waiting=expected.equals(a.id())?b.id():a.id();
        assertThat(queries.get(f.staff,waiting).queuePosition()).isOne();
    }

    @Test void rollbackRemovesHoldAssignmentAuditOutboxAndReceipt() {
        var f=fixture(); var request=request(f,null,true);
        assertThatThrownBy(()->new TransactionTemplate(transactions).executeWithoutResult(s->{
            service.create(f.reader,request); throw new IllegalStateException("rollback");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count("holds","book_id",f.book)).isZero();
        assertThat(count("circulation_requests","request_id",request.requestId())).isZero();
        assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE payload->'data'->>'bookId'=?",Integer.class,f.book.toString())).isZero();
        assertThat(service.create(f.reader,request).status()).isEqualTo("READY");
    }

    @Test void concurrentCreatesReserveOnceAndDuplicateReaderRequestConflicts() throws Exception {
        var f=fixture(); UUID other=user("READER");
        assertThat(race(()->service.create(f.reader,request(f,null,true)),()->service.create(other,request(f,null,true))))
                .containsExactlyInAnyOrder(200,200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM holds WHERE book_id=? AND status='READY'",Integer.class,f.book)).isOne();
        var g=fixture();
        assertThat(race(()->service.create(g.reader,request(g,null,true)),()->service.create(g.reader,request(g,null,true))))
                .containsExactlyInAnyOrder(200,409);
        assertThat(count("holds","book_id",g.book)).isOne();
    }

    @Test void cancelAndReturnRacingLeaveNoCancelledAssignment() throws Exception {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        UUID reader=user("READER"); var hold=service.create(reader,request(f,null,true));
        var results=race(()->service.cancel(reader,hold.id(),version(0)),
                ()->loans.returnLoan(f.staff,loan.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L)));
        assertThat(results.get(1)).isEqualTo(200);
        var current=holds.find(hold.id()).orElseThrow();
        if(results.get(0)==200) {
            assertThat(current.status()).isEqualTo("CANCELLED"); assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
        } else {
            assertThat(results.get(0)).isEqualTo(409); assertThat(current.status()).isEqualTo("READY");
            service.cancel(reader,hold.id(),version(current.version()));
            assertThat(copyStatus(f.copy)).isEqualTo("AVAILABLE");
        }
    }

    @Test void renewUsesPreviousDueDatePreservesBorrowPolicyAndReplaysWithoutSecondExtension() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader)); var request=version(0);
        String snapshot=jdbc.queryForObject("SELECT policy_snapshot::text FROM loans WHERE id=?",String.class,loan.loanId());
        var renewed=renewals.renew(f.reader,loan.loanId(),request);
        assertThat(renewed.dueAt()).isEqualTo(loan.dueAt().plus(Duration.ofDays(7)));
        assertThat(renewed.renewalCount()).isOne(); assertThat(renewed.version()).isOne();
        assertThat(renewals.renew(f.reader,loan.loanId(),request)).isEqualTo(renewed);
        assertThat(count("loan_extensions","loan_id",loan.loanId())).isOne();
        assertThat(jdbc.queryForObject("SELECT policy_snapshot::text FROM loans WHERE id=?",String.class,loan.loanId())).isEqualTo(snapshot);
        failure(409,()->renewals.renew(f.staff,loan.loanId(),version(1)));
        failure(403,()->renewals.renew(user("READER"),loan.loanId(),version(1)));
    }

    @Test void renewBlocksCompatibleWaitingHoldButNotDifferentEditionOrBranch() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        UUID otherEdition=edition(f.book);
        copyAt(f,f.branch,otherEdition,"IN_PROCESS");
        service.create(user("READER"),request(f,otherEdition,false));
        UUID otherBranch=branch();
        copyAt(f,otherBranch,f.edition,"IN_PROCESS");
        service.create(user("READER"),new HoldRequest(UUID.randomUUID(),f.book,otherBranch,null,true));
        UUID waiting=user("READER"); var hold=service.create(waiting,request(f,null,true));
        failure(409,()->renewals.renew(f.reader,loan.loanId(),version(0)));
        service.cancel(waiting,hold.id(),version(0));
        assertThat(renewals.renew(f.reader,loan.loanId(),version(0)).renewalCount()).isOne();
    }

    @Test void renewAtDeadlineOrForLockedReaderIsRejectedAndRollbackPreservesDueDate() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?",f.reader);
        failure(403,()->renewals.renew(f.staff,loan.loanId(),version(0)));
        jdbc.update("UPDATE users SET status='ACTIVE' WHERE id=?",f.reader);
        var request=version(0);
        assertThatThrownBy(()->new TransactionTemplate(transactions).executeWithoutResult(s->{
            renewals.renew(f.reader,loan.loanId(),request); throw new IllegalStateException("rollback");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count("loan_extensions","loan_id",loan.loanId())).isZero();
        assertThat(count("circulation_requests","request_id",request.requestId())).isZero();
        assertThat(jdbc.queryForObject("SELECT due_at FROM loans WHERE id=?",Timestamp.class,loan.loanId()).toInstant()).isEqualTo(loan.dueAt());
        clock.value=loan.dueAt(); failure(409,()->renewals.renew(f.reader,loan.loanId(),request));
    }

    @Test void concurrentRenewAndReturnCannotLoseVersionOrExtendReturnedLoan() throws Exception {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        assertThat(race(()->renewals.renew(f.reader,loan.loanId(),version(0)),()->renewals.renew(f.staff,loan.loanId(),version(0))))
                .containsExactlyInAnyOrder(200,409);
        assertThat(count("loan_extensions","loan_id",loan.loanId())).isOne();
        var g=fixture(); var other=loans.borrow(g.staff,borrow(g,g.reader));
        assertThat(race(()->renewals.renew(g.reader,other.loanId(),version(0)),
                ()->loans.returnLoan(g.staff,other.loanId(),new ReturnRequest(UUID.randomUUID(),g.branch,0L))))
                .containsExactlyInAnyOrder(200,409);
        if(copyStatus(g.copy).equals("ON_LOAN")) loans.returnLoan(g.staff,other.loanId(),new ReturnRequest(UUID.randomUUID(),g.branch,1L));
        failure(409,()->renewals.renew(g.reader,other.loanId(),version(2)));
        assertThat(copyStatus(g.copy)).isEqualTo("AVAILABLE");
    }

    @Test void httpEnforcesOwnerValidationCurrentRoleAndPrivatePagination() throws Exception {
        var f=fixture(); UUID outsider=user("READER"); var hold=service.create(f.reader,request(f,null,true));
        var owner=jwt().jwt(j->j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        var other=jwt().jwt(j->j.subject(outsider.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        mvc.perform(get("/api/v1/me/holds")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/holds/"+hold.id()).with(other)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/holds/"+hold.id()+"/cancel").with(other).contentType("application/json").content(json.writeValueAsString(version(1))))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/holds").with(owner).contentType("application/json").content("{}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/me/holds?size=101").with(owner)).andExpect(status().isUnprocessableEntity());
        var response=mvc.perform(get("/api/v1/me/holds").with(other)).andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(response.getResponse().getContentAsString()).path("items")).isEmpty();
        assertThat(queries.mine(f.reader,null,null).items()).hasSize(1);
        mvc.perform(get("/api/v1/holds/queue").param("bookId",f.book.toString()).param("branchId",f.branch.toString()).with(owner))
                .andExpect(status().isForbidden());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",f.reader);
        mvc.perform(get("/api/v1/me/holds").with(owner)).andExpect(status().isForbidden());
    }

    @Test void cancellationWaitsForBookLockThenRejectsVersionChangedByReturn() {
        var f=fixture(); var loan=loans.borrow(f.staff,borrow(f,f.reader));
        UUID reader=user("READER"); var hold=service.create(reader,request(f,null,true));
        try(var pool=Executors.newSingleThreadExecutor()) {
            var future=new TransactionTemplate(transactions).execute(s->{
                int holder=jdbc.queryForObject("SELECT pg_backend_pid()",Integer.class);
                locks.lockBook(f.book);
                var pending=pool.submit(()->service.cancel(reader,hold.id(),version(0)));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(4); boolean blocked=false;
                while(System.nanoTime()<deadline && !blocked) {
                    jdbc.queryForList("SELECT pg_stat_clear_snapshot()");
                    blocked=Boolean.TRUE.equals(jdbc.queryForObject("""
                            SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid))
                            AND query LIKE '%pg_advisory_xact_lock%')
                            """,Boolean.class,holder));
                    Thread.yield();
                }
                assertThat(blocked).as("Hủy giữ chỗ chờ khóa Book thực tại PostgreSQL").isTrue();
                loans.returnLoan(f.staff,loan.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L));
                return pending;
            });
            assertThatThrownBy(()->future.get(10,TimeUnit.SECONDS)).hasCauseInstanceOf(AuthFailure.class)
                    .satisfies(e->assertThat(((AuthFailure)e.getCause()).status()).isEqualTo(409));
        }
        assertThat(holds.find(hold.id()).orElseThrow().status()).isEqualTo("READY");
    }

    @Test void twoConcurrentReturnsAssignDifferentCopiesToDifferentReaders() throws Exception {
        var f=fixture(); var first=loans.borrow(f.staff,borrow(f,f.reader));
        UUID copy=UUID.randomUUID();
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)",copy,f.edition,copy.toString(),f.shelf);
        states.change(f.staff,copy,UUID.randomUUID(),0,"AVAILABLE","Đã kiểm tra nhập kho");
        var second=loans.borrow(f.staff,new BorrowRequest(UUID.randomUUID(),copy,f.reader,f.branch,1L));
        var a=service.create(user("READER"),request(f,null,true)); tick();
        var b=service.create(user("READER"),request(f,null,true));
        assertThat(race(()->loans.returnLoan(f.staff,first.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L)),
                ()->loans.returnLoan(f.staff,second.loanId(),new ReturnRequest(UUID.randomUUID(),f.branch,0L))))
                .containsExactly(200,200);
        Hold readyA=holds.find(a.id()).orElseThrow(),readyB=holds.find(b.id()).orElseThrow();
        assertThat(readyA.status()).isEqualTo("READY"); assertThat(readyB.status()).isEqualTo("READY");
        assertThat(readyA.copyId()).isNotEqualTo(readyB.copyId());
    }

    @Test void httpCreateRenewAndCancelUseRealContractsAndRejectFractionalVersion() throws Exception {
        var f=fixture(); var owner=jwt().jwt(j->j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        var response=mvc.perform(post("/api/v1/holds").with(owner).contentType("application/json")
                .content(json.writeValueAsString(request(f,f.edition,false)))).andExpect(status().isCreated()).andReturn();
        Hold hold=json.readValue(response.getResponse().getContentAsString(),Hold.class);
        String cancel=json.writeValueAsString(version(1));
        mvc.perform(post("/api/v1/holds/"+hold.id()+"/cancel").with(owner).contentType("application/json")
                .content(cancel.replace("\"version\":1","\"version\":1.5"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/holds/"+hold.id()+"/cancel").with(owner).contentType("application/json").content(cancel)).andExpect(status().isOk());
        var loan=loans.borrow(f.staff,borrow(f,f.reader)); String path="/api/v1/loans/"+loan.loanId()+"/renew";
        mvc.perform(post(path).contentType("application/json").content(json.writeValueAsString(version(0)))).andExpect(status().isUnauthorized());
        mvc.perform(post(path).with(owner).contentType("application/json").content("{}" )).andExpect(status().isUnprocessableEntity());
        mvc.perform(post(path).with(owner).contentType("application/json").content(json.writeValueAsString(version(0)))).andExpect(status().isOk());
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?",f.reader);
        mvc.perform(post(path).with(owner).contentType("application/json").content(json.writeValueAsString(version(1)))).andExpect(status().isForbidden());
    }

    @Test void staffHoldWorkspaceFiltersExpiredPickupAndReturnsOnlyOperationalReaderData() throws Exception {
        var f=fixture();
        var ready=service.create(f.reader,request(f,f.edition,false));
        UUID waitingReader=user("READER");
        var waiting=service.create(waitingReader,request(f,f.edition,false));
        var staff=jwt().jwt(j->j.subject(f.staff.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        var reader=jwt().jwt(j->j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        String memberCode=jdbc.queryForObject("SELECT member_code FROM users WHERE id=?",String.class,waitingReader);

        var summary=json.readTree(mvc.perform(get("/api/v1/staff/holds/summary").with(staff))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(summary.get("ready").asLong()).isGreaterThanOrEqualTo(1);
        assertThat(summary.get("waiting").asLong()).isGreaterThanOrEqualTo(1);

        var filtered=json.readTree(mvc.perform(get("/api/v1/staff/holds").with(staff)
                        .param("status","WAITING").param("reader",memberCode))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(filtered.at("/page/totalElements").asLong()).isEqualTo(1);
        assertThat(filtered.at("/items/0/hold/id").asText()).isEqualTo(waiting.id().toString());
        assertThat(filtered.toString()).contains(memberCode).doesNotContain("email","phone");

        var detail=json.readTree(mvc.perform(get("/api/v1/staff/holds/"+ready.id()).with(staff))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(detail.at("/item/hold/id").asText()).isEqualTo(ready.id().toString());
        assertThat(detail.get("history").isArray()).isTrue();
        clock.value=ready.expiresAt().plusSeconds(1);
        service.reconcileBook(f.book);
        assertThat(holds.find(ready.id()).orElseThrow().status()).isEqualTo("EXPIRED");
        var soon=json.readTree(mvc.perform(get("/api/v1/staff/holds").with(staff)
                        .param("status","READY").param("reader",jdbc.queryForObject(
                                "SELECT member_code FROM users WHERE id=?",String.class,f.reader))
                        .param("expiresBefore",Instant.now().plus(Duration.ofDays(3)).toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(soon.at("/page/totalElements").asLong()).isZero();
        mvc.perform(get("/api/v1/staff/holds/summary").with(reader)).andExpect(status().isForbidden());
    }

    @Test void readerCanListOnlyActivePickupBranchesWithoutInventoryAdminAccess() throws Exception {
        var f=fixture(); UUID disabled=branch();
        jdbc.update("UPDATE branches SET status='DISABLED' WHERE id=?",disabled);
        var principal=jwt().jwt(j->j.subject(f.reader.toString())).authorities(new SimpleGrantedAuthority("ROLE_READER"));
        var response=mvc.perform(get("/api/v1/holds/pickup-branches").param("size","100").with(principal))
                .andExpect(status().isOk()).andReturn().getResponse();
        var rows=json.readTree(response.getContentAsString()).get("items");
        assertThat(rows.toString()).contains(f.branch.toString()).doesNotContain(disabled.toString(),"createdAt","updatedAt");
        assertThat(rows.get(0).size()).isEqualTo(3);
        mvc.perform(get("/api/v1/holds/pickup-branches")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/branches").with(principal)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/holds/pickup-branches").param("size","0").with(principal)).andExpect(status().isUnprocessableEntity());
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?",f.reader);
        mvc.perform(get("/api/v1/holds/pickup-branches").with(principal)).andExpect(status().isForbidden());
    }

    @Test void holdViewsIncludeLabelsAndPreserveQueuePositionsAndPageOrder() {
        var f=fixture(); loans.borrow(f.staff,borrow(f,f.reader));
        var first=service.create(user("READER"),request(f,null,true)); tick();
        var second=service.create(f.reader,request(f,f.edition,false));
        var queue=queries.queue(f.staff,f.book,f.branch,"0","10");
        assertThat(queue.items()).extracting(v->v.hold().id()).containsExactly(first.id(),second.id());
        assertThat(queue.items()).extracting(HoldQueries.HoldView::queuePosition).containsExactly(1L,2L);
        var mine=queries.mine(f.reader,"0","10").items().getFirst();
        assertThat(mine.bookTitle()).isEqualTo("Sách thử giữ chỗ");assertThat(mine.branchName()).isEqualTo("Chi nhánh thử");
        assertThat(queries.get(f.reader,second.id())).isEqualTo(mine);
        service.cancel(f.reader,second.id(),version(0));
        assertThat(queries.get(f.reader,second.id()).queuePosition()).isNull();
    }

    private Fixture fixture() {
        UUID staff=user("LIBRARIAN"),reader=user("READER"),book=UUID.randomUUID(),branch=branch(),shelf=UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách thử giữ chỗ','sach thu giu cho')",book);
        UUID edition=edition(book),copy=UUID.randomUUID();
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Kệ thử')",shelf,branch);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)",copy,edition,copy.toString(),shelf);
        states.change(staff,copy,UUID.randomUUID(),0,"AVAILABLE","Đã kiểm tra nhập kho");
        return new Fixture(staff,reader,book,edition,branch,shelf,copy);
    }
    private UUID copyAt(Fixture f,UUID branch,UUID edition,String status) {
        UUID shelf=UUID.randomUUID(),copy=UUID.randomUUID();
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S2','Kệ bổ sung')",shelf,branch);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id) VALUES (?,?,?,?)",copy,edition,copy.toString(),shelf);
        if(status.equals("AVAILABLE")) states.change(f.staff,copy,UUID.randomUUID(),0,status,"Đã kiểm tra nhập kho");
        else assertThat(status).isEqualTo("IN_PROCESS");
        return copy;
    }
    private UUID branch() {
        UUID id=UUID.randomUUID(); jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Chi nhánh thử')",id,id.toString().substring(0,20)); return id;
    }
    private UUID edition(UUID book) {
        UUID id=UUID.randomUUID(); jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)",id,book); return id;
    }
    private UUID user(String role) {
        UUID id=UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'Người thử giữ chỗ','test-only','ACTIVE',now(),now())
                """,id,id.toString().substring(0,20),id+"@test.local",id+"@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)",id,role); return id;
    }
    private HoldRequest request(Fixture f,UUID edition,boolean any) {return new HoldRequest(UUID.randomUUID(),f.book,f.branch,edition,any);}
    private VersionedRequest version(long n) {return new VersionedRequest(UUID.randomUUID(),n);}
    private BorrowRequest borrow(Fixture f,UUID reader) {
        return new BorrowRequest(UUID.randomUUID(),f.copy,reader,f.branch,jdbc.queryForObject("SELECT version FROM book_copies WHERE id=?",Long.class,f.copy));
    }
    private void tick() {clock.value=clock.value.plusSeconds(1);}
    private String copyStatus(UUID copy) {return jdbc.queryForObject("SELECT status FROM book_copies WHERE id=?",String.class,copy);}
    private int count(String table,String column,UUID id) {return jdbc.queryForObject("SELECT count(*) FROM "+table+" WHERE "+column+"=?",Integer.class,id);}
    private static void failure(int status,Runnable run) {
        assertThatThrownBy(run::run).isInstanceOfSatisfying(AuthFailure.class,e->assertThat(e.status()).isEqualTo(status));
    }
    private List<Integer> race(Supplier<?> a,Supplier<?> b) throws Exception {
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var tasks=List.of(a,b).stream().map(action->pool.submit(()->{
                ready.countDown(); assertThat(start.await(5,TimeUnit.SECONDS)).isTrue();
                try {action.get();return 200;} catch(AuthFailure e){return e.status();}
            })).toList();
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); start.countDown();
            return List.of(tasks.get(0).get(15,TimeUnit.SECONDS),tasks.get(1).get(15,TimeUnit.SECONDS));
        } finally {start.countDown();}
    }
}
