# ONE CRM — foundation (draft)
This module is deliberately not mounted in the live server and has no message sender or persistent customer store. It operates on synthetic or authorized pseudonymous ticket evidence only.

## Source adapter contract
Use existing server-side store authorization and tenant membership. Do not use browser-side credentials or expose customer tokens from aggregate analytics endpoints. Read complete verified ticket windows from the sales adapter; do not silently accept truncated or unavailable data. Normalize a stable tenant-scoped ticket identity (including date/register where needed), store, business date, customer token, and integer signed net monetary amount in one verified currency. Exclude voided receipts; reconcile returns and duplicate receipts against the ERP. Anonymous transactions remain anonymous. The window is an observation window, not lifetime history. A separate enrollment/identity source is needed for customers without purchases.

## Storage design (proposed, not migrated)
Separate CRM service and database with tenant-scoped foreign keys, row policies, encryption and audited role grants. Entities: tenant, brand, store, customer, source_identity, contact_point, consent_event, suppression, purchase, purchase_line, loyalty_event, segment, segment_version, journey, journey_version, campaign, message, delivery_event, holdout_assignment, attribution_event, sync_run, audit_event. Identity resolution uses verified source keys; no automatic cross-brand merging. Consent and contact data stay separate from analytics tokens. Explicitly approved contact scope is required for activation.

## Release gates
1. Confirm ownership, private storage and permitted processing, auth, source coverage, stable token join and reconciliation.
2. Read-only authorized customer profiles and dynamic segments; handle unknown data honestly, pagination and access tests.
3. Provider sandbox, webhook signature validation, idempotency, outbox/queue, retries, suppression and opt-out, templates, channel permissions, frequency limits, approval workflow and kill switch. No real sends until approved.
4. Campaign experiments with randomized holdout and net margin after campaign costs, not observational sales alone.
5. B2B extension through organizations, contacts, pipeline, activity, tasks and opportunities, separate permissions and legal scope.

## Run synthetic test
`node backend/tests/one-crm-foundation.mjs`

The current code is pure functions only: RFM-style metrics, segment preview and explicit-consent eligibility. No source adapter, data migrations, frontend or provider integration is enabled by this change. The eligibility check is a restrictive product gate, not a complete compliance or sending decision.
