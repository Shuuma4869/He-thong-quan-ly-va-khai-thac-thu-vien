package io.github.shuuma4869.lams.core.catalog.media;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalog-media/{kind}/{subject}")
@PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
public class MediaController {
    public record MediaEnvelope(MediaReference media) {}
    private final MediaService media;
    public MediaController(MediaService media) { this.media=media; }
    @GetMapping
    @PreAuthorize("hasAnyRole('READER','LIBRARIAN','ADMIN')")
    public MediaEnvelope get(JwtAuthenticationToken token,@PathVariable String kind,@PathVariable UUID subject) {
        return new MediaEnvelope(media.get(UUID.fromString(token.getName()),kind,subject));
    }
    @PostMapping
    public MediaReference approve(JwtAuthenticationToken token,@PathVariable String kind,@PathVariable UUID subject,@Valid @RequestBody MediaRequest request) {
        return media.approve(UUID.fromString(token.getName()),kind,subject,request);
    }
    @DeleteMapping @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(JwtAuthenticationToken token,@PathVariable String kind,@PathVariable UUID subject,@RequestParam(required=false) Long version) {
        media.remove(UUID.fromString(token.getName()),kind,subject,version);
    }
}
