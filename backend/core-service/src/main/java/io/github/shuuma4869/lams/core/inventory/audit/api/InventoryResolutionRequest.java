package io.github.shuuma4869.lams.core.inventory.audit.api;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record InventoryResolutionRequest(@NotNull UUID requestId, @NotNull Action action,
        @NotBlank @Size(max=500) String reason,
        @PositiveOrZero @JsonDeserialize(using=InventoryRequests.ExactLong.class) Long expectedCopyVersion) {
    public enum Action { REVIEWED, MOVE_TO_SCANNED_SHELF }
}
