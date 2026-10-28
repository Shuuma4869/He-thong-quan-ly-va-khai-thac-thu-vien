package io.github.shuuma4869.lams.core.identity.api;

import io.github.shuuma4869.lams.core.identity.application.AccountCenterService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/account")
public class AccountCenterController {
    public record ProfileUpdate(@NotBlank @Size(max = 150) String fullName, String phone) {}
    public record PasswordChange(@NotBlank String currentPassword, @NotBlank String newPassword) {}
    public record EmailRequest(@NotBlank String currentPassword, @NotBlank @Email String email) {}
    public record EmailConfirm(@NotBlank String code) {}
    private final AccountCenterService accounts;
    public AccountCenterController(AccountCenterService accounts) { this.accounts = accounts; }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }

    @GetMapping
    public AccountCenterService.Account current(JwtAuthenticationToken token) { return accounts.current(actor(token)); }
    @PatchMapping
    public AccountCenterService.Account update(JwtAuthenticationToken token, @Valid @RequestBody ProfileUpdate body) {
        return accounts.update(actor(token), body.fullName(), body.phone());
    }
    @PostMapping("/password")
    public ResponseEntity<Void> password(JwtAuthenticationToken token, @Valid @RequestBody PasswordChange body) {
        accounts.changePassword(actor(token), body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/email-request")
    public AccountCenterService.Account email(JwtAuthenticationToken token, @Valid @RequestBody EmailRequest body) {
        return accounts.requestEmail(actor(token), body.currentPassword(), body.email());
    }
    @DeleteMapping("/email-request")
    public ResponseEntity<Void> cancelEmail(JwtAuthenticationToken token) {
        accounts.cancelEmail(actor(token));
        return ResponseEntity.noContent().build();
    }
    @PostMapping("/email-confirm")
    public ResponseEntity<Void> confirmEmail(JwtAuthenticationToken token, @Valid @RequestBody EmailConfirm body) {
        accounts.confirmEmail(actor(token), body.code());
        return ResponseEntity.noContent().build();
    }
}
