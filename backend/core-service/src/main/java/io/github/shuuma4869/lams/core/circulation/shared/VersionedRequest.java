package io.github.shuuma4869.lams.core.circulation.shared;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.UUID;

public record VersionedRequest(@NotNull UUID requestId,
        @NotNull @PositiveOrZero @JsonDeserialize(using=VersionDeserializer.class) Long version) {}
