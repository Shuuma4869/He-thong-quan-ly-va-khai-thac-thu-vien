package io.github.shuuma4869.lams.core.identity.member;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.identity.member.application.MemberService;
import io.github.shuuma4869.lams.core.identity.member.infrastructure.MemberRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// Unit test: repository và Identity doubles; không thay suite PostgreSQL.
class MemberServiceTest {
    private final UUID actor = UUID.randomUUID();
    private final MemberRepository repository = mock(MemberRepository.class);
    private final AuthService identity = mock(AuthService.class);
    private final MemberService service = new MemberService(repository, identity);

    private void staff() {
        when(identity.currentUser(actor)).thenReturn(new AuthService.UserView(actor, "TV-1", "staff@example.test", "Staff", List.of(RoleCode.LIBRARIAN)));
    }

    @Test void profileUsesPrincipalAndDoesNotInventSupplementalFields() {
        when(repository.findProfile(actor)).thenReturn(Optional.of(new MemberRepository.IdentityProfile(actor, "TV-1", "Reader", "reader@example.test", UserStatus.ACTIVE)));
        assertThat(service.current(actor)).satisfies(profile -> {
            assertThat(profile.userId()).isEqualTo(actor);
            assertThat(profile.profile()).isNull();
        });
        verify(repository).findProfile(actor); verifyNoMoreInteractions(repository);
    }

    @Test void unknownAndLockedProfileAreDenied() {
        when(repository.findProfile(actor)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.current(actor)).isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(401));
        when(repository.findProfile(actor)).thenReturn(Optional.of(new MemberRepository.IdentityProfile(actor, "TV-1", "Reader", "reader@example.test", UserStatus.LOCKED)));
        assertThatThrownBy(() -> service.current(actor)).isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(403));
    }

    @Test void readerCannotQueryMemberRepository() {
        when(identity.currentUser(actor)).thenReturn(new AuthService.UserView(actor, "TV-1", "reader@example.test", "Reader", List.of(RoleCode.READER)));
        assertThatThrownBy(() -> service.list(actor, null, null, null, null, null)).isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(403));
        verifyNoInteractions(repository);
    }

    @ParameterizedTest @ValueSource(strings = {"0", "101", "-1", "abc"})
    void invalidSizeDoesNotReachQuery(String size) {
        staff();
        assertThatThrownBy(() -> service.list(actor, null, null, null, size, null)).isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(422));
        verifyNoInteractions(repository);
    }

    @Test void filterAndPaginationMapAllowlistedProjection() {
        staff();
        when(repository.search("Reader", UserStatus.ACTIVE, 1, 2, "fullName", false))
            .thenReturn(new MemberRepository.MemberPage(List.of(new MemberRepository.MemberRow(actor, "TV-1", "Reader", UserStatus.ACTIVE)), 3));
        var page = service.list(actor, " Reader ", "active", "1", "2", "fullName,desc");
        assertThat(page.page().totalPages()).isEqualTo(2);
        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().status()).isEqualTo("ACTIVE");
    }
}
