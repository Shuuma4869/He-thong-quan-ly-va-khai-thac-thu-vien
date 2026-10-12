package io.github.shuuma4869.lams.core.identity.member.api;

import io.github.shuuma4869.lams.core.identity.member.application.MemberService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MemberAdminController {
    private final MemberService members;

    public MemberAdminController(MemberService members) {
        this.members = members;
    }

    @GetMapping("/api/v1/members")
    @PreAuthorize("hasAnyRole('LIBRARIAN', 'ADMIN')")
    public MemberService.MemberPage list(@RequestParam(required = false) String query,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String size,
                                         @RequestParam(required = false) String sort) {
        return members.list(query, status, page, size, sort);
    }
}
