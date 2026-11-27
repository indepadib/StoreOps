CREATE TABLE IF NOT EXISTS crm_customer_master_snapshot (company TEXT PRIMARY KEY, checked_at TIMESTAMPTZ NOT NULL, accounts JSONB NOT NULL CHECK (jsonb_typeof(accounts)='array'));
