package io.github.shuuma4869.lams.core.catalog.edition.api;

import io.github.shuuma4869.lams.core.catalog.edition.application.EditionService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
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
@RequestMapping("/api/v1/books/{bookId}/editions")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class EditionController {
    private final EditionService editions;
    public EditionController(EditionService editions) { this.editions = editions; }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public EditionResponse create(JwtAuthenticationToken token, @PathVariable UUID bookId,
                                  @Valid @RequestBody EditionRequest request) {
        return EditionResponse.from(editions.create(actor(token), bookId, request.isbn13(), request.publisherId(),
                request.publicationYear(), request.language()));
    }
    @GetMapping
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public EditionService.EditionPage list(JwtAuthenticationToken token, @PathVariable UUID bookId,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        return editions.list(actor(token), bookId, page, size);
    }
    @GetMapping("/{editionId}")
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public EditionResponse get(JwtAuthenticationToken token, @PathVariable UUID bookId,
                               @PathVariable UUID editionId) {
        return EditionResponse.from(editions.get(actor(token), bookId, editionId));
    }
    @PatchMapping("/{editionId}")
    public EditionResponse update(JwtAuthenticationToken token, @PathVariable UUID bookId,
                                  @PathVariable UUID editionId, @Valid @RequestBody EditionRequest request) {
        return EditionResponse.from(editions.update(actor(token), bookId, editionId, request.isbn13(),
                request.publisherId(), request.publicationYear(), request.language()));
    }
    @DeleteMapping("/{editionId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID bookId, @PathVariable UUID editionId) {
        editions.delete(actor(token), bookId, editionId);
    }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }
}
