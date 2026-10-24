package io.github.shuuma4869.lams.core.circulation.loan.api;

import io.github.shuuma4869.lams.core.circulation.loan.application.LoanCommandService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/loans")
@PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
public class LoanCommandController {
    private final LoanCommandService commands;
    public LoanCommandController(LoanCommandService commands) { this.commands = commands; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LoanCommandResult borrow(JwtAuthenticationToken token, @Valid @RequestBody BorrowRequest request) {
        return commands.borrow(UUID.fromString(token.getToken().getSubject()), request);
    }

    @PostMapping("/{loanId}/return")
    public LoanCommandResult returnLoan(JwtAuthenticationToken token, @PathVariable UUID loanId,
                                        @Valid @RequestBody ReturnRequest request) {
        return commands.returnLoan(UUID.fromString(token.getToken().getSubject()), loanId, request);
    }
}
