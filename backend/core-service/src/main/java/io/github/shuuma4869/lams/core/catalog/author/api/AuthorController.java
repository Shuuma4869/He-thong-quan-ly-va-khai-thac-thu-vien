package io.github.shuuma4869.lams.core.catalog.author.api;

import io.github.shuuma4869.lams.core.catalog.author.application.AuthorService;
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
@RequestMapping("/api/v1/authors")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class AuthorController {
    private final AuthorService authors;

    public AuthorController(AuthorService authors) {
        this.authors = authors;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AuthorResponse create(JwtAuthenticationToken token, @Valid @RequestBody AuthorRequest request) {
        return AuthorResponse.from(authors.create(actorId(token), request.name()));
    }

    @GetMapping
    public AuthorService.AuthorPage list(JwtAuthenticationToken token,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String size) {
        return authors.list(actorId(token), page, size);
    }

    @GetMapping("/{authorId}")
    public AuthorResponse get(JwtAuthenticationToken token, @PathVariable UUID authorId) {
        return AuthorResponse.from(authors.get(actorId(token), authorId));
    }

    @PatchMapping("/{authorId}")
    public AuthorResponse update(JwtAuthenticationToken token, @PathVariable UUID authorId,
                                 @Valid @RequestBody AuthorRequest request) {
        return AuthorResponse.from(authors.update(actorId(token), authorId, request.name()));
    }

    @DeleteMapping("/{authorId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID authorId) {
        authors.delete(actorId(token), authorId);
    }

    private static UUID actorId(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
