package io.github.shuuma4869.lams.core.identity.application;

import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

public class SmtpEmailVerificationSender implements EmailVerificationSender {
    private final JavaMailSender mail;
    private final String from;

    public SmtpEmailVerificationSender(JavaMailSender mail,
            @org.springframework.beans.factory.annotation.Value("${lams.email.from}") String from) {
        this.mail = mail;
        this.from = from;
    }

    @Override
    public void send(String recipient, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject("Mã xác minh email LAMS");
        message.setText("Mã xác minh đổi email của bạn: " + code
                + "\nMã có hiệu lực 15 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.");
        try {
            mail.send(message);
        } catch (MailException error) {
            throw new AuthFailure(503, "Chưa gửi được mã xác minh. Vui lòng thử lại sau.");
        }
    }
}
