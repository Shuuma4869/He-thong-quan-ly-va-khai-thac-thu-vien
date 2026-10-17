package io.github.shuuma4869.lams.core.inventory.branch.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BranchRequest(@NotBlank @Size(max = 30) String code,
                            @NotBlank @Size(max = 200) String name,
                            @Size(max = 16) String status) {}
