-- H&S Buying Group: evidence-backed, non-ERP purchase ledger.
-- One invoice summary or individually identified line per source reference.
-- Imports are human-authorized and do NOT assert a live Dynamics connection.
CREATE TABLE IF NOT EXISTS hs_buying.purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind VARCHAR(20) NOT NULL CHECK (source_kind IN ('D365_EXPORT','MANUAL_CSV')),
  entity_code VARCHAR(30) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES hs_buying.suppliers(id) ON DELETE RESTRICT,
  data_area_id VARCHAR(20),
  imported_by VARCHAR(120) NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hs_purchase_batch_count CHECK (inserted_count >= 0 AND skipped_count >= 0)
);
CREATE INDEX IF NOT EXISTS hs_buying_batches_date_idx ON hs_buying.purchase_batches(created_at DESC);

CREATE TABLE IF NOT EXISTS hs_buying.purchase_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES hs_buying.purchase_batches(id) ON DELETE RESTRICT,
  entity_code VARCHAR(30) NOT NULL,
  supplier_id UUID NOT NULL REFERENCES hs_buying.suppliers(id) ON DELETE RESTRICT,
  external_reference VARCHAR(100) NOT NULL,
  line_key VARCHAR(60) NOT NULL DEFAULT '0',
  document_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MAD' CHECK (currency = 'MAD'),
  erp_vendor_account VARCHAR(75),
  description VARCHAR(240),
  data_area_id VARCHAR(20),
  source_kind VARCHAR(20) NOT NULL CHECK (source_kind IN ('D365_EXPORT','MANUAL_CSV')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hs_buying_purchase_entry_unique UNIQUE(entity_code,supplier_id,external_reference,line_key),
  CONSTRAINT hs_buying_purchase_amount_range CHECK (amount_cents BETWEEN -99999999999999 AND 99999999999999)
);
CREATE INDEX IF NOT EXISTS hs_buying_entries_rebate_idx
  ON hs_buying.purchase_entries(supplier_id,entity_code,document_date);
CREATE INDEX IF NOT EXISTS hs_buying_entries_batch_idx
  ON hs_buying.purchase_entries(batch_id);

-- Same private schema policy; never expose directly via PostgREST or CDN.
REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC;
