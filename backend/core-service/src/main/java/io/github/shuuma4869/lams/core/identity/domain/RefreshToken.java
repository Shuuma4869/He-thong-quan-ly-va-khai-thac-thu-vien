package io.github.shuuma4869.lams.core.identity.domain;

import java.time.Instant;
import java.util.UUID;

public record RefreshToken(UUID id, UUID userId, UUID familyId, Instant expiresAt, Instant revokedAt,
                           UUID replacedByTokenId, boolean rememberMe) {}
