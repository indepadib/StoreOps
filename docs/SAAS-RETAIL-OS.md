# StoreOps — Retail Operating System SaaS Contract

## Product position
StoreOps is a configurable retail operating system, not a Franprix-specific app and not a mini-ERP.

Franprix is the first production POC. The product must remain deployable for another retailer without forking the codebase.

The product promise is simple: every store process is translated into a guided, mandatory and auditable flow that helps the manager decide what to do next.

## Experience architecture
The store manager primary navigation remains intentionally small:

- Aujourd'hui — prioritized actions and mandatory gates
- Scanner — item intelligence and operational action
- Équipe — employees, contracts, shifts, attendance and objectives
- Plus — full process library, dashboards, history and settings allowed by role

Every flow follows:

Intent -> Context -> Recommendation -> One primary action -> Confirmation -> Next action

Advanced details stay behind progressive disclosure.

## Mandatory process engine
Retailers must be able to configure processes without changing application code.

A process template defines:
- tenant / brand scope
- store or network applicability
- trigger: opening, closing, scheduled, event-driven or manual
- ordered steps
- mandatory/optional steps
- role allowed to execute each step
- fields and validation rules
- evidence requirements
- blocking severity
- escalation/SLA
- completion gate
- optional export/integration action

A process run is immutable history. Template changes apply to new runs, never silently rewrite completed history.

Examples:
- store opening
- store closing
- receiving
- cold chain
- price/promo execution
- DLC/DDM
- loss/shrink
- inventory
- replenishment
- maintenance
- cash opening/closing
- handover
- safety / audit

## Closing gate example — loss/shrink
The retailer may configure loss entry as a mandatory daily process.

Expected UX:
1. losses are captured during the day from scan, DLC treatment or manual entry;
2. StoreOps tracks evidence and approval requirements automatically;
3. closing shows one clear status: ready / action required;
4. the store cannot close while mandatory loss items are unresolved;
5. StoreOps produces the configured ERP import file or posts through a validated connector;
6. the run records who prepared, approved, exported and/or posted the data.

For Franprix, the exact Dynamics import canvas remains MAPPING_REQUIRED until the validated D365 template/fields are known. StoreOps must never invent an ERP import schema.

## Quick business dashboard
The manager can access a compact business pulse without turning Today into a BI dashboard.

Core normalized KPIs:
- sales / net sales
- tickets
- average basket
- units
- gross margin value
- gross margin rate
- sales vs target
- sales vs comparable period
- loss/shrink value and rate
- availability / out-of-stock indicators

Breakdowns:
- department / rayon
- category / family
- top/bottom products
- hourly sales when available

The UI shows a few cards first, then drill-down. The normalized KPI contract is independent from the ERP source.

## Connector architecture
StoreOps business services consume normalized contracts, not Dynamics-specific entities.

Connector families:
- ERP: Dynamics 365 F&O, SAP, Oracle, Odoo, custom API
- POS / sales
- WMS / warehouse
- HR / scheduling
- identity / SSO
- BI / data warehouse
- files: CSV/XLSX/SFTP/manual import

A connector can expose capabilities independently: product.read, stock.read, pricing.read, promotion.read, sales.read, receiving.read, inventory.write, loss.write, transfer.write, cash.read, etc.

Each capability has its own readiness state: UNMAPPED, SIMULATED, LIVE_PENDING, LIVE.

## Tenant / brand customization
Configuration belongs to the tenant/brand, not to source code.

Customizable areas:
- brand name, logo, colors and terminology
- stores and supply warehouses
- roles and permissions
- process templates and mandatory gates
- quality rules and thresholds
- DLC policies
- loss reasons and approval thresholds
- stock/replenishment policies
- dashboard KPIs and targets
- employee roles
- objectives
- ERP connector and field mappings
- import/export templates
- feature flags

Franprix should therefore become a configuration profile on top of the generic StoreOps kernel.

## Data tenancy
Every future SaaS business object must be tenant scoped. Store access is additionally constrained by store assignment and role.

Store managers cannot browse other stores. Supply warehouse stock is exposed only as replenishment context when permitted.

Network roles can aggregate only the tenant they belong to.

## Export templates
Exports are configuration objects with:
- code and version
- target system
- delimiter/encoding/file extension
- ordered columns
- field mapping and formatting rules
- required fields
- validation rules
- filename convention

StoreOps validates the dataset before making an export available. A file marked READY_FOR_IMPORT must match the configured template exactly.

## SaaS boundary
The generic kernel owns:
- workflow/process engine
- permissions
- audit/evidence
- workforce
- recommendations
- normalized insights
- exports
- connector capability contracts
- mobile UX

Tenant adapters/configuration own:
- ERP entity/field mappings
- retailer-specific process templates
- terminology
- brand theme
- thresholds/policies
- output file schemas

## Product quality bar
A new retailer should be onboardable mostly through configuration and connector mapping, not a new code branch.

A store manager should be able to use the product with almost no training.

Complexity belongs in configuration and integration layers, never in the primary store-manager journey.