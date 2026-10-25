package io.github.shuuma4869.lams.core.hold.api;

import io.github.shuuma4869.lams.core.hold.application.HoldEtaService;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@PreAuthorize("isAuthenticated()")
public class HoldEtaController {
    private final HoldEtaService service;
    public HoldEtaController(HoldEtaService service) { this.service = service; }
    @GetMapping("/api/v1/holds/{id}/estimate")
    public HoldEtaService.Estimate get(JwtAuthenticationToken token, @PathVariable UUID id) {
        return service.estimate(UUID.fromString(token.getToken().getSubject()), id);
    }
}
