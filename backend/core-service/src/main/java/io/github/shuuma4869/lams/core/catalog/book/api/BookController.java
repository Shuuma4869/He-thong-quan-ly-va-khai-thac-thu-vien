package io.github.shuuma4869.lams.core.catalog.book.api;

import io.github.shuuma4869.lams.core.catalog.book.application.BookService;
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
@RequestMapping("/api/v1/books")
@PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
public class BookController {
    private final BookService books;
    public BookController(BookService books) { this.books = books; }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public BookResponse create(JwtAuthenticationToken token, @Valid @RequestBody BookRequest request) {
        return BookResponse.from(books.create(actor(token), request.title(), request.description(),
                request.authorIds(), request.categoryIds()));
    }
    @GetMapping
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public BookService.BookPage list(JwtAuthenticationToken token, @RequestParam(required = false) String page,
                                     @RequestParam(required = false) String size,
                                     @RequestParam(required = false) String query,
                                     @RequestParam(required = false) String authorId,
                                     @RequestParam(required = false) String categoryId) {
        return books.list(actor(token), page, size, query, authorId, categoryId);
    }
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('READER', 'LIBRARIAN', 'ADMIN')")
    public BookResponse get(JwtAuthenticationToken token, @PathVariable UUID id) {
        return BookResponse.from(books.get(actor(token), id));
    }
    @PatchMapping("/{id}")
    public BookResponse update(JwtAuthenticationToken token, @PathVariable UUID id,
                               @Valid @RequestBody BookRequest request) {
        return BookResponse.from(books.update(actor(token), id, request.title(), request.description(),
                request.authorIds(), request.categoryIds()));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(JwtAuthenticationToken token, @PathVariable UUID id) { books.delete(actor(token), id); }
    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }
}
