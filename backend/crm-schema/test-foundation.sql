-- Run only on disposable PostgreSQL with the draft schema installed.
BEGIN;
INSERT INTO one_crm.tenants(tenant_id,label,currency) VALUES ('a','Demo A','MAD'),('b','Demo B','MAD');
INSERT INTO one_crm.customers(tenant_id,customer_id) VALUES ('a','00000000-0000-4000-8000-000000000001'),('b','00000000-0000-4000-8000-000000000002');
INSERT INTO one_crm.stores VALUES ('a','s','Demo store');
INSERT INTO one_crm.verified_days VALUES ('a','s','2026-11-20','source','control',now(),2,10000,2500,7500);
INSERT INTO one_crm.tickets VALUES ('a','s','2026-11-20','t1','00000000-0000-4000-8000-000000000001',10000),('a','s','2026-11-20','t2',NULL,-2500);
DO $$ BEGIN
 BEGIN INSERT INTO one_crm.tickets VALUES ('a','s','2026-11-20','bad','00000000-0000-4000-8000-000000000002',100); RAISE EXCEPTION 'cross tenant ticket accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO one_crm.tickets VALUES ('a','s','2026-11-21','bad',NULL,100); RAISE EXCEPTION 'unverified day accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO one_crm.consent_events(tenant_id,customer_id,channel,purpose,status,occurred_at,source_system,source_event_id) VALUES ('a','00000000-0000-4000-8000-000000000001','email','marketing','granted',now(),'demo','1'); RAISE EXCEPTION 'grant without proof accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN INSERT INTO one_crm.identity_links VALUES ('a','pos','token','00000000-0000-4000-8000-000000000002','proof',now()); RAISE EXCEPTION 'cross tenant identity accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='one_crm' AND c.relkind='r' AND NOT(c.relrowsecurity AND c.relforcerowsecurity)) THEN RAISE EXCEPTION 'RLS not forced'; END IF;
END $$;
CREATE ROLE crm_test_reader NOLOGIN;
GRANT USAGE ON SCHEMA one_crm TO crm_test_reader;
GRANT SELECT ON one_crm.customers TO crm_test_reader;
SET LOCAL ROLE crm_test_reader;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM one_crm.customers) THEN RAISE EXCEPTION 'default deny failed'; END IF; END $$;
RESET ROLE;
ROLLBACK;
