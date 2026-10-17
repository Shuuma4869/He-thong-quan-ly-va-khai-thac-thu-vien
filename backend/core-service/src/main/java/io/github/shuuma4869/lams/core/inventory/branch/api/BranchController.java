package io.github.shuuma4869.lams.core.inventory.branch.api;

import io.github.shuuma4869.lams.core.inventory.branch.application.BranchService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/branches")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class BranchController {
    private final BranchService branches;

    public BranchController(BranchService branches) {
        this.branches = branches;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BranchResponse create(JwtAuthenticationToken token, @Valid @RequestBody BranchRequest request) {
        return BranchResponse.from(branches.create(actorId(token), request.code(), request.name(), request.status()));
    }

    @GetMapping
    public BranchService.BranchPage list(JwtAuthenticationToken token,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String size) {
        return branches.list(actorId(token), page, size);
    }

    @GetMapping("/{branchId}")
    public BranchResponse get(JwtAuthenticationToken token, @PathVariable UUID branchId) {
        return BranchResponse.from(branches.get(actorId(token), branchId));
    }

    @PatchMapping("/{branchId}")
    public BranchResponse update(JwtAuthenticationToken token, @PathVariable UUID branchId,
                                 @Valid @RequestBody BranchRequest request) {
        return BranchResponse.from(branches.update(actorId(token), branchId,
                request.code(), request.name(), request.status()));
    }

    private static UUID actorId(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
