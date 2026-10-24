package io.github.shuuma4869.lams.core.circulation.loan.api;

import io.github.shuuma4869.lams.core.circulation.loan.application.LoanRenewalService;
import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/loans")
@PreAuthorize("isAuthenticated()")
public class LoanRenewalController {
    private final LoanRenewalService service;
    public LoanRenewalController(LoanRenewalService service) { this.service=service; }

    @PostMapping("/{loanId}/renew")
    public LoanCommandResult renew(JwtAuthenticationToken token, @PathVariable UUID loanId,
                                    @Valid @RequestBody VersionedRequest request) {
        return service.renew(UUID.fromString(token.getToken().getSubject()),loanId,request);
    }
}
