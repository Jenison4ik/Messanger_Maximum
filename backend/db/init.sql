CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    last_seen    TIMESTAMPTZ,
    avatar_key   TEXT,
    username     TEXT NOT NULL UNIQUE,
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
    id         BIGSERIAL PRIMARY KEY,
    owner_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type       TEXT NOT NULL DEFAULT 'dialog',
    title      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    chat_id  BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text      TEXT NOT NULL,
    time      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_time
    ON messages (chat_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id
    ON messages (chat_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_participants (
    chat_id        BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    participant_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL DEFAULT 'member',
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status         TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (chat_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON chat_participants (participant_id);

CREATE TABLE IF NOT EXISTS attachments (
    id          BIGSERIAL PRIMARY KEY,
    message_id  BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size        BIGINT NOT NULL CHECK (size >= 0),
    metadata    JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_attachments_message
    ON attachments (message_id);