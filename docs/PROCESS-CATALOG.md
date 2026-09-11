# StoreOps — Retail Process Catalog

## Core operating rule
StoreOps is a configurable Retail Operating System. Retail processes are tenant configuration, not hard-coded Franprix screens.

A retailer can activate, deactivate, schedule, version or make any process mandatory. A mandatory process can block store opening, store closing or a specific operation until its required steps, evidence, approvals and exports are ready.

## Merchandising rule before stock logic
A stock quantity alone never defines a rupture.

Current availability classification:

- **ASSORTED + available stock > 0** → available.
- **ASSORTED + available stock = 0** → out of stock / rupture.
- **NOT ASSORTED + available stock = 0** → ignore; never count as rupture.
- **NOT ASSORTED + available stock > 0** → residual stock outside assortment; route to transfer/return/markdown policy.
- **ASSORTMENT UNKNOWN / stale** → do not calculate a business rupture; raise data-readiness warning.
- **negative stock** → stock anomaly regardless of assortment membership.

Availability KPIs use the active assorted SKU population as denominator. Non-assorted products must not inflate out-of-stock or availability metrics.

An assortment snapshot can contain several active assortments. Explicit exclusions override inclusion. Valid-from / valid-to dates are respected.

## Product taxonomy
The StoreOps canonical model does not hard-code four levels because retailers use different taxonomies.

It stores generic hierarchy nodes and product assignments. The tenant can label levels as, for example:

- Univers
- Département / Rayon
- Catégorie
- Famille
- Sous-famille

For Franprix / D365, the target mapping includes procurement product categories and product-category assignments. The exact OData fields and assortment-channel result entity must be probed in the One Retail environment before activation.

## Integration model
Dynamics 365 is one connector, not the StoreOps data model.

StoreOps capabilities can be supplied independently by ERP, POS, WMS, PIM, HR, BI/data warehouse, custom APIs, SFTP/files or another SaaS.

Canonical capability families include catalog/products, assortment, taxonomy, stock/batches, pricing/promotions, sales/margin, purchase orders/receiving, transfers, workforce, cash, losses, exports and SSO.

## Process groups

### Setup / Master data
- integration health
- store and supply-node mapping
- product/catalog sync
- assortment sync
- taxonomy/category sync
- user and permission governance
- process/policy configuration
- export/import templates

### Pre-opening / Opening
- acknowledge previous handover
- staffing/shifts/coverage
- access/security checks
- POS/TPE/network/balances/equipment readiness
- cold-chain opening readings
- cash opening / cashier assignment / floats
- price changes / promotions / leaflet / new-item execution
- surface cleanliness / fill / freshness / FEFO
- critical assorted OOS review when configured
- final opening gate

### Trading / Store operations
- business pulse: sales, margin, tickets, basket, objective
- rayon/category/family performance
- shelf replenishment
- assorted out-of-stock management
- replenishment recommendation
- warehouse/supply availability
- transfer request and follow-up
- negative/inconsistent stock
- residual stock outside assortment
- assortment compliance
- customer feedback / NPS / complaints
- operational incidents and corrective actions

### Receiving
- expected deliveries / POs
- unloading and quantity control
- quality / packaging / temperature
- batch / lot / DLC-DDM / traceability
- delivery discrepancy
- accept / partial / reject decision
- supplier return where applicable
- ERP posting or validated import file

### Commercial execution
- price changes
- promotion start
- promotion end / signage removal
- leaflet/campaign execution
- new-item launch
- price/promo field audit
- merchandising/assortment compliance

### Quality / Food safety
- DLC/DDM monitoring
- DLC treatment: markdown, withdrawal, loss, donation, supplier return
- cold-chain scheduled controls
- cleaning/hygiene
- traceability and recalls
- quality nonconformity
- corrective action + evidence

### Stock / Inventory
- daily stock signals
- cycle counts
- targeted inventory
- full inventory
- discrepancy analysis
- recount policy
- inventory adjustment/export/posting
- batches/locations/FEFO detail
- stock in transit / already ordered

### Loss / Shrink
- capture during the day
- breakage
- expired product
- damage
- theft
- unknown shrink
- donation
- supplier return
- internal use
- evidence by threshold
- director approval by threshold
- ERP export/posting
- daily and periodic shrink review

### Workforce
- employee creation
- employee contract lifecycle
- contract end without history deletion
- shifts and overlap control
- publish schedule
- attendance / absence / replacement
- coverage gaps
- employee/store objectives
- training/habilitation compliance

### Cash
- opening float
- cashier / register assignment
- POS/TPE readiness
- cash controls during day when configured
- cash closing
- tender reconciliation
- variance handling
- approval and ERP/finance output

### Maintenance
- opening equipment checks
- breakdown / incident
- maintenance ticket
- SLA/escalation
- evidence on resolution
- preventive maintenance

### Closing
- surface closing round
- DLC and cold-chain final status
- all daily loss/shrink captured
- loss approval/evidence complete
- loss ERP file/posting ready
- cash closing complete
- receptions finalized or explained
- stock blocking anomalies addressed
- critical incidents resolved or authorized override
- handover prepared
- Closing Pack generated
- required ERP/export files ready
- security/doors/alarm
- final store-closing gate

### Periodic management
- assortment review
- gap between assortment and shelf/stock
- category/family/rayon performance
- margin/mix review
- shrink causes
- supplier performance
- workforce/productivity review
- process compliance score
- safety/quality audit
- preventive maintenance
- training compliance
- store performance review

## Process Studio target
Each process template will support:

- tenant / brand / store-format applicability
- version
- trigger and schedule
- conditions
- roles allowed
- ordered steps
- fields and validation
- mandatory vs optional
- evidence requirements
- approvals
- SLA / escalation
- blocking gate: process, opening, closing or action
- integration action
- export template
- exceptional override role + mandatory reason + audit

The primary manager UX remains simple: StoreOps only surfaces the next relevant action. The process catalog stays behind `Plus` / administration and drives the assistant automatically.
