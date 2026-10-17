package io.github.shuuma4869.lams.core.inventory.branch.api;

import io.github.shuuma4869.lams.core.inventory.branch.domain.Branch;
import java.util.UUID;

public record BranchResponse(UUID id, String code, String name, String status) {
    public static BranchResponse from(Branch branch) {
        return new BranchResponse(branch.id(), branch.code(), branch.name(), branch.status());
    }
}
