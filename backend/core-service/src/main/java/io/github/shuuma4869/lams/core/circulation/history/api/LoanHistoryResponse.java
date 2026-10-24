package io.github.shuuma4869.lams.core.circulation.history.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record LoanHistoryResponse(UUID loanId, UUID copyId, UUID readerId, UUID editionId, UUID branchId,
                                  String bookTitle, String barcode, String branchName, Instant borrowedAt,
                                  Instant dueAt, Instant returnedAt, int renewalCount, long version,
                                  long copyVersion, String status, boolean overdue) {
    public record PageMetadata(int number,int size,long totalElements,long totalPages) {}
    public record Page(List<LoanHistoryResponse> items,PageMetadata page,Instant asOf) {}
}
