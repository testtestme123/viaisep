-- ============================================================
-- VIAISEP Quota Management Schema (SQLite version)
-- ============================================================

-- Table 1: key_mappings - map API keys to subscription info
CREATE TABLE IF NOT EXISTS key_mappings (
    key_id           TEXT PRIMARY KEY DEFAULT (CAST(NULL AS TEXT)),  -- SQLite doesn't support gen_random_uuid(), will use application-level UUID
    api_key          TEXT NOT NULL UNIQUE,
    plan_category    TEXT CHECK(plan_category IN ('trial', 'paid')),
    plan_type        TEXT,
    days_remaining   INTEGER CHECK(days_remaining >= 0),
    last_used_at     TEXT,  -- ISO format string
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_key_mappings_api_key ON key_mappings(api_key);

-- Table 2: project_quotas - store per-Key usage limits and counters
CREATE TABLE IF NOT EXISTS project_quotas (
    key_id           TEXT PRIMARY KEY REFERENCES key_mappings(key_id),
    project_count    INTEGER NOT NULL CHECK(project_count >= 0) DEFAULT 0,
    max_projects     INTEGER NOT NULL DEFAULT 3 CHECK(max_projects IN (3, -1)),
    node_count_limit INTEGER NOT NULL DEFAULT 200 CHECK(node_count_limit >= 0),
    cached_plan_category TEXT,
    cache_expires_at TEXT DEFAULT (datetime('now', '+1 hour'))
);

-- Table 3: audit_logs - track all quota-related operations
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id        TEXT PRIMARY KEY DEFAULT (CAST(NULL AS TEXT)),
    api_key       TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('check_subscription','create_project','create_node')),
    status_code   INTEGER NOT NULL CHECK(status_code BETWEEN 100 AND 599),
    details       TEXT,  -- JSON string
    timestamp     TEXT DEFAULT CURRENT_TIMESTAMP,
    ip_address    TEXT,
    user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_api_key ON audit_logs(api_key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);