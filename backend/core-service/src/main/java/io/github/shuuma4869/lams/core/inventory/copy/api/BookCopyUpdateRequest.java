package io.github.shuuma4869.lams.core.inventory.copy.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record BookCopyUpdateRequest(@NotNull UUID editionId,
                                    @NotBlank @Size(max = 100) String barcode,
                                    @NotNull UUID shelfId,
                                    @NotNull @Min(0) Long version) {}
