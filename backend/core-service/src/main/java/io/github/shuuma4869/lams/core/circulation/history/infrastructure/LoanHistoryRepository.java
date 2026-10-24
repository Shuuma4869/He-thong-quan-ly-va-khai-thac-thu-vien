package io.github.shuuma4869.lams.core.circulation.history.infrastructure;

import io.github.shuuma4869.lams.core.circulation.history.api.LoanHistoryResponse;
import io.github.shuuma4869.lams.core.circulation.history.application.LoanHistoryFilter;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LoanHistoryRepository {
    private static final String SELECT="""
            SELECT l.*,b.title AS book_title,c.barcode,br.name AS branch_name,c.version AS copy_version
            FROM loans l JOIN editions e ON e.id=l.edition_id JOIN books b ON b.id=e.book_id
            JOIN book_copies c ON c.id=l.copy_id JOIN branches br ON br.id=l.branch_id
            """;
    private final NamedParameterJdbcTemplate jdbc;
    public LoanHistoryRepository(JdbcTemplate jdbc) {this.jdbc=new NamedParameterJdbcTemplate(jdbc);}

    public List<LoanHistoryResponse> list(LoanHistoryFilter filter,Instant now) {
        var params=parameters(filter,now).addValue("limit",filter.size()).addValue("offset",(long)filter.page()*filter.size());
        return jdbc.query(SELECT+where(filter)+" ORDER BY "+filter.order().sql()+" LIMIT :limit OFFSET :offset",params,(r,n)->map(r,now));
    }
    public long count(LoanHistoryFilter filter,Instant now) {
        return jdbc.queryForObject("SELECT count(*) FROM loans l"+where(filter),parameters(filter,now),Long.class);
    }
    public Optional<LoanHistoryResponse> find(UUID id,Instant now) {
        return jdbc.query(SELECT+" WHERE l.id=:id",new MapSqlParameterSource("id",id),(r,n)->map(r,now)).stream().findFirst();
    }

    private String where(LoanHistoryFilter f) {
        String sql=" WHERE 1=1";
        if(f.readerId()!=null) sql+=" AND l.reader_id=:reader";
        if(f.branchId()!=null) sql+=" AND l.branch_id=:branch";
        if(f.copyId()!=null) sql+=" AND l.copy_id=:copy";
        if(f.from()!=null) sql+=" AND l.borrowed_at>=:from";
        if(f.to()!=null) sql+=" AND l.borrowed_at<:to";
        if("ACTIVE".equals(f.status())) sql+=" AND l.returned_at IS NULL";
        if("RETURNED".equals(f.status())) sql+=" AND l.returned_at IS NOT NULL";
        if("OVERDUE".equals(f.status())) sql+=" AND l.returned_at IS NULL AND l.due_at<:now";
        return sql;
    }
    private MapSqlParameterSource parameters(LoanHistoryFilter f,Instant now) {
        return new MapSqlParameterSource().addValue("reader",f.readerId()).addValue("branch",f.branchId()).addValue("copy",f.copyId())
                .addValue("from",f.from()==null?null:Timestamp.from(f.from())).addValue("to",f.to()==null?null:Timestamp.from(f.to()))
                .addValue("now",Timestamp.from(now));
    }
    private LoanHistoryResponse map(ResultSet r,Instant now) throws SQLException {
        Timestamp returned=r.getTimestamp("returned_at"); Instant due=r.getTimestamp("due_at").toInstant();
        boolean overdue=returned==null && due.isBefore(now);
        return new LoanHistoryResponse(r.getObject("id",UUID.class),r.getObject("copy_id",UUID.class),r.getObject("reader_id",UUID.class),
                r.getObject("edition_id",UUID.class),r.getObject("branch_id",UUID.class),r.getString("book_title"),r.getString("barcode"),
                r.getString("branch_name"),r.getTimestamp("borrowed_at").toInstant(),due,returned==null?null:returned.toInstant(),
                r.getInt("renewal_count"),r.getLong("version"),r.getLong("copy_version"),returned!=null?"RETURNED":overdue?"OVERDUE":"ACTIVE",overdue);
    }
}
