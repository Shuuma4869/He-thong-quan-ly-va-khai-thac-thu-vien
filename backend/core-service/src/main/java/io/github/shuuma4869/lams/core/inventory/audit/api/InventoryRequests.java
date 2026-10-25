package io.github.shuuma4869.lams.core.inventory.audit.api;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.io.IOException;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.UUID;

public final class InventoryRequests {
    private InventoryRequests() {}
    public record Start(@NotNull UUID requestId, @NotNull UUID branchId, UUID shelfId) {}
    public record Scan(@NotNull UUID clientScanId, @NotBlank @Size(max=100) String barcode,
            @NotNull UUID shelfId, Instant clientScannedAt) {}
    public record Close(@NotNull UUID requestId,
            @NotNull @PositiveOrZero @JsonDeserialize(using=ExactLong.class) Long version,
            @Size(max=500) String reason) {}

    public static final class ExactLong extends JsonDeserializer<Long> {
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) {
                throw JsonMappingException.from(parser, "version phải là số nguyên");
            }
            return parser.getLongValue();
        }
    }
}
