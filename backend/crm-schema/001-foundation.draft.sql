-- DRAFT, isolated PostgreSQL schema. Do not run in StoreOps production.
-- Requires PostgreSQL 15+. No role grants or public API exposure.
BEGIN;
CREATE SCHEMA one_crm;
REVOKE ALL ON SCHEMA one_crm FROM PUBLIC;
CREATE TABLE one_crm.tenants (
 tenant_id text PRIMARY KEY CHECK (length(tenant_id) BETWEEN 1 AND 160),
 label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
 currency char(3) NOT NULL CHECK (currency='MAD'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE one_crm.customers (
 tenant_id text NOT NULL REFERENCES one_crm.tenants(tenant_id),
 customer_id uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','quarantined','erased')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,customer_id)
);
CREATE TABLE one_crm.identity_links (
 tenant_id text NOT NULL,
 source_system text NOT NULL,
 account_token text NOT NULL,
 customer_id uuid NOT NULL,
 proof_ref text NOT NULL CHECK(length(proof_ref)>0),
 verified_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,source_system,account_token),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES one_crm.customers(tenant_id,customer_id)
);
CREATE TABLE one_crm.stores (
 tenant_id text NOT NULL REFERENCES one_crm.tenants(tenant_id),
 store_id text NOT NULL,
 label text NOT NULL,
 PRIMARY KEY(tenant_id,store_id)
);
CREATE TABLE one_crm.verified_days (
 tenant_id text NOT NULL,
 store_id text NOT NULL,
 business_day date NOT NULL,
 source_ref text NOT NULL,
 control_ref text NOT NULL CHECK(control_ref<>source_ref),
 verified_at timestamptz NOT NULL,
 ticket_count bigint NOT NULL CHECK(ticket_count>=0),
 positive_minor bigint NOT NULL CHECK(positive_minor>=0),
 refund_minor bigint NOT NULL CHECK(refund_minor>=0),
 net_minor bigint NOT NULL CHECK(net_minor=positive_minor-refund_minor),
 PRIMARY KEY(tenant_id,store_id,business_day),
 FOREIGN KEY(tenant_id,store_id) REFERENCES one_crm.stores(tenant_id,store_id)
);
CREATE TABLE one_crm.tickets (
 tenant_id text NOT NULL,
 store_id text NOT NULL,
 business_day date NOT NULL,
 ticket_id text NOT NULL,
 customer_id uuid,
 net_minor bigint NOT NULL,
 PRIMARY KEY(tenant_id,store_id,business_day,ticket_id),
 FOREIGN KEY(tenant_id,store_id,business_day) REFERENCES one_crm.verified_days(tenant_id,store_id,business_day),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES one_crm.customers(tenant_id,customer_id)
);
CREATE INDEX tickets_customer_date ON one_crm.tickets(tenant_id,customer_id,business_day DESC) WHERE customer_id IS NOT NULL;
CREATE TABLE one_crm.consent_events (
 tenant_id text NOT NULL,
 event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','sms','push')),
 purpose text NOT NULL CHECK(purpose='marketing'),
 status text NOT NULL CHECK(status IN ('granted','revoked')),
 occurred_at timestamptz NOT NULL,
 proof_ref text,
 source_system text NOT NULL,
 source_event_id text NOT NULL,
 PRIMARY KEY(tenant_id,event_id),
 UNIQUE(tenant_id,source_system,source_event_id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES one_crm.customers(tenant_id,customer_id),
 CHECK(status<>'granted' OR (proof_ref IS NOT NULL AND length(trim(proof_ref))>0))
);
CREATE INDEX consent_latest ON one_crm.consent_events(tenant_id,customer_id,channel,occurred_at DESC);
CREATE TABLE one_crm.customer_events (
 tenant_id text NOT NULL,
 event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('enrolled','purchase','refund','points_earned','points_redeemed','message_sent','message_delivered','message_failed','unsubscribe')),
 source_system text NOT NULL,
 source_event_id text NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,event_id),
 UNIQUE(tenant_id,source_system,source_event_id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES one_crm.customers(tenant_id,customer_id)
);
CREATE INDEX events_customer_date ON one_crm.customer_events(tenant_id,customer_id,occurred_at DESC);
CREATE TABLE one_crm.segments (
 tenant_id text NOT NULL REFERENCES one_crm.tenants(tenant_id),
 segment_id uuid NOT NULL DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 expression jsonb NOT NULL CHECK(jsonb_typeof(expression)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,segment_id)
);
CREATE TABLE one_crm.campaign_drafts (
 tenant_id text NOT NULL,
 campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
 segment_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp','sms','push')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 assumptions jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(assumptions)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,campaign_id),
 FOREIGN KEY(tenant_id,segment_id) REFERENCES one_crm.segments(tenant_id,segment_id)
);
-- Default deny: no policies or role grants. Service access must be separately designed
-- and tested; table owners/superusers and BYPASSRLS roles are not tenant security boundaries.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='one_crm' LOOP
  EXECUTE format('ALTER TABLE one_crm.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE one_crm.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE one_crm.%I FROM PUBLIC',t);
 END LOOP;
END $$;
COMMIT;
