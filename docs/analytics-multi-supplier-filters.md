# Multi-supplier evidence and table filters

The former supplier page grouped sales by the product master primary vendor.
That is not historical purchasing or a proof of the supplier of sold stock.
It is now explicitly named and separated from the default invoice-purchase view.
No sales amount is duplicated across suppliers or split using arbitrary weights.

The company-wide invoice endpoint is restricted to directors and platform admins.
Store access alone does not authorize all company purchases. The UI explicitly
states that store filters do not scope company invoice data. Dates do apply.
Read-only invoice pages follow the source continuation to completion; opaque
cursors are held server-side and bound to owner, company and exact date range.
Source identity, company, dates, amounts and currency are checked. Credits retain
their signs and currencies are grouped separately. Exact repeated lines dedupe;
conflicting identities block the result. An account missing from the source is
not replaced with the primary vendor. A header join uses invoice ID and date in
the same company, and ambiguous vendors remain unresolved.

The concrete runtime availability of the invoice vendor fields and header entity
still requires authenticated D365 acceptance. A schema mismatch produces an
explicit unavailable state rather than false complete supplier totals. No real
production purchase totals have been certified by the simulated test suite.

The generic table layer supplies text/numeric filters, sorting and filtered CSV
exports to tables without an existing full-model filter implementation. Native
category/product filters retain their implementation and complete-universe
export. Generic filters explicitly cover loaded table rows, not unloaded pages,
global KPIs or totals. Dynamic renderings retain filters; source/date changes
clear the invoice results. CSV values are escaped against formula execution.
Only visible tables are enhanced and non-table page mutations are ignored.

The invoice view also has full-loaded-dataset vendor and article filters. These
recalculate its supplier summaries. Multi-source context deliberately preserves
the other vendors for an article when one vendor is selected, with an explicit
explanation. Missing suppliers can be inspected separately, without colliding
with an actual vendor account named NON_RESOLU or unresolved.
Invoice evidence is shown in bounded pages of 100 rows. Its dedicated export
contains all matching invoice lines, including signed amounts, quantity/unit,
currency, source IDs and vendor attribution basis; it is not limited to the
displayed page. Source numeric credits retain their numeric CSV values while
text fields are protected against formula execution. Loading can be cancelled,
and incomplete reads never expose a partial summary as a complete total.

Empty/boolean source amounts and invalid currency codes block the result.
An empty line vendor can use a unique invoice-header vendor; an explicit line
vendor remains authoritative. Date requests use an exclusive next-day boundary
so the final day's fractional timestamps are included. Generic table filtering
is debounced; reset restores the original row order as well as removing filters.

Acceptance: an SKU purchased from A and B must appear under both suppliers with
its actual invoice amounts, while its sales remain unallocated between them.
Test signed credits, multiple currencies, missing vendor mappings, duplicate and
conflicting source keys, scope changes, pagination retries, company permissions,
accented searches, French numeric formats and filters on dynamic tables.
