-- DRAFT: authorization data only; no login, service grants or RLS bypass.
BEGIN;
CREATE TABLE one_crm.memberships (
 tenant_id text NOT NULL REFERENCES one_crm.tenants(tenant_id),
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 160),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 160),
 role text NOT NULL CHECK(role IN ('analyst','marketer','reviewer','data_admin','brand_admin')),
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,issuer,subject)
);
CREATE TABLE one_crm.membership_stores (
 tenant_id text NOT NULL, issuer text NOT NULL, subject text NOT NULL, store_id text NOT NULL,
 PRIMARY KEY(tenant_id,issuer,subject,store_id),
 FOREIGN KEY(tenant_id,issuer,subject) REFERENCES one_crm.memberships(tenant_id,issuer,subject),
 FOREIGN KEY(tenant_id,store_id) REFERENCES one_crm.stores(tenant_id,store_id)
);
ALTER TABLE one_crm.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_crm.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE one_crm.membership_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_crm.membership_stores FORCE ROW LEVEL SECURITY;
REVOKE ALL ON one_crm.memberships,one_crm.membership_stores FROM PUBLIC;
COMMIT;
