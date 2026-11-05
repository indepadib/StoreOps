-- H&S Buying Group: durable queued PDF analysis. Background workers only receive job IDs,
-- not uploaded documents or browser credentials.
CREATE TABLE IF NOT EXISTS hs_buying.contract_read_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(12) NOT NULL CHECK(target_type IN ('INTAKE','DOCUMENT')),
  target_id UUID NOT NULL,
  contract_id UUID REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  source_sha256 CHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  requested_by VARCHAR(120) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_at TIMESTAMPTZ NOT NULL,
  reanalyze BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(12) NOT NULL DEFAULT 'QUEUED'
    CHECK(status IN ('QUEUED','RUNNING','DONE','FAILED')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_code VARCHAR(50),
  error_message VARCHAR(350)
);
CREATE UNIQUE INDEX IF NOT EXISTS hs_buying_one_active_reader_per_file
  ON hs_buying.contract_read_jobs(target_type,target_id)
  WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS hs_buying_read_jobs_user_date
  ON hs_buying.contract_read_jobs(requested_by,requested_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
