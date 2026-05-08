-- ============================================================
-- PrologWeb — Supabase Schema
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    username    TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- INVITATION CODES
CREATE TABLE IF NOT EXISTS invitation_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT UNIQUE NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE CASCADE,
    max_uses    INTEGER DEFAULT 1,
    use_count   INTEGER DEFAULT 0,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- FILES (Prolog programs)
CREATE TABLE IF NOT EXISTS files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    content         TEXT DEFAULT '',
    share_token     TEXT UNIQUE,
    share_enabled   BOOLEAN DEFAULT FALSE,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- FILE COLLABORATORS (who can edit)
CREATE TABLE IF NOT EXISTS file_collaborators (
    file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (file_id, user_id)
);

-- FILE VERSION HISTORY (last 10 versions)
CREATE TABLE IF NOT EXISTS file_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    saved_by    UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_files_owner        ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_files_share_token  ON files(share_token);
CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_collab_file        ON file_collaborators(file_id);

-- ============================================================
-- FIRST ADMIN USER (cambiar los valores antes de ejecutar)
-- Se crea manualmente aquí; el password_hash se genera con bcrypt
-- Puedes usar: python -c "from passlib.hash import bcrypt; print(bcrypt.hash('tu_password'))"
-- ============================================================
-- INSERT INTO users (email, username, password_hash, role)
-- VALUES ('admin@tudominio.com', 'admin', '$2b$12$HASH_AQUI', 'admin');
