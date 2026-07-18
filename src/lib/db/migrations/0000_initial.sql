-- Regula AI — Initial Database Migration
-- This SQL can be applied manually or via `drizzle-kit migrate`
-- Requires PostgreSQL with pgcrypto extension for sha256

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ──────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE tenant_tier AS ENUM ('starter', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'compliance_officer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE source_type AS ENUM ('upload', 'email', 'slack', 'api', 'model_output');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE document_status AS ENUM ('pending', 'processing', 'processed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE framework AS ENUM ('SEC', 'FINRA', 'FDA', 'GDPR', 'HIPAA', 'CCPA', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE rule_type AS ENUM ('pattern', 'semantic', 'composite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved', 'false_positive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_event_type AS ENUM (
        'document.uploaded',
        'document.processed',
        'rule.created',
        'rule.updated',
        'evaluation.run',
        'alert.created',
        'alert.status_changed',
        'alert.assigned',
        'user.login',
        'tenant.config_changed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    tier tenant_tier NOT NULL DEFAULT 'starter',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'compliance_officer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    source_type source_type NOT NULL DEFAULT 'upload',
    content_text TEXT,
    content_chunks JSONB,
    metadata JSONB,
    status document_status NOT NULL DEFAULT 'pending',
    uploaded_by UUID REFERENCES users(id),
    file_hash VARCHAR(128),
    file_size INTEGER,
    page_count INTEGER,
    word_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    framework framework NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_set_id UUID NOT NULL REFERENCES rule_sets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type rule_type NOT NULL,
    config JSONB NOT NULL,
    severity severity NOT NULL DEFAULT 'medium',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    chunk_index INTEGER,
    triggered BOOLEAN NOT NULL DEFAULT FALSE,
    confidence REAL,
    evidence_text TEXT,
    reasoning TEXT,
    human_override BOOLEAN DEFAULT FALSE,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    rule_id UUID REFERENCES rules(id),
    alert_count INTEGER NOT NULL DEFAULT 0,
    highest_severity severity NOT NULL,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    alert_group_id UUID REFERENCES alert_groups(id),
    severity severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'open',
    title VARCHAR(500) NOT NULL,
    summary TEXT,
    recommended_action TEXT,
    assigned_to UUID REFERENCES users(id),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_name VARCHAR(500),
    chunk_index INTEGER,
    evidence_text TEXT,
    evidence_context TEXT,
    rule_id UUID REFERENCES rules(id),
    rule_name VARCHAR(255),
    rule_set_name VARCHAR(255),
    framework framework,
    reasoning TEXT,
    confidence REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type audit_event_type NOT NULL,
    actor_id UUID REFERENCES users(id),
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    payload JSONB,
    prev_hash TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    quantity INTEGER DEFAULT 1,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant ON users(email, tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_status ON documents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_created ON documents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_sets_tenant ON rule_sets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_set ON rules(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_document ON evaluations(document_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_rule ON evaluations(rule_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_tenant ON evaluations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alert_groups_tenant ON alert_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alert_groups_rule ON alert_groups(rule_id);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_severity ON alerts(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_group ON alerts(alert_group_id);
CREATE INDEX IF NOT EXISTS idx_alerts_evaluation ON alerts(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_date ON usage_events(tenant_id, recorded_at DESC);

-- ── Audit Log Hash Trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION audit_log_set_hashes()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash_val TEXT;
    content_to_hash TEXT;
BEGIN
    -- Get the previous row's content_hash for this tenant
    SELECT content_hash INTO prev_hash_val
    FROM audit_log
    WHERE tenant_id = NEW.tenant_id
    ORDER BY id DESC
    LIMIT 1;

    NEW.prev_hash := COALESCE(prev_hash_val, '0x0000000000000000000000000000000000000000000000000000000000000000');

    content_to_hash := NEW.tenant_id::TEXT || '|' ||
                       NEW.event_type::TEXT || '|' ||
                       COALESCE(NEW.resource_id::TEXT, '') || '|' ||
                       COALESCE(NEW.payload::TEXT, '{}') || '|' ||
                       NEW.created_at::TEXT || '|' ||
                       NEW.prev_hash;

    NEW.content_hash := encode(sha256(content_to_hash::bytea), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_hashes ON audit_log;
CREATE TRIGGER trg_audit_log_hashes
    BEFORE INSERT ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_set_hashes();

-- ── Protect audit_log from UPDATE/DELETE ───────────────────

-- Note: In production, the application database user should only have
-- INSERT and SELECT privileges on audit_log. This is set via GRANT:
--   GRANT INSERT, SELECT ON audit_log TO app_user;
--   -- no UPDATE or DELETE grants
