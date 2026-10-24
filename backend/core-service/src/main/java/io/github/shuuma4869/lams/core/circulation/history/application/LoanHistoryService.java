package io.github.shuuma4869.lams.core.circulation.history.application;

import io.github.shuuma4869.lams.core.circulation.history.api.LoanHistoryResponse;
import io.github.shuuma4869.lams.core.circulation.history.api.LoanHistoryResponse.Page;
import io.github.shuuma4869.lams.core.circulation.history.api.LoanHistoryResponse.PageMetadata;
import io.github.shuuma4869.lams.core.circulation.history.infrastructure.LoanHistoryRepository;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class LoanHistoryService {
    private final LoanHistoryRepository repository;
    private final CirculationAccess access;
    private final Clock clock;
    public LoanHistoryService(LoanHistoryRepository repository,CirculationAccess access,Clock clock) {
        this.repository=repository;this.access=access;this.clock=clock;
    }
    public Page mine(UUID actor,LoanHistoryFilter filter) {
        access.reader(actor);
        if(!actor.equals(filter.readerId())) throw new AuthFailure(403,"Chỉ được xem lịch sử của mình.");
        return page(filter);
    }
    public Page staff(UUID actor,LoanHistoryFilter filter) {access.staff(actor);return page(filter);}
    public LoanHistoryResponse get(UUID actor,UUID id) {
        access.reader(actor);
        var row=repository.find(id,clock.instant()).orElseThrow(()->new AuthFailure(404,"Không tìm thấy lượt mượn."));
        access.ownerOrStaff(actor,row.readerId());return row;
    }
    private Page page(LoanHistoryFilter filter) {
        var now=clock.instant().truncatedTo(ChronoUnit.MICROS); long total=repository.count(filter,now);
        return new Page(repository.list(filter,now),new PageMetadata(filter.page(),filter.size(),total,(total+filter.size()-1)/filter.size()),now);
    }
}
