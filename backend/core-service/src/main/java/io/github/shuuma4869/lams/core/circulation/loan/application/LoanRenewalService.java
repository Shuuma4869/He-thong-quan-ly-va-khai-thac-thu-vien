package io.github.shuuma4869.lams.core.circulation.loan.application;

import io.github.shuuma4869.lams.core.circulation.loan.api.LoanCommandResult;
import io.github.shuuma4869.lams.core.circulation.loan.infrastructure.LoanRepository;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationEvents;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import io.github.shuuma4869.lams.core.hold.infrastructure.HoldRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository;
import io.github.shuuma4869.lams.core.policy.application.BorrowPolicyService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class LoanRenewalService {
    private final JdbcTemplate jdbc;
    private final LoanRepository loans;
    private final CopyLockRepository locks;
    private final HoldRepository holds;
    private final CirculationAccess access;
    private final CommandExecutor commands;
    private final CirculationEvents events;
    private final BorrowPolicyService policy;
    private final Clock clock;

    public LoanRenewalService(JdbcTemplate jdbc, LoanRepository loans, CopyLockRepository locks,
                              HoldRepository holds, CirculationAccess access, CommandExecutor commands,
                              CirculationEvents events, BorrowPolicyService policy, Clock clock) {
        this.jdbc=jdbc; this.loans=loans; this.locks=locks; this.holds=holds; this.access=access;
        this.commands=commands; this.events=events; this.policy=policy; this.clock=clock;
    }

    public LoanCommandResult renew(UUID actor, UUID loanId, VersionedRequest request) {
        var initial=loans.find(loanId).orElseThrow(()->new AuthFailure(404,"Không tìm thấy lượt mượn."));
        return commands.execute(actor,request.requestId(),"RENEW",Map.of("loanId",loanId,"request",request),
                LoanCommandResult.class,()->access.ownerOrStaff(actor,initial.readerId()),()->{
            jdbc.queryForList("SELECT id FROM users WHERE id=? FOR NO KEY UPDATE",initial.readerId());
            var copy=locks.lock(initial.copyId());
            var loan=loans.lock(loanId).orElseThrow(()->new AuthFailure(404,"Không tìm thấy lượt mượn."));
            access.ownerOrStaff(actor,loan.readerId());
            access.reader(loan.readerId());
            var now=clock.instant().truncatedTo(ChronoUnit.MICROS);
            var p=policy.current();
            if(!loan.active() || loan.version()!=request.version() || !copy.status().equals("ON_LOAN"))
                throw new AuthFailure(409,"Lượt mượn đã trả hoặc đã thay đổi; hãy tải lại.");
            if(!copy.branchId().equals(loan.branchId()) || !copy.branchStatus().equals("ACTIVE"))
                throw new AuthFailure(409,"Chi nhánh của lượt mượn không còn hợp lệ.");
            if(now.isBefore(loan.borrowedAt()) || !now.isBefore(loan.dueAt())
                    || (p.blockOverdue() && loans.hasOverdue(loan.readerId(),now)))
                throw new AuthFailure(409,"Không thể gia hạn khi đã đến hạn trả hoặc còn sách quá hạn.");
            if(loan.renewalCount()>=p.maxRenewals()) throw new AuthFailure(409,"Đã hết số lần gia hạn cho lượt mượn.");
            if(!holds.waiting(copy.bookId(),copy.branchId(),copy.editionId()).isEmpty())
                throw new AuthFailure(409,"Có người đang chờ ấn bản phù hợp tại chi nhánh này.");
            var due=loan.dueAt().plus(p.renewalDuration());
            String snapshot=commands.encode(Map.of("version",p.version(),"maxRenewals",p.maxRenewals(),
                    "renewalDuration",p.renewalDuration().toString(),"blockOverdue",p.blockOverdue()));
            jdbc.update("UPDATE loans SET due_at=?,renewal_count=renewal_count+1,version=version+1 WHERE id=?",
                    Timestamp.from(due),loanId);
            jdbc.update("""
                    INSERT INTO loan_extensions(id,loan_id,loan_version,actor_id,previous_due_at,due_at,extended_at,policy_version,policy_snapshot)
                    VALUES (?,?,?,?,?,?,?,?,?::jsonb)
                    """,UUID.randomUUID(),loanId,loan.version()+1,actor,Timestamp.from(loan.dueAt()),Timestamp.from(due),
                    Timestamp.from(now),p.version(),snapshot);
            var result=LoanCommandResult.from(loans.find(loanId).orElseThrow(),copy.version());
            events.append("LOAN",loanId,result.version(),"LOAN_RENEWED",result,now);
            return result;
        });
    }
}
