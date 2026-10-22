# H&S Buying Group · Pilot inside StoreOps

Status: feature branch / preview only. The module is a decoupled integration experiment, **not** a new production ERP workflow.

## Why StoreOps first
- Reuse StoreOps session, role-based navigation and existing server-side D365 integration.
- Ship a first usable Buying Group workspace faster.
- Avoid building another authentication or D365 client before the requirements are validated.

## Pilot scope
- A dedicated horizontal navigation entry, gated in the StoreOps UI to director / platform admin using the existing isDirector() predicate.
- Executive dashboard structure without invented financial KPIs.
- Group negotiation simulator using explicit **fictional** quantities and prices (not stored).
- Contracts workflow explainer, with a link to the **separate public demonstration**, without passing credentials.
- Two existing read-only StoreOps API calls:
  - GET /api/dynamics/diagnostics
  - GET /api/stores/:storeId/receipts/po
- The second API is **StoreOps receipts PO cache for one selected store**, not a consolidated, exhaustive purchase ledger.
- **No purchase order creation, no account payable mutation, no payment processing, no contract upload**.

## Isolation and eventual migration
- Self-contained UI component: frontend/js/pages/buying-group.js.
- Self-contained styles: frontend/buying-group.css.
- Minimal touches: frontend/index.html and frontend/js/app.js.
- A future provider abstraction (AuthAdapter, ErpAdapter, BuyingRepository, DocumentStorage) will allow deployment under a separate H&S domain.
- **Do not use StoreOps store IDs as Group legal-entity IDs**; define explicit mapping and approved entity scope.
- Do not persist sensitive supplier contracts in localStorage or a public repository.

## Security limitations and requirements
- The frontend is only a convenience gate. **All future Buying Group API endpoints must enforce authorization server-side.**
- Existing calls rely on StoreOps server-side authorization; do not expose D365 access tokens to browser code.
- authMode=demo is not valid protection for confidential contracts or Group financial data.
- Before accessing other H&S entities, map and approve tenant / D365 legal entities, dataAreaId and cross-company=true scope, and validate permission enforcement.
- Put contract PDFs, Word files and extracts in a private dedicated storage bucket, linked to an H&S-specific database, behind record-level access and audit.
- Do not publish or share real contracts from the current public mockup URL.

## Acceptance and validation
1. Normal staff does not see the menu and is redirected away if they try to route manually.
2. Director can open Centrale d’achat without disrupting Réseau or existing pages.
3. Session and store switching still work; PO cache doesn't follow an unrelated store.
4. A failed D365 diagnostic or PO read yields a useful error, not fabricated figures.
5. Default opening makes no API calls to D365; diagnostics and PO reads are on-demand.
6. Calculator shows fictional Lesieur savings of MAD 28,500 from current MAD 354,000 and proposed MAD 325,500.
7. No D365 mutating request is introduced.
8. No group-wide financial totals are inferred from Franprix-only data.
9. Run: node --test tests/buying-group.test.mjs.
10. Smoke-test mobile layout, director and employee access, then approve merging after a Netlify deploy preview.

## Next milestones
- P1: Group supplier identity matching, legal-entity and product crosswalk, read-only D365 purchase orders and invoices by authorized entity, with a paginated adapter on the server.
- P2: Authenticated Buying Group service, private storage, contract upload + OCR/LLM extraction with human approval, clause versioning, rebate engine.
- P3: Contract-vs-invoice reconciliation, actual vs forecast savings, intercompany models, sourcing and central purchasing workflows.

Do not merge the pilot into the StoreOps production branch before preview validation.
