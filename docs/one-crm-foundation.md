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

## P3.1 — hardening checkpoint R0.28
- Strict consent calendar timestamps; simultaneous legacy grants fail closed. Legacy eligibility is not a send authorization. Use complete proof-verified consent preflight.
- Identity lookup now requires explicit matching tenant; callers must migrate to the new signature.
- Audience requests reject unknown, mixed and null rules before source reads.
- Demo invalidates consent-dependent reports and draft decisions when the ledger changes. No real dispatch.

### Remaining release blockers (not certified)
| Gate | Status |
| --- | --- |
| Private repository/service and approved data handling | Open; keep actual data and credentials outside this repository |
| Independent source reconciliation incl. returns, tax basis, register IDs and store/day closure | Open |
| Production authorization, identity proof, role grants, suppression persistence and auditing | Open |
| CRM read-only API with verified store scope and small-audience disclosure controls | Open |
| Real loyalty ledger, marketing outcomes and contact history | Open |
| Model calibration, censoring-aware validation and reconciliation of churn/purchase probability | Open |
| Generative copilot tool allowlist and server-side authorization | Open |
| Provider sandbox, outbox, atomic budget/frequency reservations, webhooks, kill switch | Open |

All P1/P2 V1 modules are synthetic decision support; no real customer integration or activation approval is implied. Next milestone: a private read-only source reconciliation pilot, then authenticated scoped API.

## P3.2 — signed export pilot R0.29
The existing Dynamics sales basket extraction is positive-sales-oriented: `includedRetailSaleRow` excludes nonpositive sales and the existing TTC calculation takes absolute tax. Do not reuse it as a signed CRM source or change its KPI semantics. Build a separately authorized export with verified status/sign/discount/tax conventions and actual store-day closure. The pure `reconcileSignedExport` adapter accepts exact signed decimal TTC strings, normalized opaque IDs, company/register/transaction/line identity, and a complete manifest; excludes voided lines, blocks conflicting duplicates and inconsistent identity, and reconciles both signed line totals and ticket totals against independently sourced references. A mixed receipt can contain negative lines but still be a positive ticket. The reference must include both sets of controls; a shared lineage or unverified mapping blocks the import. Metadata flags alone are not proof. No live Dynamics calls, real data, imports or writes are enabled. Before production: private approved runtime, verified field mapping on real closed days with finance, server-derived authorization, validated independent extracts, then private read-only API. No public data upload.
