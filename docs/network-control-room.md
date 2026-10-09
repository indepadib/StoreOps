# Network control room

The network page starts with four status counts and a compact tile for every store. The default list shows critical, warning and incomplete situations, ordered by priority. Search, status filters and pagination keep the overview usable for larger networks. Selecting a store reveals its reasons, opening owner, operational controls and activity; the existing store action opens its operational workspace.

Critical signals include critical incidents, cold-chain discrepancies, expired lots and overdue blocked opening. Follow-up signals include recent commercial actions, delayed incidents, recounts, handover, receiving rejection, staffing gaps, cash discrepancies and loss controls. Missing or outdated daily snapshots and missing opening controls are marked incomplete. Green means no operational alert has been reported; it does not certify all sales or stock data is available.

Initial rendering uses one central local snapshot. It does not refresh Dynamics for every store or wait on remote price/promo reads. Cached sales can enrich it. Selection reads one Business Pulse; the explicit network sales action uses at most three concurrent reads and stops scheduling reads when the user leaves the page. Missing sales stay absent, and the aggregate displays its coverage. Only fresh, available same-period comparisons can create a sales decline warning; a warning is not a causal explanation.

Validation covers 50 synthetic stores, status ordering, missing dates and controls, opening time, partial sales coverage, stale comparisons and a read-only local snapshot. Browser verification covers initial request count, selection, filters, bounded loading and desktop/mobile rendering.

## Actions and evidence

Each reason links directly to the corresponding store screen. Navigation validates that the store is in the accessible network and restricts destinations to the supported operational pages. Sales detail explains the arithmetic contribution of ticket volume and average basket, shows the departments contributing to a decline and identifies incomplete UB coverage. A stock risk estimate is explicitly distinguished from observed lost sales.

The network D-7 variation uses only matched store pairs with fresh, complete current sales and an available comparison. Its store coverage is shown separately from current sales coverage. Partial or outdated reads do not contribute to the aggregate. Snapshot and sales timestamps are visible; after five minutes the local view marks old values as needing refresh. The local age check never triggers an API read.

Selection and bulk reads share one queue with at most three concurrent requests and one in-flight request per store. Fresh sales are reused, failures are retryable, and explicit retry bypasses the sales cache. Reloading the operational overview preserves selection, search, filters and fresh sales. Pending work is cancelled on a new render and no further store reads are scheduled after leaving the page.
