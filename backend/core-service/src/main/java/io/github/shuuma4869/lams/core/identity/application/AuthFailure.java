package io.github.shuuma4869.lams.core.identity.application;

public class AuthFailure extends RuntimeException {
    private final int status;

    public AuthFailure(int status, String message) { super(message); this.status = status; }

    public int status() { return status; }
}
