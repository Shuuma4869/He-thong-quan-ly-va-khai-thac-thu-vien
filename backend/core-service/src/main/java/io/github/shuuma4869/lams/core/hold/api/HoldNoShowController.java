package io.github.shuuma4869.lams.core.hold.api;

import io.github.shuuma4869.lams.core.hold.application.HoldNoShowService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@PreAuthorize("isAuthenticated()")
public class HoldNoShowController {
    public record DecisionRequest(@NotNull Integer expectedVersion, @NotBlank String decision,
                                  @NotBlank @Size(min = 10, max = 1000) String reason) {}
    private final HoldNoShowService service;
    public HoldNoShowController(HoldNoShowService service) { this.service = service; }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }

    @GetMapping("/me/hold-reliability")
    public HoldNoShowService.Summary mine(JwtAuthenticationToken token) { return service.mine(actor(token)); }

    @GetMapping("/staff/readers/{readerId}/hold-reliability")
    @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public HoldNoShowService.Summary forStaff(JwtAuthenticationToken token, @PathVariable UUID readerId) {
        return service.forStaff(actor(token), readerId);
    }

    @PatchMapping("/admin/holds/{holdId}/no-show")
    @PreAuthorize("hasRole('ADMIN')")
    public HoldNoShowService.Summary decide(JwtAuthenticationToken token, @PathVariable UUID holdId,
            @Valid @RequestBody DecisionRequest request) {
        return service.decide(actor(token), holdId, request.expectedVersion(), request.decision(), request.reason());
    }
}
