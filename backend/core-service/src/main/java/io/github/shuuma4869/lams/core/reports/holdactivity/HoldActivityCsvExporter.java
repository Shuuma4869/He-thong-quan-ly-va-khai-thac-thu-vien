package io.github.shuuma4869.lams.core.reports.holdactivity;

import java.nio.charset.StandardCharsets;

public final class HoldActivityCsvExporter {
    private HoldActivityCsvExporter() {}

    public static byte[] export(HoldActivityReport report) {
        var csv = new StringBuilder("\uFEFFfrom,to,timezone,branch_id,book_id,date,event_type,event_count\r\n");
        for (var row : report.items()) {
            csv.append(cell(report.from().toString())).append(',')
                    .append(cell(report.to().toString())).append(',')
                    .append(cell(report.timezone())).append(',')
                    .append(cell(row.branchId().toString())).append(',')
                    .append(cell(report.bookId() == null ? "" : report.bookId().toString())).append(',')
                    .append(cell(row.date().toString())).append(',')
                    .append(cell(row.eventType())).append(',')
                    .append(row.eventCount()).append("\r\n");
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    static String cell(String value) {
        int first = 0;
        while (first < value.length()) {
            int codePoint = value.codePointAt(first);
            if (!Character.isWhitespace(codePoint) && !Character.isSpaceChar(codePoint)
                    && !Character.isISOControl(codePoint)
                    && Character.getType(codePoint) != Character.FORMAT) break;
            first += Character.charCount(codePoint);
        }
        boolean unsafePrefix = first > 0;
        boolean formula = first < value.length() && "=+-@".indexOf(value.charAt(first)) >= 0;
        String safe = unsafePrefix || formula ? "'" + value : value;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
}
