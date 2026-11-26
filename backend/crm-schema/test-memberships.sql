BEGIN;
INSERT INTO one_crm.tenants(tenant_id,label,currency) VALUES ('acl-a','Synthetic A','MAD'),('acl-b','Synthetic B','MAD');
INSERT INTO one_crm.stores(tenant_id,store_id,label) VALUES ('acl-a','a1','A1'),('acl-b','b1','B1');
INSERT INTO one_crm.memberships(tenant_id,issuer,subject,role,active) VALUES ('acl-a','synthetic-idp','u1','marketer',true);
INSERT INTO one_crm.membership_stores VALUES ('acl-a','synthetic-idp','u1','a1');
DO $$ BEGIN
 BEGIN
 INSERT INTO one_crm.membership_stores VALUES ('acl-a','synthetic-idp','u1','b1');
 RAISE EXCEPTION 'Cross-tenant store accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
 INSERT INTO one_crm.memberships(tenant_id,issuer,subject,role) VALUES ('acl-a','synthetic-idp','u2','platform_admin');
 RAISE EXCEPTION 'Unknown role accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 INSERT INTO one_crm.memberships(tenant_id,issuer,subject,role) VALUES ('acl-a','synthetic-idp','u1','reviewer');
 RAISE EXCEPTION 'Duplicate membership accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
CREATE ROLE crm_acl_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA one_crm TO crm_acl_test;
GRANT SELECT ON one_crm.memberships,one_crm.membership_stores TO crm_acl_test;
SET LOCAL ROLE crm_acl_test;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM one_crm.memberships) OR EXISTS(SELECT 1 FROM one_crm.membership_stores) THEN RAISE EXCEPTION 'Default deny violated'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
