package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import io.github.shuuma4869.lams.core.hold.api.HoldRequest;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class HoldService {
    private final JdbcTemplate jdbc;
    private final HoldRepository holds;
    private final HoldAllocationService allocation;
    private final CopyLockRepository locks;
    private final CopyStateService states;
    private final CirculationAccess access;
    private final CommandExecutor commands;
    private final BorrowPolicyService policy;
    private final Clock clock;
    private final int maxHolds;
    private final TransactionTemplate tx;

    public HoldService(JdbcTemplate jdbc, HoldRepository holds, HoldAllocationService allocation, CopyLockRepository locks,
                       CopyStateService states, CirculationAccess access, CommandExecutor commands, BorrowPolicyService policy,
                       Clock clock, PlatformTransactionManager transactions, @Value("${lams.circulation.max-active-holds:10}") int maxHolds) {
        this.jdbc=jdbc; this.holds=holds; this.allocation=allocation; this.locks=locks; this.states=states;
        this.access=access; this.commands=commands; this.policy=policy; this.clock=clock;
        if(maxHolds<1 || maxHolds>100) throw new IllegalArgumentException("Hạn mức giữ chỗ phải từ 1 đến 100.");
        this.maxHolds=maxHolds; this.tx=new TransactionTemplate(transactions); this.tx.setTimeout(20);
    }

    public Hold create(UUID actor, HoldRequest request) {
        if (request.anyEdition()==null || (request.anyEdition() && request.editionId()!=null)
                || (!request.anyEdition() && request.editionId()==null))
            throw new AuthFailure(422,"Chọn đúng ấn bản hoặc xác nhận nhận bất kỳ ấn bản nào, không chọn cả hai.");
        return commands.execute(actor,request.requestId(),"HOLD_CREATE",request,Hold.class,()->access.reader(actor),()->{
            jdbc.queryForList("SELECT id FROM users WHERE id=? FOR NO KEY UPDATE",actor);
            locks.lockBook(request.bookId());
            access.reader(actor);
            if(jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?",Integer.class,request.bookId())==0)
                throw new AuthFailure(404,"Không tìm thấy đầu sách.");
            var branch=jdbc.queryForList("SELECT status FROM branches WHERE id=?",String.class,request.branchId());
            if(branch.isEmpty()) throw new AuthFailure(404,"Không tìm thấy chi nhánh.");
            if(!branch.getFirst().equals("ACTIVE")) throw new AuthFailure(409,"Chi nhánh không hoạt động.");
            if(request.editionId()!=null && jdbc.queryForObject("SELECT count(*) FROM editions WHERE id=? AND book_id=?",Integer.class,request.editionId(),request.bookId())==0)
                throw new AuthFailure(422,"Ấn bản không thuộc đầu sách đã chọn.");
            if(jdbc.queryForObject("SELECT count(*) FROM holds WHERE reader_id=? AND status IN ('WAITING','READY')",Integer.class,actor)>=maxHolds)
                throw new AuthFailure(409,"Bạn đã đạt hạn mức yêu cầu giữ chỗ đang mở.");
            UUID id=UUID.randomUUID(); Instant now=now();
            jdbc.update("""
                    INSERT INTO holds(id,reader_id,book_id,edition_id,branch_id,status,queued_at,policy_version,pickup_seconds)
                    VALUES (?,?,?,?,?,'WAITING',?,?,?)
                    """,id,actor,request.bookId(),request.editionId(),request.branchId(),Timestamp.from(now),
                    policy.current().version(),policy.current().pickupDuration().toSeconds());
            allocation.record(holds.find(id).orElseThrow(),"HOLD_CREATED",actor,now);
            allocation.allocateBook(request.bookId(),actor,now);
            return holds.find(id).orElseThrow();
        });
    }

    public Hold cancel(UUID actor, UUID id, VersionedRequest request) {
        return commands.execute(actor,request.requestId(),"HOLD_CANCEL",Map.of("holdId",id,"request",request),Hold.class,
                ()->access.reader(actor),()->{
            Hold initial=find(id);
            if(!initial.readerId().equals(actor)) throw new AuthFailure(403,"Bạn chỉ được hủy giữ chỗ của mình.");
            locks.lockBook(initial.bookId());
            access.reader(actor);
            Hold hold=find(id);
            if(!hold.active() || hold.version()!=request.version()) throw new AuthFailure(409,"Giữ chỗ đã thay đổi hoặc đã đóng.");
            close(hold,"CANCELLED",actor,now());
            allocation.allocateBook(hold.bookId(),actor,now());
            return find(id);
        });
    }

    public void reconcileBook(UUID book) {
        tx.executeWithoutResult(s->{
            jdbc.execute("SET LOCAL lock_timeout = '5s'");
            locks.lockBook(book); Instant now=now();
            var expired=jdbc.query("SELECT * FROM holds WHERE book_id=? AND status='READY' AND expires_at<=? ORDER BY expires_at,id LIMIT 100",
                    (r,n)->HoldRepository.map(r),book,Timestamp.from(now));
            for(Hold hold:expired) close(hold,"EXPIRED",null,now);
            allocation.allocateBook(book,null,now);
        });
    }

    private void close(Hold hold, String status, UUID actor, Instant now) {
        var copy=hold.copyId()==null?null:locks.lockForBook(hold.bookId(),hold.copyId());
        if(copy!=null && !copy.status().equals("ON_HOLD")) throw new AuthFailure(409,"Trạng thái giữ chỗ và bản sách không khớp.");
        if(now.isBefore(hold.queuedAt()) || (hold.readyAt()!=null && now.isBefore(hold.readyAt())))
            throw new AuthFailure(409,"Thời gian hệ thống chưa hợp lệ để đóng giữ chỗ.");
        jdbc.update("UPDATE holds SET status=?,closed_at=?,version=version+1 WHERE id=?",status,Timestamp.from(now),hold.id());
        allocation.record(find(hold.id()),status.equals("EXPIRED")?"HOLD_EXPIRED":"HOLD_CANCELLED",actor,now);
        if(copy!=null) states.transition(copy,"AVAILABLE",actor,status.equals("EXPIRED")?"Hết hạn nhận giữ chỗ":"Hủy giữ chỗ",now);
    }

    private Hold find(UUID id) { return holds.find(id).orElseThrow(()->new AuthFailure(404,"Không tìm thấy giữ chỗ.")); }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
}
