-- H&S Buying Group — genuine document-reading and approval workflow.
-- Does not modify StoreOps operational or Dynamics tables.
CREATE TABLE IF NOT EXISTS hs_buying.contract_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES hs_buying.contract_documents(id) ON DELETE RESTRICT,
  source_sha256 CHAR(64) NOT NULL,
  model VARCHAR(80) NOT NULL,
  findings JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'TO_REVIEW'
    CHECK (status IN ('TO_REVIEW','REVIEWED','SUPERSEDED')),
  consent_by VARCHAR(120) NOT NULL,
  requested_by VARCHAR(120) NOT NULL,
  reviewed_by VARCHAR(120),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id,source_sha256)
);
CREATE INDEX IF NOT EXISTS hs_buying_analysis_contract_idx ON hs_buying.contract_analyses(contract_id,created_at DESC);

CREATE TABLE IF NOT EXISTS hs_buying.contract_workflows (
  contract_id UUID PRIMARY KEY REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  stage VARCHAR(24) NOT NULL DEFAULT 'DRAFT'
    CHECK (stage IN ('DRAFT','EXTRACTED','REVIEWED','PENDING_APPROVAL','APPROVED','ACTIVE','REJECTED')),
  analysis_id UUID REFERENCES hs_buying.contract_analyses(id) ON DELETE RESTRICT,
  submitted_by VARCHAR(120),
  submitted_at TIMESTAMPTZ,
  approved_by VARCHAR(120),
  approved_at TIMESTAMPTZ,
  rejected_by VARCHAR(120),
  rejection_reason TEXT,
  updated_by VARCHAR(120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_buying_workflow_stage_idx ON hs_buying.contract_workflows(stage,updated_at DESC);

CREATE TABLE IF NOT EXISTS hs_buying.contract_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  analysis_id UUID REFERENCES hs_buying.contract_analyses(id) ON DELETE RESTRICT,
  title VARCHAR(240) NOT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'OTHER'
    CHECK (kind IN ('RENEWAL','REVIEW','RECONCILIATION','PAYMENT','DOCUMENT','NEGOTIATION','OTHER')),
  due_on DATE,
  owner VARCHAR(120),
  evidence_quote VARCHAR(500),
  evidence_page VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'TODO'
    CHECK (status IN ('TODO','DONE','CANCELLED')),
  created_by VARCHAR(120) NOT NULL,
  completed_by VARCHAR(120),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_buying_obligations_due_idx ON hs_buying.contract_obligations(status,due_on);
CREATE INDEX IF NOT EXISTS hs_buying_obligations_contract_idx ON hs_buying.contract_obligations(contract_id,status);

REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
