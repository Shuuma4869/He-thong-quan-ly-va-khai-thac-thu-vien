package io.github.shuuma4869.lams.core.identity.member.api;

import io.github.shuuma4869.lams.core.identity.member.application.MemberService;
import java.util.UUID;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CurrentMemberController {
    private final MemberService members;

    public CurrentMemberController(MemberService members) {
        this.members = members;
    }

    @GetMapping("/api/v1/me/profile")
    public MemberService.CurrentProfile current(JwtAuthenticationToken token) {
        return members.current(UUID.fromString(token.getToken().getSubject()));
    }
}
