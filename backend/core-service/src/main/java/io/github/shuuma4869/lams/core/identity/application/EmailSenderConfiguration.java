package io.github.shuuma4869.lams.core.identity.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

@Configuration
public class EmailSenderConfiguration {
    @Bean
    @ConditionalOnProperty(name = "lams.email.enabled", havingValue = "true")
    EmailVerificationSender smtpEmailVerificationSender(JavaMailSender mail,
            @Value("${lams.email.from}") String from) {
        return new SmtpEmailVerificationSender(mail, from);
    }

    @Bean
    @ConditionalOnMissingBean(EmailVerificationSender.class)
    EmailVerificationSender disabledEmailVerificationSender() {
        return (recipient, code) -> {
            throw new AuthFailure(503, "Chức năng gửi mã xác minh chưa được cấu hình.");
        };
    }
}
