package io.github.shuuma4869.lams.core.identity.api;

import io.github.shuuma4869.lams.core.identity.application.AdminAccountService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/accounts")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAccountController {
    public record StatusChange(@NotNull Integer expectedVersion, @NotBlank String status, @NotBlank String reason) {}
    public record RoleChange(@NotNull Integer expectedVersion, @NotNull Boolean grant, @NotBlank String reason) {}
    private final AdminAccountService accounts;

    public AdminAccountController(AdminAccountService accounts) { this.accounts = accounts; }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }

    @GetMapping
    public AdminAccountService.Page list(JwtAuthenticationToken token,
            @RequestParam(required = false) String query, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return accounts.list(actor(token), query, status, page, size);
    }

    @GetMapping("/{id}")
    public AdminAccountService.Account detail(JwtAuthenticationToken token, @PathVariable UUID id) {
        return accounts.detail(actor(token), id);
    }

    @GetMapping("/{id}/audit")
    public List<AdminAccountService.Audit> audit(JwtAuthenticationToken token, @PathVariable UUID id) {
        return accounts.audit(actor(token), id);
    }

    @PatchMapping("/{id}/status")
    public AdminAccountService.Account status(JwtAuthenticationToken token, @PathVariable UUID id,
            @Valid @RequestBody StatusChange body) {
        return accounts.changeStatus(actor(token), id, body.expectedVersion(), body.status(), body.reason());
    }

    @PatchMapping("/{id}/roles/{role}")
    public AdminAccountService.Account role(JwtAuthenticationToken token, @PathVariable UUID id,
            @PathVariable String role, @Valid @RequestBody RoleChange body) {
        return accounts.changeRole(actor(token), id, body.expectedVersion(), role, body.grant(), body.reason());
    }
}
