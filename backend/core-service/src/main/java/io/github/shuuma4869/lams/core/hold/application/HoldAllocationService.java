package io.github.shuuma4869.lams.core.hold.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationEvents;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyAvailable;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository.LockedCopy;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HoldAllocationService {
    private final JdbcTemplate jdbc;
    private final HoldRepository holds;
    private final CopyLockRepository locks;
    private final CopyStateService states;
    private final HoldEligibility eligibility;
    private final CirculationEvents events;
    public HoldAllocationService(JdbcTemplate jdbc, HoldRepository holds, CopyLockRepository locks,
                                 CopyStateService states, HoldEligibility eligibility, CirculationEvents events) {
        this.jdbc=jdbc; this.holds=holds; this.locks=locks; this.states=states; this.eligibility=eligibility; this.events=events;
    }

    @EventListener
    @Transactional(propagation=Propagation.MANDATORY)
    public void available(CopyAvailable event) {
        allocate(locks.lockForBook(event.bookId(), event.copyId()), event.actorId(), event.at());
    }

    @Transactional(propagation=Propagation.MANDATORY)
    public void allocateBook(UUID book, UUID actor, Instant now) {
        locks.lockBook(book);
        var queue = jdbc.query("SELECT * FROM holds WHERE book_id=? AND status='WAITING' ORDER BY queued_at,id",
                (r,n)->HoldRepository.map(r),book);
        for (Hold hold:queue) {
            if (!holds.find(hold.id()).orElseThrow().status().equals("WAITING") || !eligibility.eligible(hold.readerId(),now)) continue;
            var copies = jdbc.query("""
                    SELECT c.id FROM book_copies c JOIN editions e ON e.id=c.edition_id JOIN shelves s ON s.id=c.shelf_id
                    JOIN branches b ON b.id=s.branch_id WHERE e.book_id=? AND s.branch_id=? AND b.status='ACTIVE'
                    AND c.status='AVAILABLE' AND (?::uuid IS NULL OR c.edition_id=?) ORDER BY c.id LIMIT 1
                    """, (r,n)->r.getObject(1,UUID.class),book,hold.branchId(),hold.editionId(),hold.editionId());
            if(!copies.isEmpty()) allocate(locks.lockForBook(book,copies.getFirst()),actor,now);
        }
    }

    private void allocate(LockedCopy copy, UUID actor, Instant now) {
        if (!copy.status().equals("AVAILABLE") || !copy.branchStatus().equals("ACTIVE")) return;
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM loans WHERE copy_id=? AND returned_at IS NULL)", Boolean.class,copy.id())))
            throw new AuthFailure(409,"Bản sách còn lượt mượn chưa đóng.");
        for (Hold hold : holds.waiting(copy.bookId(),copy.branchId(),copy.editionId())) {
            if (hold.queuedAt().isAfter(now) || !eligibility.eligible(hold.readerId(),now)) continue;
            jdbc.update("UPDATE holds SET status='READY',copy_id=?,ready_at=?,expires_at=?,version=version+1 WHERE id=? AND status='WAITING'",
                    copy.id(),Timestamp.from(now),Timestamp.from(now.plusSeconds(hold.pickupSeconds())),hold.id());
            states.transition(copy,"ON_HOLD",actor,"Phân bổ giữ chỗ",now);
            record(holds.find(hold.id()).orElseThrow(),"HOLD_READY",actor,now);
            return;
        }
    }

    @Transactional(propagation=Propagation.MANDATORY)
    public void record(Hold hold, String type, UUID actor, Instant now) {
        jdbc.update("INSERT INTO hold_changes(id,hold_id,hold_version,event_type,actor_id,occurred_at) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(),hold.id(),hold.version(),type,actor,Timestamp.from(now));
        events.append("HOLD",hold.id(),hold.version(),type,hold,now);
    }

    @Transactional(propagation=Propagation.MANDATORY)
    public Hold requirePickupOrNoQueue(LockedCopy copy, UUID reader, Instant now) {
        if (copy.status().equals("ON_HOLD")) {
            var hold=holds.assigned(copy.id()).orElseThrow(()->new AuthFailure(409,"Không có giữ chỗ hợp lệ cho bản sách."));
            if (!hold.readerId().equals(reader) || !hold.expiresAt().isAfter(now))
                throw new AuthFailure(409,"Bản sách được giữ cho người khác hoặc đã hết hạn nhận.");
            return hold;
        }
        if (!copy.status().equals("AVAILABLE")) throw new AuthFailure(409,"Bản sách chưa sẵn sàng để mượn.");
        if (holds.waiting(copy.bookId(),copy.branchId(),copy.editionId()).stream()
                .anyMatch(h->eligibility.eligible(h.readerId(),now)))
            throw new AuthFailure(409,"Có yêu cầu đang chờ phân bổ; vui lòng tải lại sau khi hàng đợi được xử lý.");
        return null;
    }

    @Transactional(propagation=Propagation.MANDATORY)
    public void fulfill(Hold hold, UUID loan, UUID actor, Instant now) {
        if (hold==null) return;
        if(jdbc.update("UPDATE holds SET status='FULFILLED',loan_id=?,closed_at=?,version=version+1 WHERE id=? AND status='READY' AND version=?",
                loan,Timestamp.from(now),hold.id(),hold.version())!=1)
            throw new AuthFailure(409,"Giữ chỗ đã thay đổi trước khi nhận sách.");
        record(holds.find(hold.id()).orElseThrow(),"HOLD_FULFILLED",actor,now);
    }
}
