CREATE TABLE user_ui_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    preferences JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
