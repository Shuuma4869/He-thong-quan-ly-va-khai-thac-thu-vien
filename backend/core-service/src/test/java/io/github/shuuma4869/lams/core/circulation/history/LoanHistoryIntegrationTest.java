package io.github.shuuma4869.lams.core.circulation.history;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import io.github.shuuma4869.lams.core.circulation.history.application.*;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(properties="lams.circulation.hold-job-enabled=false")
@AutoConfigureMockMvc
@Import(LoanHistoryIntegrationTest.TimeConfig.class)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class LoanHistoryIntegrationTest {
    static final Instant NOW=Instant.parse("2026-10-24T12:00:00Z");
    @Container static final PostgreSQLContainer<?> DB=new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",DB::getJdbcUrl);p.add("spring.datasource.username",DB::getUsername);
        p.add("spring.datasource.password",DB::getPassword);
        p.add("lams.auth.jwt-secret",()->"loan-history-integration-test-secret-32-bytes");
    }
    @TestConfiguration static class TimeConfig {
        @Bean @Primary Clock clock() {return Clock.fixed(NOW,ZoneOffset.UTC);}
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired LoanHistoryService history;
    @Autowired CirculationReportService reports;
    @Autowired MockMvc mvc;
    record Fixture(UUID staff,UUID reader,UUID book,UUID edition,UUID branch,UUID shelf) {}

    @Test void personalHistoryCannotSwitchOwnerAndDetailRequiresOwnerOrCurrentStaff() throws Exception {
        var f=fixture("Chi nhánh cá nhân");
        UUID mine=loan(f,f.reader,NOW.minusSeconds(3600),NOW.plusSeconds(3600),null);
        UUID other=user("READER"),otherLoan=loan(f,other,NOW.minusSeconds(3600),NOW.plusSeconds(3600),null);
        mvc.perform(get("/api/v1/me/loans")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/loans").with(as(f.reader,"READER")).param("readerId",other.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].loanId").value(mine.toString()))
                .andExpect(jsonPath("$.items[0].readerId").value(f.reader.toString()));
        mvc.perform(get("/api/v1/loans/"+otherLoan).with(as(f.reader,"READER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/loans/"+mine).with(as(f.reader,"READER"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/loans/"+otherLoan).with(as(f.staff,"LIBRARIAN"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/loans").with(as(f.reader,"READER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/loans/"+UUID.randomUUID()).with(as(f.reader,"READER"))).andExpect(status().isNotFound());
    }

    @Test void staleRolesAndLockedAccountsDoNotKeepReadOrExportAccess() throws Exception {
        var f=fixture("Quyền hiện hành");
        loan(f,f.reader,NOW.minusSeconds(100),NOW.plusSeconds(100),null);
        jdbc.update("DELETE FROM user_roles WHERE user_id=?",f.staff);
        jdbc.update("INSERT INTO user_roles VALUES (?,'READER')",f.staff);
        mvc.perform(get("/api/v1/loans").with(as(f.staff,"LIBRARIAN"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/reports/circulation.csv").with(as(f.staff,"LIBRARIAN"))
                .param("from",NOW.minusSeconds(200).toString()).param("to",NOW.toString())).andExpect(status().isForbidden());
        jdbc.update("UPDATE users SET status='LOCKED' WHERE id=?",f.reader);
        mvc.perform(get("/api/v1/me/loans").with(as(f.reader,"READER"))).andExpect(status().isForbidden());
    }

    @Test void filtersHaveExclusiveEndStablePagesAndExactOverdueBoundary() {
        var f=fixture("Lọc lịch sử"); Instant from=NOW.minusSeconds(3600),to=NOW.minusSeconds(1800);
        UUID a=loan(f,f.reader,from,NOW,null);
        UUID b=loan(f,f.reader,from,NOW.minusSeconds(1),null);
        UUID returned=loan(f,f.reader,from,NOW.plusSeconds(100),NOW);
        loan(f,f.reader,to,NOW.plusSeconds(100),null);
        var first=history.mine(f.reader,filter(f.reader,null,null,null,from,to,"borrowedAt,asc","0","1"));
        var second=history.mine(f.reader,filter(f.reader,null,null,null,from,to,"borrowedAt,asc","1","1"));
        assertThat(first.page().totalElements()).isEqualTo(3);assertThat(first.page().totalPages()).isEqualTo(3);
        assertThat(first.items().getFirst().loanId()).isNotEqualTo(second.items().getFirst().loanId());
        assertThat(history.mine(f.reader,filter(f.reader,null,null,null,from,to,"borrowedAt,asc","0","1"))).isEqualTo(first);
        assertThat(history.get(f.reader,a).overdue()).isFalse();assertThat(history.get(f.reader,b).status()).isEqualTo("OVERDUE");
        assertThat(history.get(f.reader,returned).status()).isEqualTo("RETURNED");
        assertThat(history.mine(f.reader,filter(f.reader,null,null,"ACTIVE",from,to,null,null,null)).page().totalElements()).isEqualTo(2);
        assertThat(history.mine(f.reader,filter(f.reader,null,null,"OVERDUE",from,to,null,null,null)).items()).extracting("loanId").containsExactly(b);
        assertThat(history.mine(f.reader,filter(f.reader,null,null,"RETURNED",from,to,null,null,null)).items()).extracting("loanId").containsExactly(returned);
        assertThat(history.mine(f.reader,filter(f.reader,null,null,null,from,to,null,"2147483647","100")).items()).isEmpty();
        var copy=history.get(f.reader,a).copyId();
        assertThat(history.staff(f.staff,filter(null,f.branch,copy,null,null,null,null,null,null)).items()).hasSize(1);
        assertThat(history.staff(f.staff,filter(null,UUID.randomUUID(),null,null,null,null,null,null,null)).items()).isEmpty();
    }

    @Test void returnedLoanKeepsOriginalEditionAndBranchAfterCopyMoves() {
        var f=fixture("Chi nhánh gốc"); var next=fixture("Chi nhánh mới");
        UUID id=loan(f,f.reader,NOW.minusSeconds(3600),NOW.plusSeconds(3600),NOW);
        UUID copy=history.get(f.reader,id).copyId();
        jdbc.update("UPDATE book_copies SET edition_id=?,shelf_id=?,version=version+1 WHERE id=?",next.edition,next.shelf,copy);
        var row=history.get(f.reader,id);
        assertThat(row.editionId()).isEqualTo(f.edition);assertThat(row.branchId()).isEqualTo(f.branch);
        assertThat(row.branchName()).isEqualTo("Chi nhánh gốc");assertThat(row.copyVersion()).isEqualTo(1);
        assertThat(history.staff(f.staff,filter(null,f.branch,copy,null,null,null,null,null,null)).items()).hasSize(1);
        assertThat(history.staff(f.staff,filter(null,next.branch,copy,null,null,null,null,null,null)).items()).isEmpty();
    }

    @Test void reportCountsBorrowingCohortAtReadTimeAndGroupsByRequestedTimezone() {
        var f=fixture("Thống kê"); Instant from=Instant.parse("2026-10-20T16:00:00Z"),to=from.plusSeconds(7200);
        loan(f,f.reader,from,NOW,null);
        loan(f,f.reader,from.plusSeconds(3600),NOW.minusSeconds(1),null);
        loan(f,f.reader,from.plusSeconds(5400),NOW.plusSeconds(1),NOW);
        loan(f,f.reader,to,NOW.plusSeconds(1),null);
        var report=reports.report(f.staff,f.branch,from.toString(),to.toString(),null);
        assertThat(report.totals().borrowed()).isEqualTo(3);assertThat(report.totals().active()).isEqualTo(2);
        assertThat(report.totals().returned()).isEqualTo(1);assertThat(report.totals().overdue()).isEqualTo(1);
        assertThat(report.items()).hasSize(2);assertThat(report.asOf()).isEqualTo(NOW);
        assertThat(report.items().getFirst().date()).isEqualTo(LocalDate.parse("2026-10-20"));
        assertThat(report.items().getLast().date()).isEqualTo(LocalDate.parse("2026-10-21"));
        assertThat(reports.report(f.staff,f.branch,from.toString(),to.toString(),"UTC").items()).hasSize(1);
        assertThat(reports.report(f.staff,UUID.randomUUID(),from.toString(),to.toString(),null).totals().borrowed()).isZero();
    }

    @Test void csvIsUtf8AttachmentEscapesFieldsAndUsesSameRowsWithoutReaderIdentity() throws Exception {
        var f=fixture("=HYPERLINK(\"x\"),Thư viện\nTầng 2");
        loan(f,f.reader,NOW.minusSeconds(100),NOW.plusSeconds(100),null);
        String from=NOW.minusSeconds(200).toString(),to=NOW.toString();
        var report=reports.report(f.staff,f.branch,from,to,"UTC");
        var response=mvc.perform(get("/api/v1/reports/circulation.csv").with(as(f.staff,"LIBRARIAN"))
                .param("branchId",f.branch.toString()).param("from",from).param("to",to).param("timezone","UTC"))
                .andExpect(status().isOk()).andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andExpect(header().string("Content-Disposition","attachment; filename=circulation.csv"))
                .andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse();
        assertThat(response.getContentAsByteArray()).isEqualTo(LoanCsvExporter.export(report));
        assertThat(response.getContentAsString()).startsWith("\uFEFFfrom,to,")
                .contains("\"'=HYPERLINK(\"\"x\"\"),Thư viện\nTầng 2\"")
                .doesNotContain(f.reader.toString(),"@test.local","password_hash");
        mvc.perform(get("/api/v1/reports/circulation").with(as(f.reader,"READER")).param("from",from).param("to",to))
                .andExpect(status().isForbidden());
    }

    @Test void invalidFiltersCannotBecomeSqlAndReportRequiresBoundedPeriod() throws Exception {
        var f=fixture("Kiểm dữ liệu vào");
        for(var pair:new String[][]{{"sort","borrowedAt; DROP TABLE loans"},{"status","ACTIVE' OR 1=1--"},
                {"page","-1"},{"size","101"},{"from","2026-10-20"},{"page","2147483648"},{"to","+100000-01-01T00:00:00Z"}}) {
            mvc.perform(get("/api/v1/me/loans").with(as(f.reader,"READER")).param(pair[0],pair[1])).andExpect(status().isUnprocessableEntity());
        }
        mvc.perform(get("/api/v1/loans").with(as(f.staff,"LIBRARIAN")).param("branchId","' OR 1=1"))
                .andExpect(status().isBadRequest());
        for(var range:new String[][]{{NOW.toString(),NOW.toString()},
                {NOW.toString(),NOW.plus(Duration.ofDays(367)).toString()}}) {
            mvc.perform(get("/api/v1/reports/circulation").with(as(f.staff,"LIBRARIAN")).param("from",range[0]).param("to",range[1]))
                    .andExpect(status().isUnprocessableEntity());
        }
        mvc.perform(get("/api/v1/reports/circulation").with(as(f.staff,"LIBRARIAN"))).andExpect(status().isBadRequest());
        assertThatThrownBy(()->reports.report(f.staff,null,null,null,null)).isInstanceOf(AuthFailure.class);
        assertThatThrownBy(()->reports.report(f.staff,null,NOW.minusSeconds(10).toString(),NOW.toString(),"UTC'; DROP TABLE loans"))
                .isInstanceOf(AuthFailure.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM loans",Long.class)).isNotNull();
    }

    @Test void queriesAndExportDoNotChangeLoansCopiesOrCommandHistory() {
        var f=fixture("Chỉ đọc"); UUID id=loan(f,f.reader,NOW.minusSeconds(3600),NOW.plusSeconds(3600),null);
        String before=jdbc.queryForObject("SELECT row_to_json(l)::text FROM loans l WHERE id=?",String.class,id);
        long outbox=jdbc.queryForObject("SELECT count(*) FROM outbox_events",Long.class);
        long receipts=jdbc.queryForObject("SELECT count(*) FROM circulation_requests",Long.class);
        var row=history.get(f.reader,id);
        String copy=jdbc.queryForObject("SELECT row_to_json(c)::text FROM book_copies c WHERE id=?",String.class,row.copyId());
        history.mine(f.reader,filter(f.reader,null,null,null,null,null,null,null,null));
        history.staff(f.staff,filter(null,f.branch,null,null,null,null,null,null,null));
        LoanCsvExporter.export(reports.report(f.staff,f.branch,NOW.minusSeconds(7200).toString(),NOW.toString(),null));
        assertThat(jdbc.queryForObject("SELECT row_to_json(l)::text FROM loans l WHERE id=?",String.class,id)).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT row_to_json(c)::text FROM book_copies c WHERE id=?",String.class,row.copyId())).isEqualTo(copy);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events",Long.class)).isEqualTo(outbox);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM circulation_requests",Long.class)).isEqualTo(receipts);
    }

    @Test void largeReportIsRejectedWithoutTruncationAndBranchFilterMakesItBounded() {
        var f=fixture("Giới hạn báo cáo"); Instant start=NOW.minus(Duration.ofDays(366));
        for(int n=0;n<28;n++) {
            UUID branch=n==0?f.branch:UUID.randomUUID(),shelf=n==0?f.shelf:UUID.randomUUID(),copy=UUID.randomUUID();
            if(n>0) {
                jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,'Chi nhánh tải thử')",branch,branch.toString().substring(0,20));
                jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Kệ thử')",shelf,branch);
            }
            jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?,'AVAILABLE')",copy,f.edition,copy.toString(),shelf);
            jdbc.update("""
                    INSERT INTO loans(id,copy_id,edition_id,reader_id,branch_id,borrowed_by,borrowed_at,due_at,returned_at,returned_by,policy_version,policy_snapshot)
                    SELECT gen_random_uuid(),?,?,?,?,?,?::timestamptz + n * interval '1 day',
                    ?::timestamptz + n * interval '1 day' + interval '1 hour',?::timestamptz,?,'test-v1','{}'::jsonb
                    FROM generate_series(0,365) AS n
                    """,copy,f.edition,f.reader,branch,f.staff,Timestamp.from(start),Timestamp.from(start),Timestamp.from(NOW),f.staff);
        }
        assertThatThrownBy(()->reports.report(f.staff,null,start.toString(),NOW.toString(),"UTC"))
                .isInstanceOfSatisfying(AuthFailure.class,e->assertThat(e.status()).isEqualTo(422));
        assertThat(reports.report(f.staff,f.branch,start.toString(),NOW.toString(),"UTC").items()).hasSize(366);
    }

    private Fixture fixture(String name) {
        UUID staff=user("LIBRARIAN"),reader=user("READER"),book=UUID.randomUUID(),edition=UUID.randomUUID(),branch=UUID.randomUUID(),shelf=UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Lịch sử sách','lich su sach')",book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)",edition,book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,?)",branch,branch.toString().substring(0,20),name);
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'S1','Kệ thử')",shelf,branch);
        return new Fixture(staff,reader,book,edition,branch,shelf);
    }
    private UUID loan(Fixture f,UUID reader,Instant borrowed,Instant due,Instant returned) {
        UUID copy=UUID.randomUUID(),id=UUID.randomUUID();
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?,?)",copy,f.edition,copy.toString(),f.shelf,returned==null?"ON_LOAN":"AVAILABLE");
        jdbc.update("""
                INSERT INTO loans(id,copy_id,edition_id,reader_id,branch_id,borrowed_by,borrowed_at,due_at,returned_at,returned_by,policy_version,policy_snapshot)
                VALUES (?,?,?,?,?,?,?,?,?,?,'test-v1','{}'::jsonb)
                """,id,copy,f.edition,reader,f.branch,f.staff,Timestamp.from(borrowed),Timestamp.from(due),
                returned==null?null:Timestamp.from(returned),returned==null?null:f.staff);
        return id;
    }
    private UUID user(String role) {
        UUID id=UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'Bạn đọc thử','test-only','ACTIVE',now(),now())
                """,id,id.toString().substring(0,20),id+"@test.local",id+"@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)",id,role);return id;
    }
    private RequestPostProcessor as(UUID actor,String role) {return jwt().jwt(j->j.subject(actor.toString())).authorities(new SimpleGrantedAuthority("ROLE_"+role));}
    private LoanHistoryFilter filter(UUID reader,UUID branch,UUID copy,String status,Instant from,Instant to,String sort,String page,String size) {
        return LoanHistoryFilter.parse(reader,branch,copy,status,from==null?null:from.toString(),to==null?null:to.toString(),sort,page,size);
    }
}
