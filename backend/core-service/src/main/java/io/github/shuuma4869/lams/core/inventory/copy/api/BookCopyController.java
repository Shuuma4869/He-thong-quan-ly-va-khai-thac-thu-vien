package io.github.shuuma4869.lams.core.inventory.copy.api;

import io.github.shuuma4869.lams.core.inventory.copy.application.BookCopyService;
import io.github.shuuma4869.lams.core.inventory.copy.application.CopyStateService;
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
@RequestMapping("/api/v1/copies")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class BookCopyController {
    private final BookCopyService copies;
    private final CopyStateService states;

    public BookCopyController(BookCopyService copies, CopyStateService states) {
        this.copies = copies;
        this.states = states;
    }

    public record StateRequest(@jakarta.validation.constraints.NotNull UUID requestId,
                               @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.PositiveOrZero
                               @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = io.github.shuuma4869.lams.core.circulation.shared.VersionDeserializer.class) Long version,
                               @jakarta.validation.constraints.NotBlank String status,
                               @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max = 500) String reason) {}

    @PostMapping("/{copyId}/state")
    public BookCopyResponse state(JwtAuthenticationToken token, @PathVariable UUID copyId,
                                  @Valid @RequestBody StateRequest request) {
        return BookCopyResponse.from(states.change(actorId(token), copyId, request.requestId(), request.version(),
                request.status(), request.reason()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookCopyResponse create(JwtAuthenticationToken token, @Valid @RequestBody BookCopyRequest request) {
        return BookCopyResponse.from(copies.create(actorId(token), request.editionId(), request.barcode(),
                request.shelfId()));
    }

    @GetMapping
    public BookCopyService.CopyPage list(JwtAuthenticationToken token,
                                         @RequestParam(required = false) UUID branchId,
                                         @RequestParam(required = false) UUID editionId,
                                         @RequestParam(required = false) UUID shelfId,
                                         @RequestParam(required = false) String barcode,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String size) {
        return copies.list(actorId(token), branchId, editionId, shelfId, barcode, status, page, size);
    }

    @GetMapping("/{copyId}")
    public BookCopyResponse get(JwtAuthenticationToken token, @PathVariable UUID copyId) {
        return BookCopyResponse.from(copies.get(actorId(token), copyId));
    }
    @GetMapping("/by-barcode")
    public BookCopyResponse byBarcode(JwtAuthenticationToken token,@RequestParam String barcode) {
        return BookCopyResponse.from(copies.byBarcode(actorId(token),barcode));
    }

    @PatchMapping("/{copyId}")
    public BookCopyResponse update(JwtAuthenticationToken token, @PathVariable UUID copyId,
                                  @Valid @RequestBody BookCopyUpdateRequest request) {
        return BookCopyResponse.from(copies.update(actorId(token), copyId, request.editionId(), request.barcode(),
                request.shelfId(), request.version()));
    }

    private static UUID actorId(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
