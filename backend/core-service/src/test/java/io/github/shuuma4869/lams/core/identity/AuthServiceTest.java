package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.IdentityUser;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import io.github.shuuma4869.lams.core.identity.domain.UserStatus;
import io.github.shuuma4869.lams.core.identity.infrastructure.IdentityRepository;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.transaction.support.TransactionTemplate;

class AuthServiceTest {
    private final IdentityRepository repository = mock(IdentityRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JwtEncoder jwt = mock(JwtEncoder.class);
    private final TransactionTemplate transactions = mock(TransactionTemplate.class);
    private final AuthService service = new AuthService(repository, passwords, jwt, transactions,
        Duration.ofMinutes(15), Duration.ofDays(1), Duration.ofDays(30));

    @Test void registrationNormalizesIdentityAndAssignsOnlyReader() {
        when(passwords.encode("test-password")).thenReturn("hashed");
        when(jwt.encode(any())).thenReturn(Jwt.withTokenValue("test-token").header("alg", "HS256").claim("sub", "test").build());
        var session = service.register(" Reader ", " Reader@Example.test ", "test-password");
        var user = ArgumentCaptor.forClass(IdentityUser.class);
        verify(repository).createUser(user.capture());
        assertThat(user.getValue().email()).isEqualTo("reader@example.test");
        assertThat(user.getValue().passwordHash()).isEqualTo("hashed");
        assertThat(session.user().roles()).containsExactly(RoleCode.READER);
        assertThat(session.user().fullName()).isEqualTo("Reader");
        assertThat(session.refreshToken()).isNotBlank();
    }

    @Test void duplicateRegistrationDoesNotIssueSession() {
        doThrow(new DataIntegrityViolationException("duplicate")).when(repository).createUser(any());
        assertThatThrownBy(() -> service.register("Reader", "reader@example.test", "password"))
            .isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(409));
        verifyNoInteractions(jwt);
    }

    @Test void unknownPasswordMismatchAndLockedUserAreDenied() {
        when(repository.findByIdentifier("reader")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.login(" reader ", "password", false)).isInstanceOf(AuthFailure.class);
        var user = new IdentityUser(UUID.randomUUID(), "TV-1", "reader@example.test", "Reader", "hash", UserStatus.ACTIVE, List.of(RoleCode.READER));
        when(repository.findByIdentifier("reader")).thenReturn(Optional.of(user));
        when(passwords.matches("password", "hash")).thenReturn(false);
        assertThatThrownBy(() -> service.login("reader", "password", false)).isInstanceOf(AuthFailure.class);
        when(passwords.matches("password", "hash")).thenReturn(true);
        when(repository.findByIdentifier("reader")).thenReturn(Optional.of(new IdentityUser(user.id(), user.memberCode(), user.email(), user.fullName(), user.passwordHash(), UserStatus.LOCKED, user.roles())));
        assertThatThrownBy(() -> service.login("reader", "password", false)).isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(401));
        verifyNoInteractions(jwt);
    }

    @Test void blankRefreshIsDeniedAndBlankLogoutDoesNotOpenTransaction() {
        assertThatThrownBy(() -> service.refresh(" ")).isInstanceOf(AuthFailure.class);
        service.logout(null); service.logout(" ");
        verifyNoInteractions(transactions, repository);
    }
}
