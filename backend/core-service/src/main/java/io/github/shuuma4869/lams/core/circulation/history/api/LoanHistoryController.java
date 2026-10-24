package io.github.shuuma4869.lams.core.circulation.history.api;

import io.github.shuuma4869.lams.core.circulation.history.application.LoanHistoryFilter;
import io.github.shuuma4869.lams.core.circulation.history.application.LoanHistoryService;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@PreAuthorize("isAuthenticated()")
public class LoanHistoryController {
    private final LoanHistoryService service;
    public LoanHistoryController(LoanHistoryService service) {this.service=service;}

    @GetMapping("/me/loans")
    public LoanHistoryResponse.Page mine(JwtAuthenticationToken token,@RequestParam(required=false) String status,
            @RequestParam(required=false) String from,@RequestParam(required=false) String to,
            @RequestParam(required=false) String sort,@RequestParam(required=false) String page,@RequestParam(required=false) String size) {
        UUID actor=actor(token);
        return service.mine(actor,LoanHistoryFilter.parse(actor,null,null,status,from,to,sort,page,size));
    }
    @GetMapping("/loans") @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public LoanHistoryResponse.Page staff(JwtAuthenticationToken token,@RequestParam(required=false) UUID readerId,
            @RequestParam(required=false) UUID branchId,@RequestParam(required=false) UUID copyId,
            @RequestParam(required=false) String status,@RequestParam(required=false) String from,@RequestParam(required=false) String to,
            @RequestParam(required=false) String sort,@RequestParam(required=false) String page,@RequestParam(required=false) String size) {
        return service.staff(actor(token),LoanHistoryFilter.parse(readerId,branchId,copyId,status,from,to,sort,page,size));
    }
    @GetMapping("/loans/{id}")
    public LoanHistoryResponse get(JwtAuthenticationToken token,@PathVariable UUID id) {return service.get(actor(token),id);}
    private UUID actor(JwtAuthenticationToken token) {return UUID.fromString(token.getToken().getSubject());}
}
