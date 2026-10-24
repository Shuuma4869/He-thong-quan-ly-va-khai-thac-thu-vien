package io.github.shuuma4869.lams.core.circulation.history.application;

import io.github.shuuma4869.lams.core.circulation.history.api.CirculationReportResponse;
import io.github.shuuma4869.lams.core.circulation.history.api.CirculationReportResponse.Row;
import io.github.shuuma4869.lams.core.circulation.history.api.CirculationReportResponse.Totals;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CirculationReportService {
    private final NamedParameterJdbcTemplate jdbc;
    private final CirculationAccess access;
    private final Clock clock;
    public CirculationReportService(JdbcTemplate jdbc,CirculationAccess access,Clock clock) {
        this.jdbc=new NamedParameterJdbcTemplate(jdbc);this.access=access;this.clock=clock;
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=15)
    public CirculationReportResponse report(UUID actor,UUID branch,String from,String to,String timezone) {
        access.staff(actor);
        var filter=LoanHistoryFilter.parse(null,branch,null,null,from,to,null,null,null);
        filter.requireReportPeriod();
        String zone=timezone==null?"Asia/Ho_Chi_Minh":timezone;
        if(!Set.of("UTC","Asia/Ho_Chi_Minh").contains(zone))
            throw new AuthFailure(422,"timezone chỉ nhận UTC hoặc Asia/Ho_Chi_Minh.");
        var now=clock.instant().truncatedTo(ChronoUnit.MICROS);
        var params=new MapSqlParameterSource("from",Timestamp.from(filter.from()))
                .addValue("to",Timestamp.from(filter.to())).addValue("now",Timestamp.from(now))
                .addValue("zone",zone).addValue("branch",branch);
        var rows=jdbc.query("""
                SELECT timezone(:zone,l.borrowed_at)::date AS day,l.branch_id,b.name,
                  count(*) AS borrowed,
                  count(*) FILTER (WHERE l.returned_at IS NULL) AS active,
                  count(*) FILTER (WHERE l.returned_at IS NOT NULL) AS returned,
                  count(*) FILTER (WHERE l.returned_at IS NULL AND l.due_at<:now) AS overdue
                FROM loans l JOIN branches b ON b.id=l.branch_id
                WHERE l.borrowed_at>=:from AND l.borrowed_at<:to
                """+(branch==null?"":" AND l.branch_id=:branch")+"""
                 GROUP BY day,l.branch_id,b.name ORDER BY day,l.branch_id LIMIT 10001
                """,params,(r,n)->new Row(r.getDate("day").toLocalDate(),r.getObject("branch_id",UUID.class),r.getString("name"),
                r.getLong("borrowed"),r.getLong("active"),r.getLong("returned"),r.getLong("overdue")));
        if(rows.size()>10000) throw new AuthFailure(422,"Báo cáo quá 10000 dòng. Hãy giảm thời gian hoặc chọn một chi nhánh.");
        long borrowed=0,active=0,returned=0,overdue=0;
        for(var row:rows) {borrowed+=row.borrowed();active+=row.active();returned+=row.returned();overdue+=row.overdue();}
        return new CirculationReportResponse(filter.from(),filter.to(),zone,now,new Totals(borrowed,active,returned,overdue),rows);
    }
}
