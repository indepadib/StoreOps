-- Disposable PostgreSQL only.
BEGIN;
INSERT INTO one_crm.tenants(tenant_id,label,currency) VALUES ('demo-items','Demo','MAD');
INSERT INTO one_crm.stores VALUES ('demo-items','s','Demo store');
INSERT INTO one_crm.verified_days(tenant_id,store_id,business_day,source_ref,control_ref,verified_at,ticket_count,positive_minor,refund_minor,net_minor,item_evidence_complete) VALUES ('demo-items','s','2026-11-20','source','control',now(),1,0,2500,-2500,true);
INSERT INTO one_crm.tickets VALUES ('demo-items','s','2026-11-20','t1',NULL,-2500);
INSERT INTO one_crm.ticket_items VALUES ('demo-items','s','2026-11-20','t1','1','P1','A',-2500);
DO $$ BEGIN
 BEGIN INSERT INTO one_crm.ticket_items VALUES ('demo-items','s','2026-11-20','bad','1','P1','A',1); RAISE EXCEPTION 'orphan item accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN INSERT INTO one_crm.ticket_items VALUES ('demo-items','s','2026-11-20','t1','1','P2','B',1); RAISE EXCEPTION 'duplicate line accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='one_crm' AND c.relname='ticket_items' AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'item RLS missing'; END IF;
END $$;
ROLLBACK;
