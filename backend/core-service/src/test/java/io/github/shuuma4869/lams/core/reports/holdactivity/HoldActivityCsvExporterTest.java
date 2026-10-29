package io.github.shuuma4869.lams.core.reports.holdactivity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class HoldActivityCsvExporterTest {
    @Test
    void writesUtf8BomAndVietnameseText() {
        String vietnamese = "Đã tạo giữ chỗ";
        byte[] bytes = HoldActivityCsvExporter.cell(vietnamese).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(new String(bytes, java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("\"" + vietnamese + "\"");
        byte[] csv = HoldActivityCsvExporter.export(report(List.of()));
        assertThat(csv).startsWith((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
    }

    @Test
    void quotesCsvSpecialCharactersAndNeutralizesFormulaAfterWhitespaceOrControls() {
        assertThat(HoldActivityCsvExporter.cell("a,b")).isEqualTo("\"a,b\"");
        assertThat(HoldActivityCsvExporter.cell("a\"b")).isEqualTo("\"a\"\"b\"");
        assertThat(HoldActivityCsvExporter.cell("a\r\nb")).isEqualTo("\"a\r\nb\"");
        for (String prefix : List.of("=", "+", "-", "@", " ", "\t", "\r", "\u0000", "\u007f", "\uFEFF", "\u200B")) {
            String value = prefix + "=1+1";
            assertThat(HoldActivityCsvExporter.cell(value)).as("prefix %s", prefix).isEqualTo("\"'" + value + "\"");
        }
    }

    @Test
    void emitsHeaderOnlyForEmptyDataset() {
        String csv = new String(HoldActivityCsvExporter.export(report(List.of())), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).isEqualTo("\uFEFFfrom,to,timezone,branch_id,book_id,date,event_type,event_count\r\n");
    }

    private static HoldActivityReport report(List<HoldActivityReport.Row> rows) {
        return new HoldActivityReport(Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-01-02T00:00:00Z"),
                HoldActivityReportService.TIMEZONE, null, null,
                rows.stream().mapToLong(HoldActivityReport.Row::eventCount).sum(), rows);
    }
}
