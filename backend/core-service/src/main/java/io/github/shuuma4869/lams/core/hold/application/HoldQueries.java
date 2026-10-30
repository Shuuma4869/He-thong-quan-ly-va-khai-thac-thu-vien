package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldQueries {
    public record PageMetadata(int number,int size,long totalElements,long totalPages) {}
    public record HoldView(Hold hold, Long queuePosition,String bookTitle,String branchName) {}
    public record HoldPage(List<HoldView> items,PageMetadata page) {}
    public record StaffHoldSummary(long waiting,long ready,long expiringSoon,long fulfilledLast30Days,long needsAttention) {}
    public record StaffHoldItem(Hold hold,Long queuePosition,String readerMemberCode,String readerName,String bookTitle,
                                String isbn13,String branchCode,String branchName,String copyBarcode,String copyStatus,
                                Long copyVersion) {}
    public record HoldChangeView(long version,String eventType,UUID actorId,Instant occurredAt) {}
    public record StaffHoldDetail(StaffHoldItem item,List<HoldChangeView> history) {}
    public record StaffHoldPage(List<StaffHoldItem> items,PageMetadata page) {}
    public record PickupBranch(UUID id,String code,String name) {}
    public record PickupBranches(List<PickupBranch> items,PageMetadata page) {}
    private final HoldRepository holds;
    private final JdbcTemplate jdbc;
    private final CirculationAccess access;
    public HoldQueries(HoldRepository holds,JdbcTemplate jdbc,CirculationAccess access) {this.holds=holds;this.jdbc=jdbc;this.access=access;}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldView get(UUID actor, UUID id) {
        access.reader(actor);
        Hold hold=holds.find(id).orElseThrow(()->new AuthFailure(404,"Không tìm thấy giữ chỗ."));
        access.ownerOrStaff(actor,hold.readerId()); return views(List.of(hold)).getFirst();
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldPage mine(UUID actor,String pageValue,String sizeValue) {
        access.reader(actor); int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        long total=holds.countMine(actor);
        return new HoldPage(views(holds.mine(actor,page,size)),new PageMetadata(page,size,total,(total+size-1)/size));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldPage queue(UUID actor,UUID book,UUID branch,String pageValue,String sizeValue) {
        access.staff(actor); int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        long total=jdbc.queryForObject("SELECT count(*) FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING'",Long.class,book,branch);
        var rows=jdbc.query("SELECT * FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING' ORDER BY queued_at,id LIMIT ? OFFSET ?",
                (r,n)->HoldRepository.map(r),book,branch,size,(long)page*size);
        return new HoldPage(views(rows),new PageMetadata(page,size,total,(total+size-1)/size));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public StaffHoldSummary staffSummary(UUID actor) {
        access.staff(actor);
        return jdbc.queryForObject("""
                SELECT COUNT(*) FILTER (WHERE status='WAITING') AS waiting,
                       COUNT(*) FILTER (WHERE status='READY') AS ready,
                       COUNT(*) FILTER (WHERE status='READY'
                           AND expires_at>transaction_timestamp()
                           AND expires_at<=transaction_timestamp()+interval '24 hours') AS expiring_soon,
                       COUNT(*) FILTER (WHERE status='FULFILLED'
                           AND closed_at>=transaction_timestamp()-interval '30 days') AS fulfilled_last_30_days,
                       COUNT(*) FILTER (WHERE status='READY'
                           AND expires_at<=transaction_timestamp()) AS needs_attention
                FROM holds
                """, (r,n)->new StaffHoldSummary(r.getLong("waiting"),r.getLong("ready"),
                r.getLong("expiring_soon"),r.getLong("fulfilled_last_30_days"),r.getLong("needs_attention")));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public StaffHoldPage staffList(UUID actor,String status,String readerQuery,String bookQuery,UUID branch,
                                   String fromValue,String toValue,String expiresBeforeValue,
                                   String pageValue,String sizeValue) {
        access.staff(actor);
        int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        if(status!=null && !status.isBlank()
                && !List.of("WAITING","READY","FULFILLED","CANCELLED","EXPIRED").contains(status))
            throw new AuthFailure(422,"status không hợp lệ.");
        String reader=term(readerQuery,150,"Tìm người đọc");
        String bookTerm=term(bookQuery,200,"Tìm tác phẩm");
        Instant from=time(fromValue),to=time(toValue),expiresBefore=time(expiresBeforeValue);
        if(from!=null && to!=null && !from.isBefore(to)) throw new AuthFailure(422,"from phải nhỏ hơn to.");
        MapSqlParameterSource parameters=staffParameters(status,reader,bookTerm,branch,from,to,expiresBefore);
        NamedParameterJdbcTemplate named=new NamedParameterJdbcTemplate(jdbc);
        Long total=named.queryForObject(staffWhere("SELECT count(*) FROM holds h JOIN users u ON u.id=h.reader_id JOIN books b ON b.id=h.book_id"),
                parameters,Long.class);
        parameters.addValue("limit",size).addValue("offset",(long)page*size);
        List<Hold> rows=named.query("""
                SELECT h.* FROM holds h
                JOIN users u ON u.id=h.reader_id
                JOIN books b ON b.id=h.book_id
                """+"\n"+staffConditions()+" ORDER BY h.queued_at DESC,h.id LIMIT :limit OFFSET :offset",
                parameters,(r,n)->HoldRepository.map(r));
        return new StaffHoldPage(staffViews(rows),new PageMetadata(page,size,total,(total+size-1)/size));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public StaffHoldDetail staffGet(UUID actor,UUID id) {
        access.staff(actor);
        Hold hold=holds.find(id).orElseThrow(()->new AuthFailure(404,"Không tìm thấy giữ chỗ."));
        StaffHoldItem item=staffViews(List.of(hold)).getFirst();
        List<HoldChangeView> history=jdbc.query("""
                SELECT hold_version,event_type,actor_id,occurred_at
                FROM hold_changes WHERE hold_id=? ORDER BY hold_version,id
                """,(r,n)->new HoldChangeView(r.getLong("hold_version"),r.getString("event_type"),
                r.getObject("actor_id",UUID.class),r.getTimestamp("occurred_at").toInstant()),id);
        return new StaffHoldDetail(item,history);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PickupBranches branches(UUID actor,String pageValue,String sizeValue) {
        access.reader(actor);int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        long total=jdbc.queryForObject("SELECT count(*) FROM branches WHERE status='ACTIVE'",Long.class);
        var rows=jdbc.query("SELECT id,code,name FROM branches WHERE status='ACTIVE' ORDER BY code,id LIMIT ? OFFSET ?",
                (r,n)->new PickupBranch(r.getObject("id",UUID.class),r.getString("code"),r.getString("name")),size,(long)page*size);
        return new PickupBranches(rows,new PageMetadata(page,size,total,(total+size-1)/size));
    }
    private List<HoldView> views(List<Hold> values) {
        if(values.isEmpty()) return List.of();
        var byId=values.stream().collect(java.util.stream.Collectors.toMap(Hold::id,h->h));
        var rows=new NamedParameterJdbcTemplate(jdbc).query("""
                SELECT h.id,b.title,br.name,
                  CASE WHEN h.status='WAITING' THEN 1+(SELECT count(*) FROM holds q
                    WHERE q.book_id=h.book_id AND q.branch_id=h.branch_id AND q.status='WAITING'
                    AND (q.queued_at,q.id)<(h.queued_at,h.id)) END AS queue_position
                FROM holds h JOIN books b ON b.id=h.book_id JOIN branches br ON br.id=h.branch_id
                WHERE h.id IN (:ids)
                """,Map.of("ids",byId.keySet()),(r,n)->new HoldView(byId.get(r.getObject("id",UUID.class)),
                r.getObject("queue_position",Long.class),r.getString("title"),r.getString("name")));
        var views=rows.stream().collect(java.util.stream.Collectors.toMap(v->v.hold().id(),v->v));
        return values.stream().map(h->views.get(h.id())).toList();
    }
    private List<StaffHoldItem> staffViews(List<Hold> values) {
        if(values.isEmpty()) return List.of();
        var byId=values.stream().collect(java.util.stream.Collectors.toMap(Hold::id,h->h));
        var rows=new NamedParameterJdbcTemplate(jdbc).query("""
                SELECT h.id,u.member_code,u.full_name,b.title,e.isbn13,br.code AS branch_code,br.name AS branch_name,
                       c.barcode AS copy_barcode,c.status AS copy_status,c.version AS copy_version,
                       CASE WHEN h.status='WAITING' THEN 1+(SELECT count(*) FROM holds q
                           WHERE q.book_id=h.book_id AND q.branch_id=h.branch_id AND q.status='WAITING'
                             AND (q.queued_at,q.id)<(h.queued_at,h.id)) END AS queue_position
                FROM holds h
                JOIN users u ON u.id=h.reader_id
                JOIN books b ON b.id=h.book_id
                LEFT JOIN editions e ON e.id=h.edition_id
                JOIN branches br ON br.id=h.branch_id
                LEFT JOIN book_copies c ON c.id=h.copy_id
                WHERE h.id IN (:ids)
                """,Map.of("ids",byId.keySet()),(r,n)->new StaffHoldItem(byId.get(r.getObject("id",UUID.class)),
                r.getObject("queue_position",Long.class),r.getString("member_code"),r.getString("full_name"),
                r.getString("title"),r.getString("isbn13"),r.getString("branch_code"),r.getString("branch_name"),
                r.getString("copy_barcode"),r.getString("copy_status"),r.getObject("copy_version",Long.class)));
        var byHoldId=rows.stream().collect(java.util.stream.Collectors.toMap(item->item.hold().id(),item->item));
        return values.stream().map(hold->byHoldId.get(hold.id())).toList();
    }
    private static String staffWhere(String select) {return select+"\n"+staffConditions();}
    private static String staffConditions() {
        return """
                WHERE (CAST(:status AS text) IS NULL OR h.status=CAST(:status AS text))
                  AND (CAST(:reader AS text) IS NULL OR u.member_code ILIKE CAST(:reader AS text)
                       OR u.full_name ILIKE CAST(:reader AS text))
                  AND (CAST(:bookTerm AS text) IS NULL OR b.title ILIKE CAST(:bookTerm AS text))
                  AND (CAST(:branchId AS uuid) IS NULL OR h.branch_id=CAST(:branchId AS uuid))
                  AND (CAST(:fromTime AS timestamptz) IS NULL OR h.queued_at>=CAST(:fromTime AS timestamptz))
                  AND (CAST(:toTime AS timestamptz) IS NULL OR h.queued_at<CAST(:toTime AS timestamptz))
                  AND (CAST(:expiresBefore AS timestamptz) IS NULL OR (h.status='READY'
                       AND h.expires_at>transaction_timestamp() AND h.expires_at<=CAST(:expiresBefore AS timestamptz)))
                """;
    }
    private static MapSqlParameterSource staffParameters(String status,String reader,String bookTerm,UUID branch,
                                                         Instant from,Instant to,Instant expiresBefore) {
        return new MapSqlParameterSource().addValue("status",status==null||status.isBlank()?null:status)
                .addValue("reader",reader==null?null:"%"+reader+"%")
                .addValue("bookTerm",bookTerm==null?null:"%"+bookTerm+"%")
                .addValue("branchId",branch)
                .addValue("fromTime",from==null?null:Timestamp.from(from))
                .addValue("toTime",to==null?null:Timestamp.from(to))
                .addValue("expiresBefore",expiresBefore==null?null:Timestamp.from(expiresBefore));
    }
    private static String term(String value,int max,String label) {
        if(value==null||value.isBlank()) return null;
        String normalized=value.trim();
        if(normalized.length()>max) throw new AuthFailure(422,label+" quá dài.");
        return normalized;
    }
    private static Instant time(String value) {
        if(value==null||value.isBlank()) return null;
        try {return Instant.parse(value);}
        catch(DateTimeParseException e) {throw new AuthFailure(422,"Thời gian phải có múi giờ theo ISO 8601.");}
    }
    public static int number(String value,int fallback,int max) {
        if(value==null) return fallback;
        try { int n=Integer.parseInt(value); if(n<0||n>max) throw new NumberFormatException(); return n; }
        catch(NumberFormatException e){throw new AuthFailure(422,"Phân trang không hợp lệ.");}
    }
}
