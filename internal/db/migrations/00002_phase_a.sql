-- +goose Up
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS abstract text,
    ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE TABLE IF NOT EXISTS atoms (
    uri text PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    category text NOT NULL,
    priority int NOT NULL DEFAULT 50,
    scene_name text,
    slug text,
    content text NOT NULL,
    source_turn_ids uuid[] NOT NULL DEFAULT '{}',
    embedding vector(1024),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atoms_category_check CHECK (
        category IN ('profile', 'preferences', 'entities', 'events')
    )
);

CREATE INDEX IF NOT EXISTS idx_atoms_session_id ON atoms (session_id);
CREATE INDEX IF NOT EXISTS idx_atoms_category ON atoms (category);
CREATE INDEX IF NOT EXISTS idx_atoms_embedding_hnsw
    ON atoms USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS scenes (
    uri text PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    display_name text,
    abstract text,
    body text,
    source_atom_uris text[] NOT NULL DEFAULT '{}',
    embedding vector(1024),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenes_session_id ON scenes (session_id);
CREATE INDEX IF NOT EXISTS idx_scenes_body_fts
    ON scenes USING gin (to_tsvector('english', coalesce(body, '')));
CREATE INDEX IF NOT EXISTS idx_scenes_embedding_hnsw
    ON scenes USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS memories (
    uri text PRIMARY KEY,
    category text NOT NULL,
    slug text,
    abstract text,
    body text,
    source_scene_uris text[] NOT NULL DEFAULT '{}',
    embedding vector(1024),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT memories_category_check CHECK (
        category IN ('profile', 'preferences', 'entities', 'events')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_category_slug
    ON memories (category, slug)
    WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories (category);
CREATE INDEX IF NOT EXISTS idx_memories_body_fts
    ON memories USING gin (to_tsvector('english', coalesce(body, '')));
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
    ON memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS pipeline_state (
    session_id uuid PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    t1_status text NOT NULL DEFAULT 'idle',
    t1_advanced_at timestamptz,
    t2_status text NOT NULL DEFAULT 'idle',
    t2_advanced_at timestamptz,
    t3_status text NOT NULL DEFAULT 'idle',
    t3_advanced_at timestamptz,
    warmup_threshold int NOT NULL DEFAULT 2,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY,
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    progress int NOT NULL DEFAULT 0,
    result_uri text,
    error text,
    session_id uuid REFERENCES sessions (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_kind_check CHECK (kind IN ('t1', 't2', 't3', 'backfill')),
    CONSTRAINT tasks_status_check CHECK (
        status IN ('pending', 'running', 'done', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks (session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

-- +goose Down
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS pipeline_state;
DROP TABLE IF EXISTS memories;
DROP TABLE IF EXISTS scenes;
DROP TABLE IF EXISTS atoms;

ALTER TABLE sessions
    DROP COLUMN IF EXISTS embedding,
    DROP COLUMN IF EXISTS abstract;
