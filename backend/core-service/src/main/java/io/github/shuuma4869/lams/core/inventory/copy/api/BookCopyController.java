package io.github.shuuma4869.lams.core.inventory.copy.api;

import io.github.shuuma4869.lams.core.inventory.copy.application.BookCopyService;
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

    public BookCopyController(BookCopyService copies) {
        this.copies = copies;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookCopyResponse create(JwtAuthenticationToken token, @Valid @RequestBody BookCopyRequest request) {
        return BookCopyResponse.from(copies.create(actorId(token), request.editionId(), request.barcode(),
                request.shelfId()));
    }

    @GetMapping
    public BookCopyService.CopyPage list(JwtAuthenticationToken token,
                                         @RequestParam(required = false) UUID editionId,
                                         @RequestParam(required = false) UUID shelfId,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String size) {
        return copies.list(actorId(token), editionId, shelfId, status, page, size);
    }

    @GetMapping("/{copyId}")
    public BookCopyResponse get(JwtAuthenticationToken token, @PathVariable UUID copyId) {
        return BookCopyResponse.from(copies.get(actorId(token), copyId));
    }

    @PatchMapping("/{copyId}")
    public BookCopyResponse update(JwtAuthenticationToken token, @PathVariable UUID copyId,
                                  @Valid @RequestBody BookCopyRequest request) {
        return BookCopyResponse.from(copies.update(actorId(token), copyId, request.editionId(), request.barcode(),
                request.shelfId(), request.version()));
    }

    private static UUID actorId(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
