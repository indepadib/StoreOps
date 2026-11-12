-- H&S Buying Group — supplier rebate claims and source-backed settlements.
-- No ERP posting or bank confirmation occurs here.
CREATE TABLE IF NOT EXISTS hs_buying.rebate_claims (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id UUID NOT NULL REFERENCES hs_buying.contracts(id) ON DELETE RESTRICT,
 entity_code VARCHAR(32) NOT NULL CHECK (entity_code IN
  ('FRANPRIX','VENEZIA','FLORMAR','DAHAB','INTERSPORT','PRIMOR','BEAUTY_FOR_YOU','GROUP')),
 period_from DATE NOT NULL,
 period_to DATE NOT NULL CHECK (period_to >= period_from),
 claimed_mad NUMERIC(18,2) NOT NULL CHECK (claimed_mad > 0 AND claimed_mad < 100000000000000),
 claim_reference VARCHAR(140) NOT NULL,
 source_reference VARCHAR(220) NOT NULL,
 note VARCHAR(1000),
 status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
   CHECK(status IN ('DRAFT','SUBMITTED','ACKNOWLEDGED','DISPUTED','CLOSED')),
 created_by VARCHAR(120) NOT NULL,
 updated_by VARCHAR(120),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 submitted_at TIMESTAMPTZ,
 acknowledged_at TIMESTAMPTZ,
 closed_at TIMESTAMPTZ,
 UNIQUE(contract_id,entity_code,period_from,period_to),
 UNIQUE(claim_reference,contract_id)
);
CREATE TABLE IF NOT EXISTS hs_buying.rebate_settlements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_id UUID NOT NULL REFERENCES hs_buying.rebate_claims(id) ON DELETE RESTRICT,
 kind VARCHAR(18) NOT NULL CHECK(kind IN ('CREDIT_NOTE','BANK_TRANSFER','DEDUCTION')),
 amount_mad NUMERIC(18,2) NOT NULL CHECK (amount_mad > 0),
 evidence_reference VARCHAR(220) NOT NULL,
 evidence_date DATE NOT NULL,
 note VARCHAR(1000),
 created_by VARCHAR(120) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(claim_id,kind,evidence_reference)
);
CREATE INDEX IF NOT EXISTS hs_buying_rebate_claims_state_idx
 ON hs_buying.rebate_claims(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS hs_buying_rebate_claims_contract_idx
 ON hs_buying.rebate_claims(contract_id,period_to DESC);
CREATE INDEX IF NOT EXISTS hs_buying_rebate_settlement_claim_idx
 ON hs_buying.rebate_settlements(claim_id,created_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
