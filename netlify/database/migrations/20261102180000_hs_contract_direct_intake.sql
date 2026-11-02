-- Contract-first intake: a PDF / DOCX can be archived before a supplier or
-- commercial conditions have been entered. Only staff verified by StoreOps
-- director/admin authorization can use the associated API.
CREATE TABLE IF NOT EXISTS hs_buying.contract_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(240) NOT NULL,
  content_type VARCHAR(100) NOT NULL
    CHECK (content_type IN ('application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  sha256 CHAR(64) NOT NULL,
  file_bytes BYTEA, -- cleared after registration to avoid duplicate private storage
  status VARCHAR(16) NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN ('UPLOADED','ANALYZED','REGISTERED')),
  ai_analysis JSONB,
  ai_model VARCHAR(80),
  analyzed_by VARCHAR(120),
  analyzed_at TIMESTAMPTZ,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_by VARCHAR(120),
  registered_at TIMESTAMPTZ,
  contract_id UUID REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  CONSTRAINT hs_intake_state_shape CHECK (
     (status='REGISTERED' AND contract_id IS NOT NULL AND file_bytes IS NULL)
     OR (status IN ('UPLOADED','ANALYZED') AND contract_id IS NULL AND file_bytes IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS hs_buying_intakes_created_idx
  ON hs_buying.contract_intakes(created_by,created_at DESC);
CREATE INDEX IF NOT EXISTS hs_buying_intakes_open_idx
  ON hs_buying.contract_intakes(status,created_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
