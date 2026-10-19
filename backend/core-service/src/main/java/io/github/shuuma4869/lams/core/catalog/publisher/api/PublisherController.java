package io.github.shuuma4869.lams.core.catalog.publisher.api;

import io.github.shuuma4869.lams.core.catalog.publisher.application.PublisherService;
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
@RequestMapping("/api/v1/publishers")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class PublisherController {
    private final PublisherService publishers;
    public PublisherController(PublisherService publishers) { this.publishers = publishers; }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public PublisherResponse create(JwtAuthenticationToken token, @Valid @RequestBody PublisherRequest request) {
        return PublisherResponse.from(publishers.create(actor(token), request.name()));
    }
    @GetMapping
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public PublisherService.PublisherPage list(JwtAuthenticationToken token,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        return publishers.list(actor(token), page, size);
    }
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public PublisherResponse get(JwtAuthenticationToken token, @PathVariable UUID id) {
        return PublisherResponse.from(publishers.get(actor(token), id));
    }
    @PatchMapping("/{id}")
    public PublisherResponse update(JwtAuthenticationToken token, @PathVariable UUID id,
                                    @Valid @RequestBody PublisherRequest request) {
        return PublisherResponse.from(publishers.update(actor(token), id, request.name()));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID id) { publishers.delete(actor(token), id); }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }
}
