package io.github.shuuma4869.lams.core.catalog.shared;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.UUID;

public final class CatalogAccess {
    private CatalogAccess() {}

    public static void requireReader(AuthService identity, UUID actorId) {
        var actor = identity.currentUser(actorId);
        if (actor.roles().stream().noneMatch(role -> role == RoleCode.READER
                || role == RoleCode.LIBRARIAN || role == RoleCode.ADMIN)) {
            throw new AuthFailure(403, "Bạn không có quyền đọc danh mục.");
        }
    }
}
