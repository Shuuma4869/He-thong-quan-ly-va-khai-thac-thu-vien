package io.github.shuuma4869.lams.core.circulation.loan.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.UUID;

public record BorrowRequest(@NotNull UUID requestId, @NotNull UUID copyId, @NotNull UUID readerId,
                            @NotNull UUID branchId, @NotNull @PositiveOrZero
                            @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = io.github.shuuma4869.lams.core.circulation.shared.VersionDeserializer.class)
                            Long copyVersion) {}
