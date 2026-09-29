CREATE TABLE users (
    id UUID PRIMARY KEY,
    member_code VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL,
    email_normalized VARCHAR(320) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE roles (
    code VARCHAR(20) PRIMARY KEY CHECK (code IN ('READER', 'LIBRARIAN', 'ADMIN'))
);

INSERT INTO roles (code) VALUES ('READER'), ('LIBRARIAN'), ('ADMIN');

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_code VARCHAR(20) NOT NULL REFERENCES roles(code),
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID REFERENCES refresh_tokens(id),
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_refresh_expiry CHECK (expires_at > created_at)
);

CREATE INDEX ix_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens(user_id);
