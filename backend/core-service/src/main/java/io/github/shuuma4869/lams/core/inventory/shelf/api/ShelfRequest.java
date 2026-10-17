package io.github.shuuma4869.lams.core.inventory.shelf.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ShelfRequest(@NotNull UUID branchId,
                           @NotBlank @Size(max = 30) String code,
                           @NotBlank @Size(max = 150) String label,
                           Integer sortOrder) {}
