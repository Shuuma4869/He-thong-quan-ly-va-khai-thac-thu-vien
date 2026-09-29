package io.github.shuuma4869.lams.core.identity.domain;

import java.util.List;
import java.util.UUID;

public record IdentityUser(UUID id, String memberCode, String email, String fullName, String passwordHash,
                           UserStatus status, List<RoleCode> roles) {}
