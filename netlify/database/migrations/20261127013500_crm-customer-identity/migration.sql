CREATE TABLE IF NOT EXISTS crm_customer_identity_snapshot (company TEXT NOT NULL, account_ref TEXT NOT NULL, identity JSONB NOT NULL, checked_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(company,account_ref));
CREATE INDEX IF NOT EXISTS crm_identity_refresh_idx ON crm_customer_identity_snapshot(company,checked_at);
