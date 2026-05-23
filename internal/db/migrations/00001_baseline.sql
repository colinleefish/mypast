-- +goose Up
CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY,
    session_key text NOT NULL,
    scope_key text,
    title text,
    status text NOT NULL DEFAULT 'active',
    overview_text text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_session_key ON sessions (session_key);
CREATE INDEX IF NOT EXISTS idx_sessions_scope_key ON sessions (scope_key);

CREATE TABLE IF NOT EXISTS session_turns (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    turn_status text NOT NULL DEFAULT 'not_summarized',
    summarize_started_at timestamptz,
    messages_jsonl text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT session_turns_turn_status_check CHECK (
        turn_status IN ('not_summarized', 'summarizing', 'summarized', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_session_turns_session_created
    ON session_turns (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_turns_status_created
    ON session_turns (turn_status, created_at);

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'session_turns'
          AND column_name = 'messages_json_l'
    ) THEN
        ALTER TABLE session_turns RENAME COLUMN messages_json_l TO messages_jsonl;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'session_turns'
          AND column_name = 'message_json_l'
    ) THEN
        ALTER TABLE session_turns RENAME COLUMN message_json_l TO messages_jsonl;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS session_turns;
DROP TABLE IF EXISTS sessions;
