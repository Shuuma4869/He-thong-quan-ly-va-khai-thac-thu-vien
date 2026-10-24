package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldQueries {
    public record PageMetadata(int number,int size,long totalElements,long totalPages) {}
    public record HoldView(Hold hold, Long queuePosition,String bookTitle,String branchName) {}
    public record HoldPage(List<HoldView> items,PageMetadata page) {}
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
    public static int number(String value,int fallback,int max) {
        if(value==null) return fallback;
        try { int n=Integer.parseInt(value); if(n<0||n>max) throw new NumberFormatException(); return n; }
        catch(NumberFormatException e){throw new AuthFailure(422,"Phân trang không hợp lệ.");}
    }
}
