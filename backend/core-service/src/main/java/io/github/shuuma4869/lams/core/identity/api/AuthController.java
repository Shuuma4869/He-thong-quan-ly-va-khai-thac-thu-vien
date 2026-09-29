package io.github.shuuma4869.lams.core.identity.api;

import io.github.shuuma4869.lams.core.identity.application.AuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    public record RegisterRequest(@NotBlank @Size(max = 150) String fullName,
                                  @NotBlank @Email @Size(max = 320) String email,
                                  @NotBlank @Size(min = 8, max = 128) String password) {}
    public record LoginRequest(@NotBlank @Size(max = 320) String identifier,
                               @NotBlank @Size(max = 128) String password, boolean remember) {}
    public record SessionResponse(String accessToken, Instant accessTokenExpiresAt, AuthService.UserView user) {}

    private final AuthService auth;
    private final boolean cookieSecure;

    public AuthController(AuthService auth, @Value("${lams.auth.cookie-secure}") boolean cookieSecure) {
        this.auth = auth;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/register")
    public ResponseEntity<SessionResponse> register(@Valid @RequestBody RegisterRequest body) {
        return session(auth.register(body.fullName(), body.email(), body.password()), HttpStatus.CREATED);
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest body) {
        return session(auth.login(body.identifier(), body.password(), body.remember()), HttpStatus.OK);
    }

    @PostMapping("/refresh")
    public ResponseEntity<SessionResponse> refresh(@CookieValue(name = "lams_refresh", required = false) String token) {
        return session(auth.refresh(token), HttpStatus.OK);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = "lams_refresh", required = false) String token) {
        auth.logout(token);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO, true)).build();
    }

    @GetMapping("/me")
    public AuthService.UserView me(JwtAuthenticationToken token) {
        return auth.currentUser(java.util.UUID.fromString(token.getToken().getSubject()));
    }

    private ResponseEntity<SessionResponse> session(AuthService.Session issued, HttpStatus status) {
        Duration maxAge = issued.remember() ? Duration.between(Instant.now(), issued.refreshTokenExpiresAt()) : null;
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie(issued.refreshToken(), maxAge, false))
                .body(new SessionResponse(issued.accessToken(), issued.accessTokenExpiresAt(), issued.user()));
    }

    private String cookie(String value, Duration maxAge, boolean clear) {
        var builder = ResponseCookie.from("lams_refresh", value).httpOnly(true).secure(cookieSecure)
                .sameSite("Lax").path("/api/v1/auth");
        if (clear) builder.maxAge(Duration.ZERO);
        else if (maxAge != null) builder.maxAge(maxAge);
        return builder.build().toString();
    }
}
