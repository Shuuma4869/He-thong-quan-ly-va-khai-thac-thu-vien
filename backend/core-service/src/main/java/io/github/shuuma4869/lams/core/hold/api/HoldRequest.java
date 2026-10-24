package io.github.shuuma4869.lams.core.hold.api;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record HoldRequest(@NotNull UUID requestId, @NotNull UUID bookId, @NotNull UUID branchId,
                          UUID editionId, @NotNull Boolean anyEdition) {}
