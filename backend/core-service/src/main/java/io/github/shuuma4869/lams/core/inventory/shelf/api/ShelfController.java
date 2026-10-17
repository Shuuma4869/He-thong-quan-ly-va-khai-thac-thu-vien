package io.github.shuuma4869.lams.core.inventory.shelf.api;

import io.github.shuuma4869.lams.core.inventory.shelf.application.ShelfService;
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
@RequestMapping("/api/v1/shelves")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class ShelfController {
    private final ShelfService shelves;

    public ShelfController(ShelfService shelves) {
        this.shelves = shelves;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ShelfResponse create(JwtAuthenticationToken token, @Valid @RequestBody ShelfRequest request) {
        return ShelfResponse.from(shelves.create(actorId(token), request.branchId(), request.code(),
                request.label(), request.sortOrder()));
    }

    @GetMapping
    public ShelfService.ShelfPage list(JwtAuthenticationToken token,
                                       @RequestParam(required = false) UUID branchId,
                                       @RequestParam(required = false) String page,
                                       @RequestParam(required = false) String size) {
        return shelves.list(actorId(token), branchId, page, size);
    }

    @GetMapping("/{shelfId}")
    public ShelfResponse get(JwtAuthenticationToken token, @PathVariable UUID shelfId) {
        return ShelfResponse.from(shelves.get(actorId(token), shelfId));
    }

    @PatchMapping("/{shelfId}")
    public ShelfResponse update(JwtAuthenticationToken token, @PathVariable UUID shelfId,
                                @Valid @RequestBody ShelfRequest request) {
        return ShelfResponse.from(shelves.update(actorId(token), shelfId, request.branchId(), request.code(),
                request.label(), request.sortOrder()));
    }

    private static UUID actorId(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
