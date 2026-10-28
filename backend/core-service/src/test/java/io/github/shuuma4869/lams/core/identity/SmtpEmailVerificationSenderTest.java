package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.SmtpEmailVerificationSender;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class SmtpEmailVerificationSenderTest {
    @Test void sendsOnlyTheCodeToTheSelectedAddress() {
        JavaMailSender mail = mock(JavaMailSender.class);
        new SmtpEmailVerificationSender(mail, "no-reply@lams.local").send("new@example.test", "ABCDEFGHJKLM");
        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly("new@example.test");
        assertThat(message.getValue().getFrom()).isEqualTo("no-reply@lams.local");
        assertThat(message.getValue().getText()).contains("ABCDEFGHJKLM", "15 phút");
    }

    @Test void smtpFailureHasNoTechnicalDetailsInResponse() {
        JavaMailSender mail = mock(JavaMailSender.class);
        doThrow(new MailSendException("private server detail")).when(mail).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
        assertThatThrownBy(() -> new SmtpEmailVerificationSender(mail, "no-reply@lams.local")
                .send("new@example.test", "ABCDEFGHJKLM"))
                .isInstanceOf(AuthFailure.class).hasMessageNotContaining("private server detail");
    }
}
