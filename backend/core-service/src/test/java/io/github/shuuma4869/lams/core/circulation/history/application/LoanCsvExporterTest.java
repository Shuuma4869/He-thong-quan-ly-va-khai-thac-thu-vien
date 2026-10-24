package io.github.shuuma4869.lams.core.circulation.history.application;

import static org.assertj.core.api.Assertions.assertThat;
import io.github.shuuma4869.lams.core.circulation.history.api.CirculationReportResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LoanCsvExporterTest {
    @ParameterizedTest @ValueSource(strings={"=1+1","+123","-123","@SUM(A1)","  =1+1","\t=1+1","\rtext","\ntext","\uFEFF=1+1"})
    void formulaAndControlPrefixesAreLiteral(String value) {
        assertThat(LoanCsvExporter.cell(value)).startsWith("\"'").endsWith("\"");
    }
    @Test void quotesCommasNewlinesAndVietnameseArePreserved() {
        assertThat(LoanCsvExporter.cell("Thư viện, \"Tầng 2\"\nKhu A")).isEqualTo("\"Thư viện, \"\"Tầng 2\"\"\nKhu A\"");
    }
    @Test void emptyReportContainsOnlyHeaderAndUtf8Bom() {
        var report=new CirculationReportResponse(Instant.EPOCH,Instant.EPOCH.plusSeconds(1),"UTC",Instant.EPOCH,
                new CirculationReportResponse.Totals(0,0,0,0),List.of());
        assertThat(new String(LoanCsvExporter.export(report),StandardCharsets.UTF_8)).isEqualTo(
                "\uFEFFfrom,to,timezone,as_of,date,branch_id,branch_name,borrowed,active,returned,overdue\r\n");
    }
}
