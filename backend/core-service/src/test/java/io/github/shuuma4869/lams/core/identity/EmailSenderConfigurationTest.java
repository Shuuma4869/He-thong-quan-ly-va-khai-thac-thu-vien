package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.EmailSenderConfiguration;
import io.github.shuuma4869.lams.core.identity.application.EmailVerificationSender;
import io.github.shuuma4869.lams.core.identity.application.SmtpEmailVerificationSender;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;

class EmailSenderConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(EmailSenderConfiguration.class)
            .withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
            .withPropertyValues("lams.email.from=no-reply@lams.local");

    @Test void smtpIsDisabledByDefault() {
        runner.run(context -> {
            assertThat(context).hasSingleBean(EmailVerificationSender.class);
            assertThatThrownBy(() -> context.getBean(EmailVerificationSender.class)
                    .send("user@example.test", "ABCDEFGHJKLM"))
                    .isInstanceOf(AuthFailure.class).hasMessageContaining("chưa được cấu hình");
        });
    }

    @Test void configuredSmtpReplacesDisabledSender() {
        runner.withPropertyValues("lams.email.enabled=true").run(context -> {
            assertThat(context).hasSingleBean(EmailVerificationSender.class);
            assertThat(context.getBean(EmailVerificationSender.class))
                    .isInstanceOf(SmtpEmailVerificationSender.class);
        });
    }
}
