-- DRAFT: extend the disposable CRM schema; not a production migration.
BEGIN;
ALTER TABLE one_crm.verified_days ADD COLUMN item_evidence_complete boolean NOT NULL DEFAULT false;
CREATE TABLE one_crm.ticket_items (
 tenant_id text NOT NULL,
 store_id text NOT NULL,
 business_day date NOT NULL,
 ticket_id text NOT NULL,
 line_id text NOT NULL CHECK(length(trim(line_id)) BETWEEN 1 AND 200),
 product_id text NOT NULL CHECK(length(trim(product_id)) BETWEEN 1 AND 200),
 category text NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 200),
 net_minor bigint NOT NULL,
 PRIMARY KEY(tenant_id,store_id,business_day,ticket_id,line_id),
 FOREIGN KEY(tenant_id,store_id,business_day,ticket_id) REFERENCES one_crm.tickets(tenant_id,store_id,business_day,ticket_id)
);
CREATE INDEX ticket_items_product ON one_crm.ticket_items(tenant_id,product_id,business_day);
ALTER TABLE one_crm.ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_crm.ticket_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE one_crm.ticket_items FROM PUBLIC;
COMMIT;
