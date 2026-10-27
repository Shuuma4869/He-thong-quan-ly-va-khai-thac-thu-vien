package io.github.shuuma4869.lams.core.acquisition;

import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports/acquisition-facts")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class AcquisitionFactsController {
    private final AcquisitionFactsService facts;

    public AcquisitionFactsController(AcquisitionFactsService facts) { this.facts = facts; }

    @GetMapping
    public ResponseEntity<AcquisitionFactsService.Snapshot> get(JwtAuthenticationToken token,
            @RequestParam UUID bookId, @RequestParam UUID branchId,
            @RequestParam String from, @RequestParam String to) {
        var snapshot = facts.load(UUID.fromString(token.getToken().getSubject()), bookId, branchId, from, to);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(snapshot);
    }
}
