package io.github.shuuma4869.lams.core.circulation.history.application;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Set;
import java.util.UUID;

public record LoanHistoryFilter(UUID readerId, UUID branchId, UUID copyId, String status,
                                Instant from, Instant to, Sort order, int page, int size) {
    public enum Sort {
        BORROWED_ASC("borrowedAt,asc","l.borrowed_at ASC,l.id ASC"),
        BORROWED_DESC("borrowedAt,desc","l.borrowed_at DESC,l.id ASC"),
        DUE_ASC("dueAt,asc","l.due_at ASC,l.id ASC"),
        DUE_DESC("dueAt,desc","l.due_at DESC,l.id ASC");
        private final String value;
        private final String sql;
        Sort(String value,String sql) {this.value=value;this.sql=sql;}
        public String sql() {return sql;}
        static Sort parse(String value) {
            if(value==null) return BORROWED_DESC;
            for(var sort:values()) if(sort.value.equals(value)) return sort;
            throw invalid("sort chỉ nhận borrowedAt hoặc dueAt, kèm asc hoặc desc.");
        }
    }

    public static LoanHistoryFilter parse(UUID reader, UUID branch, UUID copy, String status,
                                          String from, String to, String sort, String page, String size) {
        if(status!=null && !Set.of("ACTIVE","OVERDUE","RETURNED").contains(status))
            throw invalid("status chỉ nhận ACTIVE, OVERDUE hoặc RETURNED.");
        Instant start=time(from),end=time(to);
        if(start!=null && end!=null && !start.isBefore(end)) throw invalid("from phải nhỏ hơn to.");
        return new LoanHistoryFilter(reader,branch,copy,status,start,end,Sort.parse(sort),
                number(page,0,0,Integer.MAX_VALUE),number(size,20,1,100));
    }

    public void requireReportPeriod() {
        if(from==null || to==null || Duration.between(from,to).compareTo(Duration.ofDays(366))>0)
            throw invalid("Báo cáo cần from/to và khoảng thời gian không quá 366 ngày.");
    }

    private static Instant time(String value) {
        if(value==null) return null;
        try {
            Instant parsed=Instant.parse(value);
            if(parsed.isBefore(Instant.parse("0001-01-01T00:00:00Z")) || !parsed.isBefore(Instant.parse("+10000-01-01T00:00:00Z")))
                throw invalid("Thời gian phải nằm trong các năm 0001–9999.");
            return parsed;
        }
        catch(DateTimeParseException e) {throw invalid("Thời gian phải có múi giờ theo ISO 8601, ví dụ 2026-10-24T00:00:00Z.");}
    }
    private static int number(String value,int fallback,int min,int max) {
        if(value==null) return fallback;
        try {int n=Integer.parseInt(value); if(n<min||n>max) throw new NumberFormatException(); return n;}
        catch(NumberFormatException e) {throw invalid("Phân trang không hợp lệ.");}
    }
    private static AuthFailure invalid(String message) {return new AuthFailure(422,message);}
}
