package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldQueries {
    public record PageMetadata(int number,int size,long totalElements,long totalPages) {}
    public record HoldView(Hold hold, Long queuePosition) {}
    public record HoldPage(List<HoldView> items,PageMetadata page) {}
    private final HoldRepository holds;
    private final JdbcTemplate jdbc;
    private final CirculationAccess access;
    public HoldQueries(HoldRepository holds,JdbcTemplate jdbc,CirculationAccess access) {this.holds=holds;this.jdbc=jdbc;this.access=access;}

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldView get(UUID actor, UUID id) {
        access.reader(actor);
        Hold hold=holds.find(id).orElseThrow(()->new AuthFailure(404,"Không tìm thấy giữ chỗ."));
        access.ownerOrStaff(actor,hold.readerId()); return view(hold);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldPage mine(UUID actor,String pageValue,String sizeValue) {
        access.reader(actor); int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        long total=holds.countMine(actor);
        return new HoldPage(holds.mine(actor,page,size).stream().map(this::view).toList(),new PageMetadata(page,size,total,(total+size-1)/size));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public HoldPage queue(UUID actor,UUID book,UUID branch,String pageValue,String sizeValue) {
        access.staff(actor); int page=number(pageValue,0,Integer.MAX_VALUE),size=number(sizeValue,20,100);
        if(size<1) throw new AuthFailure(422,"size phải từ 1 đến 100.");
        long total=jdbc.queryForObject("SELECT count(*) FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING'",Long.class,book,branch);
        var rows=jdbc.query("SELECT * FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING' ORDER BY queued_at,id LIMIT ? OFFSET ?",
                (r,n)->HoldRepository.map(r),book,branch,size,(long)page*size);
        return new HoldPage(rows.stream().map(this::view).toList(),new PageMetadata(page,size,total,(total+size-1)/size));
    }
    private HoldView view(Hold hold) {
        Long position=null;
        if(hold.status().equals("WAITING")) position=1+jdbc.queryForObject("""
                SELECT count(*) FROM holds WHERE book_id=? AND branch_id=? AND status='WAITING' AND (queued_at,id)<(?,?)
                """,Long.class,hold.bookId(),hold.branchId(),Timestamp.from(hold.queuedAt()),hold.id());
        return new HoldView(hold,position);
    }
    public static int number(String value,int fallback,int max) {
        if(value==null) return fallback;
        try { int n=Integer.parseInt(value); if(n<0||n>max) throw new NumberFormatException(); return n; }
        catch(NumberFormatException e){throw new AuthFailure(422,"Phân trang không hợp lệ.");}
    }
}
