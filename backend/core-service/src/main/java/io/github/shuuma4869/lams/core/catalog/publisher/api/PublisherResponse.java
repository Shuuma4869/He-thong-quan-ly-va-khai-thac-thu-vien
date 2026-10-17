package io.github.shuuma4869.lams.core.catalog.publisher.api;

import io.github.shuuma4869.lams.core.catalog.publisher.domain.Publisher;
import java.util.UUID;

public record PublisherResponse(UUID id, String name) {
    public static PublisherResponse from(Publisher publisher) {
        return new PublisherResponse(publisher.id(), publisher.name());
    }
}
