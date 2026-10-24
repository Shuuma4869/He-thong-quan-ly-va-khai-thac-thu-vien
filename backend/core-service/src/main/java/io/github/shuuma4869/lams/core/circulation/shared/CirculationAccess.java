package io.github.shuuma4869.lams.core.circulation.shared;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class CirculationAccess {
    private final AuthService identity;
    public CirculationAccess(AuthService identity) { this.identity = identity; }

    public void staff(UUID actor) {
        var user = identity.currentUser(actor);
        if (user.roles().stream().noneMatch(r -> r == RoleCode.ADMIN || r == RoleCode.LIBRARIAN)) {
            throw new AuthFailure(403, "Bạn không có quyền thực hiện giao dịch tại quầy.");
        }
    }
}
