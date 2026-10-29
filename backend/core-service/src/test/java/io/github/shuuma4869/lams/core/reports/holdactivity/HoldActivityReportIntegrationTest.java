package io.github.shuuma4869.lams.core.reports.holdactivity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.sql.PreparedStatement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(properties = "lams.circulation.hold-job-enabled=false")
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class HoldActivityReportIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DB::getJdbcUrl);
        properties.add("spring.datasource.username", DB::getUsername);
        properties.add("spring.datasource.password", DB::getPassword);
        properties.add("lams.auth.jwt-secret", () -> "hold-activity-test-secret-at-least-32-bytes");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired PlatformTransactionManager transactions;
    @MockitoSpyBean io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess access;

    record Fixture(UUID staff, UUID admin, UUID reader, UUID branch, UUID otherBranch, UUID book, UUID otherBook, UUID hold) {}

    @Test
    void groupsRealEventsFiltersAndAppliesHalfOpenWindowWithCurrentStaffAuthorization() throws Exception {
        Fixture f = fixture();
        Instant from = Instant.parse("2026-01-01T20:00:00Z");
        Instant inside = Instant.parse("2026-01-01T20:00:00.123456Z");
        Instant to = Instant.parse("2026-01-02T20:00:00Z");
        event(f.hold(), 0, "HOLD_CREATED", from);
        event(f.hold(), 1, "HOLD_READY", inside);
        event(f.hold(), 2, "HOLD_FULFILLED", to);
        event(f.hold(), 3, "HOLD_CANCELLED", inside);
        event(f.hold(), 4, "HOLD_EXPIRED", inside);
        UUID otherHold = hold(f.reader(), f.otherBranch(), f.otherBook());
        event(otherHold, 0, "HOLD_CREATED", inside);

        var librarian = principal(f.staff(), "LIBRARIAN");
        var admin = principal(f.admin(), "ADMIN");
        var reader = principal(f.reader(), "READER");
        String path = "/api/v1/reports/hold-activity";
        mvc.perform(get(path).param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(path + ".csv").param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(path).with(reader).param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isForbidden());
        mvc.perform(get(path + ".csv").with(reader).param("from", from.toString()).param("to", to.toString()))
                .andExpect(status().isForbidden());

        var result = mvc.perform(get(path).with(librarian).param("from", from.toString()).param("to", to.toString())
                .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                .andExpect(status().isOk()).andReturn();
        var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree(result.getResponse().getContentAsString());
        assertThat(body.path("timezone").asText()).isEqualTo("Asia/Ho_Chi_Minh");
        assertThat(body.path("totalEvents").asLong()).isEqualTo(4);
        assertThat(body.path("items")).hasSize(4);
        assertThat(body.path("items").get(0).path("date").asText()).isEqualTo("2026-01-02");
        assertThat(body.path("items").get(0).path("eventType").asText()).isEqualTo("HOLD_CANCELLED");

        var branchOnly = mvc.perform(get(path).with(librarian).param("from", from.toString()).param("to", to.toString())
                .param("branchId", f.branch().toString())).andExpect(status().isOk()).andReturn();
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(branchOnly.getResponse().getContentAsString())
                .path("totalEvents").asLong()).isEqualTo(4);
        var bookOnly = mvc.perform(get(path).with(librarian).param("from", from.toString()).param("to", to.toString())
                .param("bookId", f.otherBook().toString())).andExpect(status().isOk()).andReturn();
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(bookOnly.getResponse().getContentAsString())
                .path("totalEvents").asLong()).isEqualTo(1);
        var csv = mvc.perform(get(path + ".csv").with(librarian).param("from", from.toString()).param("to", to.toString())
                .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                .andExpect(status().isOk()).andReturn().getResponse();
        var csvRows = parseCsv(csv.getContentAsByteArray());
        assertThat(csvRows).hasSize(body.path("items").size() + 1);
        assertThat(csvRows.getFirst()).containsExactly("from", "to", "timezone", "branch_id", "book_id", "date", "event_type", "event_count");
        for (int i = 0; i < body.path("items").size(); i++) {
            var item = body.path("items").get(i);
            var row = csvRows.get(i + 1);
            assertThat(row).hasSize(8);
            assertThat(row.get(3)).isEqualTo(item.path("branchId").asText());
            assertThat(row.get(5)).isEqualTo(item.path("date").asText());
            assertThat(row.get(6)).isEqualTo(item.path("eventType").asText());
            assertThat(row.get(7)).isEqualTo(item.path("eventCount").asText());
        }

        mvc.perform(get(path).with(admin).param("from", from.toString()).param("to", to.toString())
                .param("branchId", f.branch().toString())).andExpect(status().isOk());
        mvc.perform(get(path + ".csv").with(admin).param("from", from.toString()).param("to", to.toString())
                .param("branchId", f.branch().toString())).andExpect(status().isOk());
        mvc.perform(get(path).with(librarian).param("from", from.toString()).param("to", to.toString())
                .param("bookId", f.otherBook().toString())).andExpect(status().isOk());
    }

    @Test
    void returnsEmptyAndValidatesCalendarSixMonthWindowAndMicrosecondPrecision() throws Exception {
        Fixture f = fixture();
        var librarian = principal(f.staff(), "LIBRARIAN");
        String path = "/api/v1/reports/hold-activity";
        mvc.perform(get(path).with(librarian).param("from", "2023-08-29T00:00:00Z")
                .param("to", "2024-02-29T00:00:00Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // Exactly six calendar months, reaching leap day.
        mvc.perform(get(path).with(librarian).param("from", "2024-01-31T00:00:00Z")
                .param("to", "2024-07-31T00:00:00Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // End-of-month remains a calendar-month boundary.
        mvc.perform(get(path).with(librarian).param("from", "2023-08-29T00:00:00Z")
                .param("to", "2024-03-01T00:00:00Z")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).with(librarian).param("from", "2026-01-01T00:00:00Z")
                .param("to", "2026-01-01T00:00:00.000000001Z")).andExpect(status().isUnprocessableEntity());
        var empty = mvc.perform(get(path).with(librarian).param("from", "2026-01-01T00:00:00Z")
                .param("to", "2026-02-01T00:00:00Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()).andReturn();
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(empty.getResponse().getContentAsString())
                .path("items")).isEmpty();
        mvc.perform(get(path).with(librarian).param("from", "2026-01-01T07:00:00+07:00")
                .param("to", "2026-02-01T07:00:00+07:00").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // Explicit non-UTC offset normalizes to the same Instant window.
        mvc.perform(get(path).with(librarian).param("from", "2099-01-31T00:00:00Z")
                .param("to", "2099-07-31T00:00:00Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // Future windows are intentionally not prohibited.
    }

    @Test
    void includesFromExcludesToAndHonorsAdjacentMicrosecondBoundariesWithOffsetInput() throws Exception {
        Fixture f = fixture();
        Instant beforeFrom = Instant.parse("2026-01-01T20:00:00.123455Z");
        Instant from = Instant.parse("2026-01-01T20:00:00.123456Z");
        Instant beforeTo = Instant.parse("2026-01-01T20:00:00.123457Z");
        Instant to = Instant.parse("2026-01-01T20:00:00.123458Z");
        event(f.hold(), 0, "HOLD_EXPIRED", beforeFrom);
        event(f.hold(), 1, "HOLD_CREATED", from);
        event(f.hold(), 2, "HOLD_READY", beforeTo);
        event(f.hold(), 3, "HOLD_FULFILLED", to);

        var response = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-02T03:00:00.123456+07:00")
                .param("to", "2026-01-02T03:00:00.123458+07:00")
                .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                .andExpect(status().isOk()).andReturn();
        var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getResponse().getContentAsString());
        assertThat(body.path("totalEvents").asLong()).isEqualTo(2);
        assertThat(body.path("items")).hasSize(2);
        assertThat(body.path("items").get(0).path("date").asText()).isEqualTo("2026-01-02");
        assertThat(body.path("items").get(0).path("eventType").asText()).isEqualTo("HOLD_CREATED");
        assertThat(body.path("items").get(1).path("eventType").asText()).isEqualTo("HOLD_READY");
    }

    @Test
    void aggregatesSameTypeEventsWithoutJoiningAcrossBranchesOrDaysAndKeepsUnknownSchemaValues() throws Exception {
        Fixture f = fixture();
        UUID secondReader = user("READER"), thirdReader = user("READER");
        UUID sameBranchSecondHold = hold(secondReader, f.branch(), f.book());
        UUID otherBranchSameBookHold = hold(thirdReader, f.otherBranch(), f.book());
        event(f.hold(), 0, "HOLD_CREATED", Instant.parse("2026-02-10T20:00:00Z"));
        event(sameBranchSecondHold, 0, "HOLD_CREATED", Instant.parse("2026-02-10T20:00:00Z"));
        event(otherBranchSameBookHold, 0, "HOLD_CREATED", Instant.parse("2026-02-10T20:00:00Z"));
        event(f.hold(), 1, "FUTURE_EVENT_V2", Instant.parse("2026-02-11T20:00:00Z"));

        var response = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-02-10T20:00:00Z").param("to", "2026-02-12T20:00:00Z"))
                .andExpect(status().isOk()).andReturn();
        var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getResponse().getContentAsString());
        assertThat(body.path("totalEvents").asLong()).isEqualTo(4);
        assertThat(body.path("items")).hasSize(3);
        var rows = new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
        body.path("items").forEach(rows::add);
        var sameBranchGroup = rows.stream().filter(row -> row.path("date").asText().equals("2026-02-11")
                && row.path("branchId").asText().equals(f.branch().toString())
                && row.path("eventType").asText().equals("HOLD_CREATED")).findFirst().orElseThrow();
        assertThat(sameBranchGroup.path("eventCount").asLong()).isEqualTo(2);
        var otherBranchGroup = rows.stream().filter(row -> row.path("date").asText().equals("2026-02-11")
                && row.path("branchId").asText().equals(f.otherBranch().toString())
                && row.path("eventType").asText().equals("HOLD_CREATED")).findFirst().orElseThrow();
        assertThat(otherBranchGroup.path("eventCount").asLong()).isEqualTo(1);
        var laterDayGroup = rows.stream().filter(row -> row.path("date").asText().equals("2026-02-12")
                && row.path("branchId").asText().equals(f.branch().toString())
                && row.path("eventType").asText().equals("FUTURE_EVENT_V2")).findFirst().orElseThrow();
        assertThat(laterDayGroup.path("eventCount").asLong()).isEqualTo(1);
    }

    @Test
    void rawSqlDimensionChangeReattributesHistoryAndForeignKeysProtectHoldHistory() throws Exception {
        Fixture f = fixture();
        Instant at = Instant.parse("2026-02-15T00:00:00Z");
        event(f.hold(), 0, "HOLD_CREATED", at);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM holds WHERE id=?", f.hold()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> event(f.hold(), 0, "HOLD_CREATED", at))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM hold_changes WHERE hold_id=?", Long.class, f.hold())).isOne();

        try {
            jdbc.update("UPDATE holds SET branch_id=?, book_id=? WHERE id=?", f.otherBranch(), f.otherBook(), f.hold());
            var oldDimension = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                    .param("from", "2026-02-15T00:00:00Z").param("to", "2026-02-16T00:00:00Z")
                    .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                    .andExpect(status().isOk()).andReturn();
            assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(oldDimension.getResponse().getContentAsString())
                    .path("items")).isEmpty();
            var changedDimension = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                    .param("from", "2026-02-15T00:00:00Z").param("to", "2026-02-16T00:00:00Z")
                    .param("branchId", f.otherBranch().toString()).param("bookId", f.otherBook().toString()))
                    .andExpect(status().isOk()).andReturn();
            assertThat(new com.fasterxml.jackson.databind.ObjectMapper().readTree(changedDimension.getResponse().getContentAsString())
                    .path("totalEvents").asLong()).isEqualTo(1);
        } finally {
            jdbc.update("UPDATE holds SET branch_id=?, book_id=? WHERE id=?", f.branch(), f.book(), f.hold());
        }
    }

    @Test
    void reportDoesNotReadUncommittedEventsAndReadsAfterWriterCommit() throws Exception {
        Fixture f = fixture();
        UUID changeId = UUID.randomUUID();
        Instant at = Instant.parse("2026-02-20T00:00:00Z");
        try (var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (PreparedStatement insert = connection.prepareStatement("""
                    INSERT INTO hold_changes(id,hold_id,hold_version,event_type,occurred_at)
                    VALUES (?, ?, 0, 'HOLD_CREATED', ?)
                    """)) {
                insert.setObject(1, changeId);
                insert.setObject(2, f.hold());
                insert.setTimestamp(3, Timestamp.from(at));
                insert.executeUpdate();
            }
            var beforeCommit = report(f, "2026-02-20T00:00:00Z", "2026-02-21T00:00:00Z");
            assertThat(beforeCommit.path("items")).isEmpty();
            connection.commit();
        }
        var afterCommit = report(f, "2026-02-20T00:00:00Z", "2026-02-21T00:00:00Z");
        assertThat(afterCommit.path("totalEvents").asLong()).isEqualTo(1);
    }

    @Test
    void repeatableReadKeepsReportSnapshotAcrossRoleLookupAndConcurrentWriterCommit() throws Exception {
        Fixture f = fixture();
        var roleChecked = new CountDownLatch(1);
        var allowReportQuery = new CountDownLatch(1);
        doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            roleChecked.countDown();
            if (!allowReportQuery.await(10, TimeUnit.SECONDS))
                throw new IllegalStateException("Timed out before the report aggregate query.");
            return result;
        }).when(access).staff(f.staff());

        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> mvc.perform(get("/api/v1/reports/hold-activity")
                    .with(principal(f.staff(), "LIBRARIAN"))
                    .param("from", "2026-02-25T00:00:00Z").param("to", "2026-02-26T00:00:00Z")
                    .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                    .andExpect(status().isOk()).andReturn());
            assertThat(roleChecked.await(10, TimeUnit.SECONDS)).isTrue();
            event(f.hold(), 0, "HOLD_CREATED", Instant.parse("2026-02-25T12:00:00Z"));
            allowReportQuery.countDown();
            var snapshotResponse = pending.get(10, TimeUnit.SECONDS);
            var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(snapshotResponse.getResponse().getContentAsString());
            assertThat(snapshot.path("totalEvents").asLong()).isZero();
        } finally {
            allowReportQuery.countDown();
        }
        var laterSnapshot = report(f, "2026-02-25T00:00:00Z", "2026-02-26T00:00:00Z");
        assertThat(laterSnapshot.path("totalEvents").asLong()).isEqualTo(1);
    }

    @Test
    void reportDoesNotCountAnEventRolledBackWithItsWriterTransaction() throws Exception {
        Fixture f = fixture();
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            event(f.hold(), 0, "HOLD_CREATED", Instant.parse("2026-02-21T00:00:00Z"));
            throw new IllegalStateException("rollback test transaction");
        })).isInstanceOf(IllegalStateException.class).hasMessage("rollback test transaction");
        var afterRollback = report(f, "2026-02-21T00:00:00Z", "2026-02-22T00:00:00Z");
        assertThat(afterRollback.path("totalEvents").asLong()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM hold_changes WHERE hold_id=?", Long.class, f.hold())).isZero();
    }

    @Test
    void rejectsInvalidWindowsFiltersAndExtremeCalendarOverflowWithoutSqlErrors() throws Exception {
        Fixture f = fixture();
        var librarian = principal(f.staff(), "LIBRARIAN");
        String path = "/api/v1/reports/hold-activity";
        mvc.perform(get(path).with(librarian).param("from", "2026-02-01T00:00:00Z")
                .param("to", "2026-02-01T00:00:00Z")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).with(librarian).param("from", "2026-02-02T00:00:00Z")
                .param("to", "2026-02-01T00:00:00Z")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).with(librarian).param("from", "2026-02-01T00:00:00")
                .param("to", "2026-02-02T00:00:00Z")).andExpect(status().isBadRequest());
        mvc.perform(get(path).with(librarian).param("from", "2026-02-01T00:00:00Z")
                .param("to", "2026-02-02T00:00:00Z").param("branchId", "' OR 1=1--"))
                .andExpect(status().isBadRequest());
        var extremeYear = mvc.perform(get(path).with(librarian).param("from", "+999999999-10-01T00:00:00Z")
                .param("to", "+999999999-10-02T00:00:00Z"))
                .andExpect(status().isUnprocessableEntity()).andReturn().getResponse();
        assertThat(extremeYear.getContentType()).startsWith("application/problem+json");
        assertThat(extremeYear.getContentAsString()).contains("\"status\":422")
                .doesNotContain("DateTimeException", "Internal Server Error", "SQLSTATE");
        mvc.perform(get(path).with(librarian).param("from", "-4713-01-01T00:00:00Z")
                .param("to", "-4713-01-02T00:00:00Z")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).with(librarian).param("from", "+294277-01-01T00:00:00Z")
                .param("to", "+294277-01-02T00:00:00Z")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).with(librarian).param("from", "-4712-01-01T00:00:00Z")
                .param("to", "-4712-01-02T00:00:00Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // PostgreSQL lower bound: 4713 BC.
        mvc.perform(get(path).with(librarian).param("from", "+294276-12-31T23:59:59.999998Z")
                .param("to", "+294276-12-31T23:59:59.999999Z").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // PostgreSQL upper bound: final supported microsecond.
        mvc.perform(get(path).with(librarian).param("from", "+294277-01-01T00:00:00+14:00")
                .param("to", "+294277-01-01T00:00:00.000001+14:00").param("branchId", f.branch().toString()))
                .andExpect(status().isOk()); // Local year is 294277, but normalized Instant is within PostgreSQL range.
    }

    @Test
    void csvUsesSameFiltersAndReturnsDownloadHeadersForEmptyReport() throws Exception {
        Fixture f = fixture();
        var librarian = principal(f.staff(), "LIBRARIAN");
        var response = mvc.perform(get("/api/v1/reports/hold-activity.csv").with(librarian)
                .param("from", "2026-01-01T00:00:00Z").param("to", "2026-02-01T00:00:00Z")
                .param("branchId", f.branch().toString()))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getContentType()).isEqualTo("text/csv;charset=UTF-8");
        assertThat(response.getHeader("Cache-Control")).contains("no-store");
        assertThat(response.getHeader("Content-Disposition")).contains("hold-activity.csv");
        assertThat(response.getContentAsByteArray()).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        assertThat(new String(response.getContentAsByteArray(), java.nio.charset.StandardCharsets.UTF_8))
                .isEqualTo("\uFEFFfrom,to,timezone,branch_id,book_id,date,event_type,event_count\r\n");
    }

    @Test
    void fullCsvExporterEscapesUnicodeMultilineAndFormulaValuesInParsedRecords() throws Exception {
        Fixture f = fixture();
        Instant at = Instant.parse("2026-01-10T00:00:00.123456Z");
        List<String> types = List.of("=1+1", "+1", "-1", "@SUM(1,1)", " =1", "\t=1", "\r=1",
                "\uFEFF=1", "\u200B=1", "TYPE,COMMA", "TYPE\"QUOTE", "TYPE\r\nLINE", "Đã tạo giữ chỗ", "");
        for (int i = 0; i < types.size(); i++) event(f.hold(), i, types.get(i), at);

        var response = mvc.perform(get("/api/v1/reports/hold-activity.csv").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-10T00:00:00Z").param("to", "2026-01-11T00:00:00Z")
                .param("branchId", f.branch().toString()).param("bookId", f.book().toString()))
                .andExpect(status().isOk()).andReturn().getResponse();
        byte[] bytes = response.getContentAsByteArray();
        assertThat(bytes).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        var records = parseCsv(bytes);
        assertThat(records).hasSize(types.size() + 1);
        assertThat(records.getFirst()).hasSize(8);
        assertThat(records.get(1)).hasSize(8);
        var restoredTypes = records.subList(1, records.size()).stream().map(row -> row.get(6)).toList();
        assertThat(restoredTypes).contains("TYPE,COMMA", "TYPE\"QUOTE", "TYPE\r\nLINE", "Đã tạo giữ chỗ", "");
        for (String value : List.of("=1+1", "+1", "-1", "@SUM(1,1)", " =1", "\t=1", "\r=1", "\uFEFF=1", "\u200B=1"))
            assertThat(restoredTypes).contains("'" + value);
    }

    @Test
    void csvAtExactlyTenThousandGroupsIncludesEachGroupedBranchId() throws Exception {
        Fixture f = fixture();
        insertGroupedRows(f, 10_000, "2026-01-20T00:00:00Z");

        var jsonAtLimit = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-20T00:00:00Z").param("to", "2026-01-21T00:00:00Z"))
                .andExpect(status().isOk()).andReturn().getResponse();
        var jsonAtLimitBody = new com.fasterxml.jackson.databind.ObjectMapper().readTree(jsonAtLimit.getContentAsString());
        assertThat(jsonAtLimitBody.path("items")).hasSize(10_000);
        assertThat(jsonAtLimitBody.path("totalEvents").asLong()).isEqualTo(10_000);
        var jsonBranches = new HashSet<String>();
        jsonAtLimitBody.path("items").forEach(item -> jsonBranches.add(item.path("branchId").asText()));
        assertThat(jsonBranches).hasSize(10_000);
        var csvAtLimit = mvc.perform(get("/api/v1/reports/hold-activity.csv").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-20T00:00:00Z").param("to", "2026-01-21T00:00:00Z"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(csvAtLimit.getContentType()).isEqualTo("text/csv;charset=UTF-8");
        assertThat(csvAtLimit.getContentAsByteArray()).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        var csvAtLimitRows = parseCsv(csvAtLimit.getContentAsByteArray());
        assertThat(csvAtLimitRows).hasSize(10_001);
        assertThat(csvAtLimitRows.getFirst()).hasSize(8);
        assertThat(csvAtLimitRows.subList(1, csvAtLimitRows.size())).allSatisfy(row -> assertThat(row).hasSize(8));
        var csvAtLimitRowsBody = csvAtLimitRows.subList(1, csvAtLimitRows.size());
        var csvBranches = new HashSet<String>();
        for (var row : csvAtLimitRowsBody) {
            csvBranches.add(row.get(3));
            assertThat(row.get(5)).isEqualTo("2026-01-20");
            assertThat(row.get(6)).isEqualTo("HOLD_CREATED");
            assertThat(row.get(7)).isEqualTo("1");
        }
        assertThat(csvBranches).hasSize(10_000).isEqualTo(jsonBranches);
    }

    @Test
    void jsonAndCsvRejectTenThousandAndOneGroupsWithoutReturningPartialData() throws Exception {
        Fixture f = fixture();
        insertGroupedRows(f, 10_001, "2026-01-22T00:00:00Z");
        var jsonOverflow = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-22T00:00:00Z").param("to", "2026-01-23T00:00:00Z"))
                .andExpect(status().isUnprocessableEntity()).andReturn().getResponse();
        assertThat(jsonOverflow.getContentType()).startsWith("application/problem+json");
        String jsonProblem = jsonOverflow.getContentAsString();
        assertThat(jsonProblem).contains("\"status\":422").doesNotContain("\"items\"", "HOLD_CREATED");
        var csvOverflow = mvc.perform(get("/api/v1/reports/hold-activity.csv").with(principal(f.staff(), "LIBRARIAN"))
                .param("from", "2026-01-22T00:00:00Z").param("to", "2026-01-23T00:00:00Z"))
                .andExpect(status().isUnprocessableEntity()).andReturn().getResponse();
        assertThat(csvOverflow.getContentType()).startsWith("application/problem+json").doesNotContain("text/csv");
        assertThat(java.util.Arrays.copyOf(csvOverflow.getContentAsByteArray(), 3))
                .isNotEqualTo(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
        assertThat(csvOverflow.getContentAsString()).contains("\"status\":422").doesNotContain("from,to,timezone", "HOLD_CREATED");
    }

    private void insertGroupedRows(Fixture fixture, int count, String occurredAt) {
        String idPrefix = "p7-" + fixture.hold();
        String codePrefix = "P7-" + fixture.hold().toString().substring(0, 8) + "-";
        Timestamp at = Timestamp.from(Instant.parse(occurredAt));
        jdbc.update("""
                INSERT INTO branches(id,code,name)
                SELECT md5(? || i::text)::uuid, ? || i::text, 'P7 threshold branch'
                FROM generate_series(1, ?) i
                """, idPrefix, codePrefix, count);
        jdbc.update("""
                INSERT INTO holds(id,reader_id,book_id,branch_id,status,queued_at,closed_at,policy_version,pickup_seconds)
                SELECT md5('hold' || ? || i::text)::uuid, ?, ?, md5(? || i::text)::uuid,
                       'CANCELLED', TIMESTAMPTZ '2026-01-01 00:00:00+00', TIMESTAMPTZ '2026-01-01 00:00:00+00', 'test-v1', 86400
                FROM generate_series(1, ?) i
                """, idPrefix, fixture.reader(), fixture.book(), idPrefix, count);
        jdbc.update("""
                INSERT INTO hold_changes(id,hold_id,hold_version,event_type,occurred_at)
                SELECT md5('change' || ? || i::text)::uuid, md5('hold' || ? || i::text)::uuid,
                       0, 'HOLD_CREATED', ?
                FROM generate_series(1, ?) i
                """, idPrefix, idPrefix, at, count);
    }

    private com.fasterxml.jackson.databind.JsonNode report(Fixture fixture, String from, String to) throws Exception {
        var response = mvc.perform(get("/api/v1/reports/hold-activity").with(principal(fixture.staff(), "LIBRARIAN"))
                .param("from", from).param("to", to).param("branchId", fixture.branch().toString())
                .param("bookId", fixture.book().toString())).andExpect(status().isOk()).andReturn();
        return new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getResponse().getContentAsString());
    }

    private Fixture fixture() {
        UUID staff = user("LIBRARIAN"), admin = user("ADMIN"), reader = user("READER");
        UUID branch = branch("BR"), otherBranch = branch("OB");
        UUID book = book(), otherBook = book();
        UUID hold = hold(reader, branch, book);
        return new Fixture(staff, admin, reader, branch, otherBranch, book, otherBook, hold);
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
                VALUES (?,?,?,?,'P7 test','test-only','ACTIVE',now(),now())
                """, id, id.toString().substring(0, 20), id + "@test.local", id + "@test.local");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)", id, role);
        return id;
    }

    private UUID branch(String prefix) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,?,?)", id,
                prefix + id.toString().substring(0, 16), "P7 branch");
        return id;
    }

    private UUID book() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,?,?)", id,
                "P7 book " + id, "p7 book " + id);
        return id;
    }

    private UUID hold(UUID reader, UUID branch, UUID book) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO holds(id,reader_id,book_id,branch_id,status,queued_at,policy_version,pickup_seconds)
                VALUES (?,?,?,?,'WAITING',TIMESTAMPTZ '2026-01-01 00:00:00+00','test-v1',86400)
                """, id, reader, book, branch);
        return id;
    }

    private void event(UUID hold, long version, String type, Instant occurredAt) {
        jdbc.update("INSERT INTO hold_changes(id,hold_id,hold_version,event_type,occurred_at) VALUES (?,?,?,?,?)",
                UUID.randomUUID(), hold, version, type, Timestamp.from(occurredAt));
    }

    private static List<List<String>> parseCsv(byte[] bytes) {
        String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        boolean closedQuote = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        cell.append('"');
                        i++;
                    } else {
                        quoted = false;
                        closedQuote = true;
                    }
                } else {
                    cell.append(ch);
                }
            } else if (closedQuote && ch != ',' && !(ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n')) {
                throw new AssertionError("Unexpected character after quoted CSV field: " + (int) ch);
            } else if (ch == '"') {
                if (cell.length() != 0) throw new AssertionError("CSV quote must start a field");
                quoted = true;
            } else if (ch == ',') {
                row.add(cell.toString());
                cell.setLength(0);
                closedQuote = false;
            } else if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                row.add(cell.toString());
                rows.add(List.copyOf(row));
                row.clear();
                cell.setLength(0);
                closedQuote = false;
                i++;
            } else if (ch == '\r' || ch == '\n') {
                throw new AssertionError("CSV record separator must be CRLF outside quoted fields");
            } else {
                cell.append(ch);
            }
        }
        if (quoted) throw new AssertionError("Unterminated quoted CSV field");
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(List.copyOf(row));
        }
        return List.copyOf(rows);
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor principal(UUID id, String role) {
        return jwt().jwt(token -> token.subject(id.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }
}
