package io.github.shuuma4869.lams.core.catalog.category.api;

import io.github.shuuma4869.lams.core.catalog.category.application.CategoryAliasService;
import io.github.shuuma4869.lams.core.catalog.category.domain.CategoryAlias;
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
@RequestMapping("/api/v1/category-aliases")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class CategoryAliasController {
    private final CategoryAliasService aliases;

    public CategoryAliasController(CategoryAliasService aliases) { this.aliases = aliases; }

    @GetMapping
    public CategoryAliasService.AliasPage list(JwtAuthenticationToken token,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        return aliases.list(actor(token), categoryId, page, size);
    }

    @GetMapping("/{id}")
    public CategoryAlias get(JwtAuthenticationToken token, @PathVariable UUID id) {
        return aliases.get(actor(token), id);
    }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public CategoryAlias create(JwtAuthenticationToken token, @Valid @RequestBody CategoryAliasRequest request) {
        return aliases.create(actor(token), request.categoryId(), request.name());
    }

    @PatchMapping("/{id}")
    public CategoryAlias update(JwtAuthenticationToken token, @PathVariable UUID id,
            @Valid @RequestBody CategoryAliasRequest request) {
        return aliases.update(actor(token), id, request.categoryId(), request.name());
    }

    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID id) {
        aliases.delete(actor(token), id);
    }

    private static UUID actor(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
