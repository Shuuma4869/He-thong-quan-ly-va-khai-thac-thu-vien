package io.github.shuuma4869.lams.core.inventory.copy.api;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record BookCopyRequest(@NotNull UUID editionId,
                              @NotBlank @Size(max = 100) String barcode,
                              @NotNull UUID shelfId) {}
