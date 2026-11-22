PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    username_norm TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until TEXT,
    ai_notice_ack_at TEXT,
    deleted_at TEXT
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);

CREATE TABLE currencies (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    minor_unit INTEGER NOT NULL CHECK (minor_unit BETWEEN 0 AND 6)
);

CREATE TABLE fx_rates (
    rate_date TEXT NOT NULL,
    base_code TEXT NOT NULL REFERENCES currencies(code),
    quote_code TEXT NOT NULL REFERENCES currencies(code),
    rate TEXT NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (rate_date, base_code, quote_code)
);

CREATE TABLE ledgers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('personal', 'tracker')),
    currency_code TEXT NOT NULL REFERENCES currencies(code),
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE ledger_members (
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (ledger_id, user_id)
);

CREATE TABLE ledger_invites (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    max_uses INTEGER NOT NULL CHECK (max_uses > 0),
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    revoked_at TEXT
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    ledger_id TEXT REFERENCES ledgers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE (ledger_id, name_norm)
);

CREATE TABLE receipts (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'needs_attention', 'failed', 'confirmed')),
    merchant TEXT,
    merchant_norm TEXT,
    purchased_on TEXT,
    currency_code TEXT NOT NULL REFERENCES currencies(code),
    total_minor INTEGER,
    total_ledger_minor INTEGER,
    fx_rate TEXT,
    fx_date TEXT,
    fx_source TEXT,
    issues TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('photo', 'manual')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE receipt_images (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    original_path TEXT,
    processed_path TEXT,
    thumb_path TEXT,
    sha256 TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE line_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    name_norm TEXT NOT NULL,
    qty_milli INTEGER NOT NULL DEFAULT 1000,
    unit_minor INTEGER,
    amount_minor INTEGER,
    amount_ledger_minor INTEGER,
    bbox TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE extraction_runs (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    pipeline_version TEXT NOT NULL,
    ocr_engine TEXT,
    ocr_model_tier TEXT,
    stage_ms TEXT NOT NULL DEFAULT '{}',
    mean_ocr_conf REAL,
    ocr_lines TEXT,
    rule_candidate TEXT,
    llm_output TEXT,
    validation_result TEXT,
    token_count INTEGER,
    error_code TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE corrections (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    field_name TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    receipt_id TEXT REFERENCES receipts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'dead')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at TEXT NOT NULL,
    lease_until TEXT,
    worker_id TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE worker_heartbeat (
    worker_id TEXT PRIMARY KEY,
    seen_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    limit_minor INTEGER NOT NULL CHECK (limit_minor >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (ledger_id, period)
);

CREATE TABLE llm_usage (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    usage_date TEXT NOT NULL,
    extraction_count INTEGER NOT NULL DEFAULT 0,
    chat_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE chat_threads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    tool_calls TEXT,
    blocks TEXT,
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_ledger_members_user ON ledger_members(user_id);
CREATE INDEX idx_receipts_ledger_date ON receipts(ledger_id, purchased_on DESC, id ASC);
CREATE INDEX idx_receipts_creator ON receipts(created_by);
CREATE INDEX idx_receipts_processing ON receipts(status, updated_at);
CREATE INDEX idx_receipts_duplicate ON receipts(ledger_id, merchant_norm, purchased_on, total_minor);
CREATE INDEX idx_line_items_ledger_date ON line_items(receipt_id, name_norm);
CREATE INDEX idx_jobs_ready ON jobs(status, available_at, lease_until);
CREATE INDEX idx_activity_ledger ON activity_log(ledger_id, created_at DESC);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, created_at);

CREATE TRIGGER receipts_ledger_immutable
BEFORE UPDATE OF ledger_id ON receipts
WHEN OLD.ledger_id <> NEW.ledger_id
BEGIN
    SELECT RAISE(ABORT, 'receipt ledger_id is immutable');
END;

INSERT INTO currencies (code, name, symbol, minor_unit) VALUES
    ('IDR', 'Indonesian Rupiah', 'Rp', 0),
    ('USD', 'US Dollar', '$', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'Pound Sterling', '£', 2),
    ('JPY', 'Japanese Yen', '¥', 0),
    ('SGD', 'Singapore Dollar', 'S$', 2),
    ('MYR', 'Malaysian Ringgit', 'RM', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('AUD', 'Australian Dollar', 'A$', 2),
    ('CAD', 'Canadian Dollar', 'C$', 2),
    ('CHF', 'Swiss Franc', 'CHF', 2),
    ('CNY', 'Chinese Yuan', '¥', 2),
    ('KRW', 'South Korean Won', '₩', 0);

INSERT INTO categories (id, ledger_id, name, name_norm, is_system, created_at) VALUES
    ('system-food', NULL, 'Makanan', 'makanan', 1, '2026-01-01T00:00:00Z'),
    ('system-transport', NULL, 'Transportasi', 'transportasi', 1, '2026-01-01T00:00:00Z'),
    ('system-shopping', NULL, 'Belanja', 'belanja', 1, '2026-01-01T00:00:00Z'),
    ('system-bills', NULL, 'Tagihan', 'tagihan', 1, '2026-01-01T00:00:00Z'),
    ('system-health', NULL, 'Kesehatan', 'kesehatan', 1, '2026-01-01T00:00:00Z');
