package io.github.shuuma4869.lams.core.circulation.history.application;

import io.github.shuuma4869.lams.core.circulation.history.api.CirculationReportResponse;
import java.nio.charset.StandardCharsets;

public final class LoanCsvExporter {
    private LoanCsvExporter() {}
    public static byte[] export(CirculationReportResponse report) {
        // BOM giúp Excel nhận UTF-8; mỗi dòng mang phạm vi và thời điểm của báo cáo.
        var csv=new StringBuilder("\uFEFFfrom,to,timezone,as_of,date,branch_id,branch_name,borrowed,active,returned,overdue\r\n");
        for(var row:report.items()) {
            csv.append(cell(report.from().toString())).append(',').append(cell(report.to().toString())).append(',')
                    .append(cell(report.timezone())).append(',').append(cell(report.asOf().toString())).append(',')
                    .append(cell(row.date().toString())).append(',').append(cell(row.branchId().toString())).append(',')
                    .append(cell(row.branchName())).append(',').append(row.borrowed()).append(',').append(row.active()).append(',')
                    .append(row.returned()).append(',').append(row.overdue()).append("\r\n");
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }
    static String cell(String value) {
        String stripped=value.stripLeading();
        boolean formula=!stripped.isEmpty() && "=+-@".indexOf(stripped.charAt(0))>=0;
        boolean control=!value.isEmpty() && (Character.isISOControl(value.charAt(0)) || value.charAt(0)=='\uFEFF');
        String safe=formula||control?"'"+value:value;
        return "\""+safe.replace("\"","\"\"")+"\"";
    }
}
