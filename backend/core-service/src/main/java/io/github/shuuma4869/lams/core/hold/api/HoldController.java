package io.github.shuuma4869.lams.core.hold.api;

import io.github.shuuma4869.lams.core.circulation.shared.VersionedRequest;
import io.github.shuuma4869.lams.core.hold.application.HoldQueries;
import io.github.shuuma4869.lams.core.hold.application.HoldService;
import io.github.shuuma4869.lams.core.hold.domain.Hold;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@PreAuthorize("isAuthenticated()")
public class HoldController {
    private final HoldService service;
    private final HoldQueries queries;
    public HoldController(HoldService service,HoldQueries queries) {this.service=service;this.queries=queries;}
    @PostMapping("/holds") @ResponseStatus(HttpStatus.CREATED)
    public Hold create(JwtAuthenticationToken token,@Valid @RequestBody HoldRequest request) {return service.create(actor(token),request);}
    @PostMapping("/holds/{id}/cancel")
    public Hold cancel(JwtAuthenticationToken token,@PathVariable UUID id,@Valid @RequestBody VersionedRequest request) {
        return service.cancel(actor(token),id,request);
    }
    @GetMapping("/holds/{id}")
    public HoldQueries.HoldView get(JwtAuthenticationToken token,@PathVariable UUID id) {return queries.get(actor(token),id);}
    @GetMapping("/me/holds")
    public HoldQueries.HoldPage mine(JwtAuthenticationToken token,@RequestParam(required=false) String page,@RequestParam(required=false) String size) {
        return queries.mine(actor(token),page,size);
    }
    @GetMapping("/holds/queue") @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public HoldQueries.HoldPage queue(JwtAuthenticationToken token,@RequestParam UUID bookId,@RequestParam UUID branchId,
                                     @RequestParam(required=false) String page,@RequestParam(required=false) String size) {
        return queries.queue(actor(token),bookId,branchId,page,size);
    }
    @GetMapping("/staff/holds") @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public HoldQueries.StaffHoldPage staffList(JwtAuthenticationToken token,
            @RequestParam(required=false) String status,@RequestParam(required=false) String reader,
            @RequestParam(required=false) String book,@RequestParam(required=false) UUID branchId,
            @RequestParam(required=false) String from,@RequestParam(required=false) String to,
            @RequestParam(required=false) String expiresBefore,@RequestParam(required=false) String page,
            @RequestParam(required=false) String size) {
        return queries.staffList(actor(token),status,reader,book,branchId,from,to,expiresBefore,page,size);
    }
    @GetMapping("/staff/holds/summary") @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public HoldQueries.StaffHoldSummary staffSummary(JwtAuthenticationToken token) {
        return queries.staffSummary(actor(token));
    }
    @GetMapping("/staff/holds/{id}") @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
    public HoldQueries.StaffHoldDetail staffGet(JwtAuthenticationToken token,@PathVariable UUID id) {
        return queries.staffGet(actor(token),id);
    }
    @GetMapping("/holds/pickup-branches")
    public HoldQueries.PickupBranches branches(JwtAuthenticationToken token,@RequestParam(required=false) String page,@RequestParam(required=false) String size) {
        return queries.branches(actor(token),page,size);
    }
    private static UUID actor(JwtAuthenticationToken token) {return UUID.fromString(token.getToken().getSubject());}
}
