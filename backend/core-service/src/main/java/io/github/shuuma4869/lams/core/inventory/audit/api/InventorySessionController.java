package io.github.shuuma4869.lams.core.inventory.audit.api;

import io.github.shuuma4869.lams.core.inventory.audit.application.InventoryQueryService;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventorySessionService;
import io.github.shuuma4869.lams.core.inventory.audit.application.InventoryResolutionService;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventorySession;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryResolution;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Copy;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/inventory-sessions")
@PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
public class InventorySessionController {
    private final InventorySessionService commands;
    private final InventoryQueryService query;
    private final InventoryResolutionService resolutions;
    public InventorySessionController(InventorySessionService commands,InventoryQueryService query,
            InventoryResolutionService resolutions){this.commands=commands;this.query=query;this.resolutions=resolutions;}
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public InventorySession start(JwtAuthenticationToken token,@Valid @RequestBody InventoryRequests.Start request){return commands.start(actor(token),request);}
    @GetMapping
    public InventoryQueryService.Page<InventorySession> list(JwtAuthenticationToken token,@RequestParam(required=false) UUID branchId,
        @RequestParam(required=false) String status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return query.list(actor(token),branchId,status,page,size);}
    @GetMapping("/{id}")
    public InventorySession get(JwtAuthenticationToken token,@PathVariable UUID id){return query.get(actor(token),id);}
    @GetMapping("/{id}/snapshot")
    public InventoryQueryService.Page<Copy> snapshot(JwtAuthenticationToken token,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return query.snapshot(actor(token),id,page,size);}
    @GetMapping("/{id}/scans")
    public InventoryQueryService.Page<InventoryQueryService.ScanRow> scans(JwtAuthenticationToken token,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return query.scans(actor(token),id,page,size);}
    @PostMapping("/{id}/scans") @ResponseStatus(HttpStatus.CREATED)
    public InventorySessionService.ScanResult scan(JwtAuthenticationToken token,@PathVariable UUID id,@Valid @RequestBody InventoryRequests.Scan request){return commands.scan(actor(token),id,request);}
    @PostMapping("/{id}/finalize")
    public InventorySession finalizeSession(JwtAuthenticationToken token,@PathVariable UUID id,@Valid @RequestBody InventoryRequests.Close request){return commands.close(actor(token),id,request,false);}
    @PostMapping("/{id}/cancel")
    public InventorySession cancel(JwtAuthenticationToken token,@PathVariable UUID id,@Valid @RequestBody InventoryRequests.Close request){return commands.close(actor(token),id,request,true);}
    @GetMapping("/{id}/anomalies")
    public InventoryQueryService.Page<InventoryQueryService.AnomalyRow> anomalies(JwtAuthenticationToken token,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return query.anomalies(actor(token),id,page,size);}
    @PostMapping("/{id}/anomalies/{anomalyId}/resolution") @ResponseStatus(HttpStatus.CREATED)
    public InventoryResolution resolve(JwtAuthenticationToken token,@PathVariable UUID id,@PathVariable UUID anomalyId,
            @Valid @RequestBody InventoryResolutionRequest request){return resolutions.resolve(actor(token),id,anomalyId,request);}
    private UUID actor(JwtAuthenticationToken token){return UUID.fromString(token.getToken().getSubject());}
}
