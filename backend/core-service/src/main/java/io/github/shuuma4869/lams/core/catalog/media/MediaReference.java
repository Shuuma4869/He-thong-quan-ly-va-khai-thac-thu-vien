package io.github.shuuma4869.lams.core.catalog.media;

import java.time.Instant;
import java.util.UUID;

public record MediaReference(UUID id, String source, String sourceId, String sourceUrl, String imageUrl,
        String license, String licenseUrl, String attribution, String evidence, String mime, int byteSize,
        UUID approvedBy, Instant approvedAt, long version) {}
