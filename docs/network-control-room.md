# Network control room

The network page starts with four status counts and a compact tile for every store. The default list shows critical, warning and incomplete situations, ordered by priority. Search, status filters and pagination keep the overview usable for larger networks. Selecting a store reveals its reasons, opening owner, operational controls and activity; the existing store action opens its operational workspace.

Critical signals include critical incidents, cold-chain discrepancies, expired lots and overdue blocked opening. Follow-up signals include recent commercial actions, delayed incidents, recounts, handover, receiving rejection, staffing gaps, cash discrepancies and loss controls. Missing or outdated daily snapshots and missing opening controls are marked incomplete. Green means no operational alert has been reported; it does not certify all sales or stock data is available.

Initial rendering uses one central local snapshot. It does not refresh Dynamics for every store or wait on remote price/promo reads. Cached sales can enrich it. Selection reads one Business Pulse; the explicit network sales action uses at most three concurrent reads and stops scheduling reads when the user leaves the page. Missing sales stay absent, and the aggregate displays its coverage. Only fresh, available same-period comparisons can create a sales decline warning; a warning is not a causal explanation.

Validation covers 50 synthetic stores, status ordering, missing dates and controls, opening time, partial sales coverage, stale comparisons and a read-only local snapshot. Browser verification covers initial request count, selection, filters, bounded loading and desktop/mobile rendering.
