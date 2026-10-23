package io.github.shuuma4869.lams.core.catalog.favorite.api;

import io.github.shuuma4869.lams.core.catalog.favorite.application.FavoriteService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/favorites")
@PreAuthorize("isAuthenticated()")
public class FavoriteController {
    private final FavoriteService favorites;

    public FavoriteController(FavoriteService favorites) {
        this.favorites = favorites;
    }

    @GetMapping
    public FavoriteService.FavoritePage list(JwtAuthenticationToken token,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String sort) {
        return favorites.list(actor(token), page, size, sort);
    }

    @PutMapping("/{bookId}")
    public ResponseEntity<FavoriteResponse> add(JwtAuthenticationToken token,
                                                @PathVariable("bookId") String bookIdValue) {
        UUID bookId = uuid("bookId", bookIdValue);
        var result = favorites.add(actor(token), bookId);
        var response = FavoriteResponse.from(result.favorite());
        var location = URI.create("/api/v1/me/favorites/" + bookId);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .location(location).body(response);
    }

    @GetMapping("/{bookId}")
    public FavoriteService.FavoriteState state(JwtAuthenticationToken token, @PathVariable("bookId") String bookId) {
        return favorites.state(actor(token), uuid("bookId", bookId));
    }

    @DeleteMapping("/{bookId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(JwtAuthenticationToken token, @PathVariable("bookId") String bookIdValue) {
        favorites.remove(actor(token), uuid("bookId", bookIdValue));
    }

    private static UUID uuid(String field, String value) {
        try {
            UUID parsed = UUID.fromString(value);
            if (!parsed.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return parsed;
        } catch (IllegalArgumentException error) {
            throw new AuthFailure(400, field + " phải là UUID hợp lệ.");
        }
    }

    private static UUID actor(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
