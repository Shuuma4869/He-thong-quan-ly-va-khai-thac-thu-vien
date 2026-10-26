package io.github.shuuma4869.lams.core.catalog.category.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record CategoryAliasRequest(@NotNull UUID categoryId,
        @NotBlank @Size(max = 150) String name) {}
