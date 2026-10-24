package io.github.shuuma4869.lams.core.circulation.loan.api;

import io.github.shuuma4869.lams.core.circulation.loan.domain.Loan;
import java.time.Instant;
import java.util.UUID;

public record LoanCommandResult(UUID loanId, UUID copyId, UUID readerId, UUID editionId, UUID branchId,
                                Instant borrowedAt, Instant dueAt, Instant returnedAt,
                                int renewalCount, long version, long copyVersion) {
    public static LoanCommandResult from(Loan loan, long copyVersion) {
        return new LoanCommandResult(loan.id(), loan.copyId(), loan.readerId(), loan.editionId(), loan.branchId(),
                loan.borrowedAt(), loan.dueAt(), loan.returnedAt(), loan.renewalCount(), loan.version(), copyVersion);
    }
}
