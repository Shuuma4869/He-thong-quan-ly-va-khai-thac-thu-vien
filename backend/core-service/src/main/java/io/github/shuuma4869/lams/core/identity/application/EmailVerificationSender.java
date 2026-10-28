package io.github.shuuma4869.lams.core.identity.application;

public interface EmailVerificationSender {
    void send(String recipient, String code);
}
