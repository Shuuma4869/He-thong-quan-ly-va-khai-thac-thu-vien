package io.github.shuuma4869.lams.core.catalog.category.api;

import io.github.shuuma4869.lams.core.catalog.category.application.CategoryService;
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
@RequestMapping("/api/v1/categories")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class CategoryController {
    private final CategoryService categories;
    public CategoryController(CategoryService categories) { this.categories = categories; }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse create(JwtAuthenticationToken token, @Valid @RequestBody CategoryRequest request) {
        return CategoryResponse.from(categories.create(actor(token), request.name()));
    }
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public CategoryService.CategoryPage list(JwtAuthenticationToken token,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        return categories.list(actor(token), page, size);
    }
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public CategoryResponse get(JwtAuthenticationToken token, @PathVariable UUID id) {
        return CategoryResponse.from(categories.get(actor(token), id));
    }
    @PatchMapping("/{id}")
    public CategoryResponse update(JwtAuthenticationToken token, @PathVariable UUID id,
                                   @Valid @RequestBody CategoryRequest request) {
        return CategoryResponse.from(categories.update(actor(token), id, request.name()));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID id) { categories.delete(actor(token), id); }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }
}
