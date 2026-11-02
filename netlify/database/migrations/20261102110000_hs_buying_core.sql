-- H&S Buying Group: isolated procurement domain.
-- No changes to operational StoreOps tables or D365 mappings.
CREATE SCHEMA IF NOT EXISTS hs_buying;

CREATE TABLE IF NOT EXISTS hs_buying.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  tax_identifier VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','ONBOARDING','INACTIVE')),
  account_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hs_buying_suppliers_name_norm_uq ON hs_buying.suppliers(normalized_name);
CREATE INDEX IF NOT EXISTS hs_buying_suppliers_status_idx ON hs_buying.suppliers(status);

CREATE TABLE IF NOT EXISTS hs_buying.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES hs_buying.suppliers(id) ON DELETE RESTRICT,
  title VARCHAR(240) NOT NULL,
  scope VARCHAR(12) NOT NULL CHECK (scope IN ('GROUP','LOCAL')),
  entity_code VARCHAR(30) NOT NULL,
  parent_contract_id UUID REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','ACTIVE','EXPIRED','CANCELLED')),
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MAD',
  rebate_base VARCHAR(25) NOT NULL DEFAULT 'NET_PURCHASES'
    CHECK (rebate_base IN ('NET_PURCHASES','NET_INVOICED')),
  rebate_mode VARCHAR(15) NOT NULL DEFAULT 'RETROACTIVE'
    CHECK (rebate_mode IN ('RETROACTIVE','MARGINAL')),
  rebate_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_terms_days INTEGER,
  notes TEXT,
  approved_by VARCHAR(120),
  approved_at TIMESTAMPTZ,
  created_by VARCHAR(120) NOT NULL,
  updated_by VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hs_buying_contract_date_order CHECK (effective_to >= effective_from),
  CONSTRAINT hs_buying_contract_entity_scope CHECK (
    (scope = 'GROUP' AND entity_code = 'GROUP') OR
    (scope = 'LOCAL' AND entity_code <> 'GROUP')
  )
);
CREATE INDEX IF NOT EXISTS hs_buying_contract_supplier_idx ON hs_buying.contracts(supplier_id);
CREATE INDEX IF NOT EXISTS hs_buying_contract_entity_idx ON hs_buying.contracts(entity_code,status,effective_to);

-- Private contract bytes are never published as CDN assets.
-- 5 MB maximum per attachment is enforced by the API; long-term migrate
-- to a residency-validated private object storage service.
CREATE TABLE IF NOT EXISTS hs_buying.contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
  file_name VARCHAR(240) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  sha256 CHAR(64) NOT NULL,
  file_bytes BYTEA NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  uploaded_by VARCHAR(120) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id,version)
);
CREATE INDEX IF NOT EXISTS hs_buying_docs_contract_idx ON hs_buying.contract_documents(contract_id,uploaded_at DESC);

CREATE TABLE IF NOT EXISTS hs_buying.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id VARCHAR(120) NOT NULL,
  action VARCHAR(50) NOT NULL,
  object_type VARCHAR(40) NOT NULL,
  object_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_buying_audit_time_idx ON hs_buying.audit_events(created_at DESC);

-- Do not expose these objects to Data API clients; the StoreOps backend
-- is the exclusive authenticated gate.
REVOKE ALL ON SCHEMA hs_buying FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
