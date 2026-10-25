package io.github.shuuma4869.lams.core.inventory;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.audit.api.InventoryRequests;
import io.github.shuuma4869.lams.core.inventory.audit.api.InventoryResolutionRequest;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventoryQueryService;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventoryResolutionService;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventorySessionService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.annotation.DirtiesContext;
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
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class InventorySessionIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB=new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p){
        p.add("spring.datasource.url",DB::getJdbcUrl);p.add("spring.datasource.username",DB::getUsername);p.add("spring.datasource.password",DB::getPassword);
        p.add("lams.auth.jwt-secret",()->"inventory-test-secret-at-least-32-bytes");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired InventorySessionService service;
    @Autowired InventoryQueryService query;
    @Autowired InventoryResolutionService resolutions;
    @Autowired MockMvc mvc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    record Fixture(UUID actor,UUID branch,UUID shelf,UUID copy,String barcode) {}
    @Test void snapshotIsFixedAndStartReplayDoesNotOpenAnotherSession(){
        var f=fixture(); var request=new InventoryRequests.Start(UUID.randomUUID(),f.branch,f.shelf);
        var session=service.start(f.actor,request); assertThat(service.start(f.actor,request)).isEqualTo(session);
        jdbc.update("UPDATE book_copies SET status='LOST',version=version+1 WHERE id=?",f.copy);
        var snapshot=query.snapshot(f.actor,session.id(),0,20);
        assertThat(snapshot.items()).hasSize(1); assertThat(snapshot.items().getFirst().status()).isEqualTo("AVAILABLE");
        assertThat(snapshot.items().getFirst().version()).isZero();
        assertThatThrownBy(()->service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null))).isInstanceOf(AuthFailure.class);
        var cancel=new InventoryRequests.Close(UUID.randomUUID(),0L,"Mở lại phạm vi khác");
        assertThat(service.close(f.actor,session.id(),cancel,true).status()).isEqualTo("CANCELLED");
        assertThat(service.close(f.actor,session.id(),cancel,true).status()).isEqualTo("CANCELLED");
        assertThat(service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null)).id()).isNotEqualTo(session.id());
    }
    @Test void scansAreIdempotentAndUnknownBarcodeIsKeptWithoutChangingCopy(){
        var f=fixture(); var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        var scan=new InventoryRequests.Scan(UUID.randomUUID()," UNKNOWN_%' ",f.shelf,null);
        var first=service.scan(f.actor,session.id(),scan);
        assertThat(service.scan(f.actor,session.id(),scan)).isEqualTo(first);
        assertThat(query.scans(f.actor,session.id(),0,20).items()).hasSize(1);
        assertThat(query.get(f.actor,session.id()).scanCount()).isOne();
        assertThatThrownBy(()->service.scan(f.actor,session.id(),new InventoryRequests.Scan(scan.clientScanId(),f.barcode,f.shelf,null))).isInstanceOf(AuthFailure.class);
        var close=new InventoryRequests.Close(UUID.randomUUID(),1L,null);
        service.close(f.actor,session.id(),close,false);
        assertThat(service.scan(f.actor,session.id(),scan)).isEqualTo(first);
        assertThatThrownBy(()->service.scan(f.actor,session.id(),new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,null))).isInstanceOf(AuthFailure.class);
        assertThat(jdbc.queryForObject("SELECT status FROM book_copies WHERE id=?",String.class,f.copy)).isEqualTo("AVAILABLE");
    }
    @Test void finalizationRecordsAllSixKindsOnceWithFrozenEvidence(){
        var f=fixture(); var other=fixture();
        UUID secondShelf=shelf(f.branch),missing=copy(f.shelf,"AVAILABLE"),changed=copy(f.shelf,"AVAILABLE");
        var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        jdbc.update("UPDATE book_copies SET status='ON_LOAN',version=version+1 WHERE id=?",changed);
        scan(f,session.id(),f.barcode,secondShelf); scan(f,session.id(),f.barcode,secondShelf);
        scan(f,session.id(),changed.toString(),f.shelf);scan(f,session.id(),other.barcode,f.shelf);scan(f,session.id(),"unknown",f.shelf);
        var close=new InventoryRequests.Close(UUID.randomUUID(),5L,null);
        var closed=service.close(f.actor,session.id(),close,false);
        assertThat(closed.status()).isEqualTo("FINALIZED");
        var anomalies=query.anomalies(f.actor,session.id(),0,100);
        assertThat(anomalies.items().stream().map(a->a.kind()).distinct()).containsExactlyInAnyOrder("WRONG_SHELF","EXPECTED_BUT_MISSING","STATUS_MISMATCH","WRONG_BRANCH","UNKNOWN_BARCODE","DUPLICATE_SCAN");
        assertThat(anomalies.items().stream().filter(a->a.kind().equals("EXPECTED_BUT_MISSING")).findFirst().orElseThrow().copyId()).isEqualTo(missing);
        assertThat(service.close(f.actor,session.id(),close,false)).isEqualTo(closed);
        jdbc.update("UPDATE book_copies SET status='LOST',version=version+1 WHERE id=?",changed);
        assertThat(query.anomalies(f.actor,session.id(),0,100)).isEqualTo(anomalies);
        assertThatThrownBy(()->service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),closed.version(),null),false)).isInstanceOf(AuthFailure.class);
    }
    @Test void invalidScopeDisabledBranchClockAndStaleVersionAreRejected(){
        var f=fixture();var other=fixture();
        assertThatThrownBy(()->service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,other.shelf))).isInstanceOf(AuthFailure.class);
        var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,f.shelf));
        assertThatThrownBy(()->service.scan(f.actor,session.id(),new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,other.shelf,null))).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(()->service.scan(f.actor,session.id(),new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,Instant.parse("2999-01-01T00:00:00Z")))).isInstanceOf(AuthFailure.class);
        scan(f,session.id(),f.barcode,f.shelf);
        assertThatThrownBy(()->service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),0L,null),false)).isInstanceOf(AuthFailure.class);
        assertThat(query.get(f.actor,session.id()).status()).isEqualTo("OPEN");
        jdbc.update("UPDATE branches SET status='DISABLED' WHERE id=?",other.branch);
        assertThatThrownBy(()->service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),other.branch,null))).isInstanceOf(AuthFailure.class);
    }
    @Test void currentRoleAndPaginationApplyToEveryReadAndMutation() throws Exception {
        var f=fixture();var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        var auth=jwt().jwt(j->j.subject(f.actor.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        String base="/api/v1/inventory-sessions";
        mvc.perform(get(base)).andExpect(status().isUnauthorized());
        mvc.perform(get(base).with(auth)).andExpect(status().isOk());
        mvc.perform(get(base).param("size","101").with(auth)).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(base+"/"+session.id()+"/snapshot").with(auth)).andExpect(jsonPath("$.items[0].barcode").value(f.barcode));
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",f.actor);jdbc.update("INSERT INTO user_roles VALUES (?,'READER')",f.actor);
        for(String path:List.of(base,base+"/"+session.id(),base+"/"+session.id()+"/snapshot",base+"/"+session.id()+"/scans",base+"/"+session.id()+"/anomalies"))
            mvc.perform(get(path).with(auth)).andExpect(status().isForbidden());
        assertThatThrownBy(()->service.scan(f.actor,session.id(),new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,null))).isInstanceOf(AuthFailure.class);
    }
    @Test void duplicateScanRequestsInParallelProduceOneReceiptAndOneRow() throws Exception {
        var f=fixture();var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        var scan=new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,null);
        try(var executor=Executors.newFixedThreadPool(2)){
            var start=new CountDownLatch(1);
            Callable<InventorySessionService.ScanResult> task=()->{start.await();return service.scan(f.actor,session.id(),scan);};
            var a=executor.submit(task);var b=executor.submit(task);start.countDown();
            assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));
        }
        assertThat(query.get(f.actor,session.id()).scanCount()).isOne();
    }
    @Test void snapshotSeesCommittedLocationAndDoesNotWaitForUncommittedCopyMove() throws Exception {
        var f=fixture();UUID target=shelf(f.branch);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try(var executor=Executors.newSingleThreadExecutor()){
            var move=executor.submit(()->new TransactionTemplate(transactions).execute(status->{
                jdbc.update("UPDATE book_copies SET shelf_id=?,version=version+1 WHERE id=?",target,f.copy);locked.countDown();
                try {if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;
            }));
            try {
                assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
                var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,f.shelf));
                assertThat(query.snapshot(f.actor,session.id(),0,20).items().getFirst().shelfId()).isEqualTo(f.shelf);
                release.countDown();move.get(10,TimeUnit.SECONDS);
                assertThat(query.snapshot(f.actor,session.id(),0,20).items().getFirst().version()).isZero();
            } finally {release.countDown();}
        }
    }
    @Test void httpLifecycleUsesValidatedBodiesAndRejectsFractionalVersion() throws Exception {
        var f=fixture(); var auth=jwt().jwt(j->j.subject(f.actor.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        String path="/api/v1/inventory-sessions";
        mvc.perform(post(path).with(auth).contentType("application/json").content("{}")).andExpect(status().isUnprocessableEntity());
        var start=new InventoryRequests.Start(UUID.randomUUID(),f.branch,f.shelf);
        var response=mvc.perform(post(path).with(auth).contentType("application/json").content(json.writeValueAsString(start)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id=UUID.fromString(json.readTree(response).path("id").asText());path+="/"+id;
        var scan=new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,null);
        mvc.perform(post(path+"/scans").with(auth).contentType("application/json").content(json.writeValueAsString(scan)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.sessionVersion").value(1));
        String close=json.writeValueAsString(new InventoryRequests.Close(UUID.randomUUID(),1L,null));
        mvc.perform(post(path+"/finalize").with(auth).contentType("application/json").content(close.replace("\"version\":1","\"version\":1.5"))).andExpect(status().isBadRequest());
        mvc.perform(post(path+"/finalize").with(auth).contentType("application/json").content(close)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("FINALIZED"));
        mvc.perform(get(path+"/anomalies").with(auth)).andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
    }
    @Test void emptyScopeWorksAndOversizedScopeRollsBackWithoutReceipt(){
        var f=fixture();UUID empty=shelf(f.branch);
        var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,empty));
        assertThat(session.snapshotCount()).isZero();
        service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),0L,null),false);
        assertThat(query.anomalies(f.actor,session.id(),0,20).items()).isEmpty();
        UUID edition=jdbc.queryForObject("SELECT edition_id FROM book_copies WHERE id=?",UUID.class,f.copy);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) SELECT gen_random_uuid(),?,?||g,?,'AVAILABLE' FROM generate_series(1,5000) g",edition,UUID.randomUUID().toString(),f.shelf);
        var request=new InventoryRequests.Start(UUID.randomUUID(),f.branch,f.shelf);
        assertThatThrownBy(()->service.start(f.actor,request)).isInstanceOf(AuthFailure.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_sessions WHERE branch_id=? AND status='OPEN'",Integer.class,f.branch)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM circulation_requests WHERE actor_id=? AND request_id=?",Integer.class,f.actor,request.requestId())).isZero();
    }
    @Test void concurrentFinalizeWaitsForScanAndRejectsVersionBeforeThatScan() throws Exception {
        var f=fixture();var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var pid=new java.util.concurrent.atomic.AtomicInteger();
        try(var executor=Executors.newFixedThreadPool(2)){
            var scan=executor.submit(()->new TransactionTemplate(transactions).execute(status->{
                pid.set(jdbc.queryForObject("SELECT pg_backend_pid()",Integer.class));
                var result=service.scan(f.actor,session.id(),new InventoryRequests.Scan(UUID.randomUUID(),f.barcode,f.shelf,null));locked.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("test timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return result;
            }));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
            var close=executor.submit(()->service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),0L,null),false));
            try{
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(4);boolean blocked=false;
                while(System.nanoTime()<deadline){
                    blocked=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%inventory_sessions%')",Boolean.class,pid.get()));
                    if(blocked)break;Thread.sleep(10);
                }
                assertThat(blocked).as("finalize phải đang chờ khóa phiên của scan").isTrue();
            }finally{release.countDown();}
            scan.get(10,TimeUnit.SECONDS);
            assertThatThrownBy(()->close.get(10,TimeUnit.SECONDS)).hasCauseInstanceOf(AuthFailure.class);
        }
        assertThat(query.get(f.actor,session.id()).status()).isEqualTo("OPEN");
        assertThat(query.scans(f.actor,session.id(),0,20).items()).hasSize(1);
    }
    @Test void confirmedMoveUsesScannedShelfAndCannotOverwriteChangedCopy() {
        var f=fixture(); UUID observedShelf=shelf(f.branch);
        var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        scan(f,session.id(),f.barcode,observedShelf);
        service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),1L,null),false);
        var wrong=query.anomalies(f.actor,session.id(),0,20).items().stream()
            .filter(a->a.kind().equals("WRONG_SHELF")).findFirst().orElseThrow();
        var request=new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.MOVE_TO_SCANNED_SHELF,
            "Đã kiểm tra bản sách tại kệ quét",0L);
        var result=resolutions.resolve(f.actor,session.id(),wrong.id(),request);
        assertThat(result.copyVersionSeen()).isZero();
        assertThat(result.copyVersionAfter()).isOne();
        assertThat(resolutions.resolve(f.actor,session.id(),wrong.id(),request)).isEqualTo(result);
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book_copies WHERE id=?",UUID.class,f.copy)).isEqualTo(observedShelf);
        assertThat(query.anomalies(f.actor,session.id(),0,20).items().stream()
            .filter(a->a.id().equals(wrong.id())).findFirst().orElseThrow().resolution()).isEqualTo(result);
        assertThatThrownBy(()->resolutions.resolve(f.actor,session.id(),wrong.id(),
            new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.REVIEWED,"Lặp lại",1L)))
            .isInstanceOf(AuthFailure.class);

        var second=fixture(); UUID secondShelf=shelf(second.branch);
        var next=service.start(second.actor,new InventoryRequests.Start(UUID.randomUUID(),second.branch,null));
        scan(second,next.id(),second.barcode,secondShelf);
        service.close(second.actor,next.id(),new InventoryRequests.Close(UUID.randomUUID(),1L,null),false);
        var stale=query.anomalies(second.actor,next.id(),0,20).items().stream()
            .filter(a->a.kind().equals("WRONG_SHELF")).findFirst().orElseThrow();
        jdbc.update("UPDATE book_copies SET version=version+1 WHERE id=?",second.copy);
        assertThatThrownBy(()->resolutions.resolve(second.actor,next.id(),stale.id(),
            new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.MOVE_TO_SCANNED_SHELF,
                "Kệ đã quét",0L))).isInstanceOf(AuthFailure.class);
        assertThat(jdbc.queryForObject("SELECT shelf_id FROM book_copies WHERE id=?",UUID.class,second.copy)).isEqualTo(second.shelf);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventory_resolutions WHERE anomaly_id=?",Integer.class,stale.id())).isZero();
    }
    @Test void reviewUnknownBarcodeKeepsEvidenceAndCannotMoveCopy() throws Exception {
        var f=fixture(); var session=service.start(f.actor,new InventoryRequests.Start(UUID.randomUUID(),f.branch,null));
        scan(f,session.id(),"ma-khong-co",f.shelf);
        service.close(f.actor,session.id(),new InventoryRequests.Close(UUID.randomUUID(),1L,null),false);
        var unknown=query.anomalies(f.actor,session.id(),0,20).items().stream()
            .filter(a->a.kind().equals("UNKNOWN_BARCODE")).findFirst().orElseThrow();
        assertThatThrownBy(()->resolutions.resolve(f.actor,session.id(),unknown.id(),
            new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.MOVE_TO_SCANNED_SHELF,
                "Không có Copy",null))).isInstanceOf(AuthFailure.class);
        var review=resolutions.resolve(f.actor,session.id(),unknown.id(),
            new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.REVIEWED,
                "Đã đối chiếu mã vạch trên nhãn; cần dán lại",null));
        assertThat(review.copyVersionAfter()).isNull();
        assertThat(query.anomalies(f.actor,session.id(),0,20).items().stream()
            .filter(a->a.id().equals(unknown.id())).findFirst().orElseThrow().resolution()).isEqualTo(review);
        var auth=jwt().jwt(j->j.subject(f.actor.toString())).authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"));
        String endpoint="/api/v1/inventory-sessions/"+session.id()+"/anomalies/"+unknown.id()+"/resolution";
        mvc.perform(post(endpoint).with(auth).contentType("application/json").content("{\"action\":\"REVIEWED\",\"reason\":\"x\",\"expectedCopyVersion\":1.5}"))
            .andExpect(status().isBadRequest());
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",f.actor);
        jdbc.update("INSERT INTO user_roles VALUES (?,'READER')",f.actor);
        mvc.perform(post(endpoint).with(auth).contentType("application/json").content(json.writeValueAsString(
            new InventoryResolutionRequest(UUID.randomUUID(),InventoryResolutionRequest.Action.REVIEWED,"Lần hai",null))))
            .andExpect(status().isForbidden());
    }
    private void scan(Fixture f,UUID id,String barcode,UUID shelf){service.scan(f.actor,id,new InventoryRequests.Scan(UUID.randomUUID(),barcode,shelf,null));}
    private Fixture fixture(){
        UUID actor=UUID.randomUUID(),branch=UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,'Kiểm kê','test-only','ACTIVE',now(),now())",actor,actor.toString().substring(0,20),actor+"@test.local",actor+"@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,'LIBRARIAN')",actor);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Kiểm kê')",branch,branch.toString().substring(0,20));
        UUID shelf=shelf(branch),copy=copy(shelf,"AVAILABLE");return new Fixture(actor,branch,shelf,copy,copy.toString());
    }
    private UUID shelf(UUID branch){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,?,'Kệ')",id,branch,id.toString().substring(0,20));return id;}
    private UUID copy(UUID shelf,String status){
        UUID id=UUID.randomUUID(),book=UUID.randomUUID(),edition=UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Kiểm kê','kiem ke')",book);jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)",edition,book);
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?,?)",id,edition,id.toString(),shelf,status);return id;
    }
}
