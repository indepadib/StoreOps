# ONE CRM — Persistent CDP contract (draft)
Status: schema candidate only. Never apply to StoreOps production or expose as a REST schema before review.
## Data boundaries
- Dedicated PostgreSQL database/schema, tenant is the brand boundary. Composite keys ensure foreign keys cannot link entities across tenants.
- Store scope is still an application authorization boundary. No operational access roles or RLS policies are granted by this migration. Superusers and BYPASSRLS must never serve normal requests.
- Customer identifiers are opaque. Contact details and proof documents are deliberately excluded pending a separately protected PII store, retention rules and access audit.
- Source identity links require verified evidence from an authorized connector. Conflicts are quarantined by the identity engine before any persistence.
- Transactions belong to a reconciled closed store-day. Source/control references and totals are mandatory. The foreign key alone does not guarantee ticket aggregate reconciliation: an atomic ingestion service must validate the batch against independent controls and insert the day and tickets in one transaction.
- Source event IDs are unique per tenant/system to support idempotent ingestion. Duplicate event payload conflicts must be rejected by the service rather than silently ignored.
- Consent records are events, not inferred from purchases or loyalty registration; the service must enforce append-only access, latest valid proof and revoke-wins behavior. No sends.
- Segment JSON is validated by the bounded compiler in the application. Campaign rows are drafts only, not executable.
## Release gates
1. Disposable PostgreSQL constraint suite passes in CI. No production secrets.
2. Implement and test an atomic ingestion repository, tenant/store access policies and a non-owner application role.
3. Verify signed returns and independent closed-day source totals with business owners. Verify brand/company mapping and identity proof.
4. Define retention, erasure, audit and encryption controls before storing PII or proof documents.
5. Separate approval for provisioning database, applying migrations, linking real data or enabling communication.
