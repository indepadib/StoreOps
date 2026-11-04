-- Keep every AI attempt versioned so an improved reread never silently replaces
-- the original proposed clause values. Contract approval is still a separate act.
ALTER TABLE hs_buying.contract_analyses
  DROP CONSTRAINT IF EXISTS contract_analyses_document_id_source_sha256_key;

CREATE INDEX IF NOT EXISTS hs_buying_analysis_version_idx
  ON hs_buying.contract_analyses(contract_id,document_id,created_at DESC);

CREATE TABLE IF NOT EXISTS hs_buying.contract_intake_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL REFERENCES hs_buying.contract_intakes(id) ON DELETE RESTRICT,
  source_sha256 CHAR(64) NOT NULL,
  model VARCHAR(80) NOT NULL,
  findings JSONB NOT NULL,
  requested_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_buying_intake_analysis_versions_idx
  ON hs_buying.contract_intake_analysis_runs(intake_id,created_at DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
