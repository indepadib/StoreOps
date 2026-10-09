# POS time comparison and data evidence — 2026-10-09

The automatic time detector could select SysModifiedDateTime instead of transTime on RetailTransactionSalesTransBIEntities. Integration timestamps describe when D365 records were changed, not when customers bought articles. The standard entity now uses transTime, including seconds encoded as text; discovery prefers known transaction-time fields and rejects modification, pickup and creation timestamps. Both current and prior periods receive the same local minute cutoff. Incomplete clocks or truncated periods disable the comparison.

Validation includes read-only source checks and synthetic regression fixtures. Business amounts and article-level source observations are retained only in the local task record.

Assortment classification must not be silently treated as procurement UB. Missing procurement assignments are displayed for correction in the authenticated dashboard.

Dashboard evidence adds chronological hourly sales and cumulative D-7 sales, exact ticket and basket contributions to the CA delta, quantity and price/mix contributions to the basket delta, latest received sale time, and the article-level unclassified list. Tickets are a purchasing proxy, not measured visitor traffic. The stock risk estimate over 24 hours is not booked lost sales and does not establish causality.

The arithmetic decomposition uses tickets first, then basket: (current tickets − prior tickets) × prior basket + current tickets × (current basket − prior basket). The two contributions reconcile to the sales delta, subject to displayed rounding. Quantity/price-mix uses the same sequential method and does not claim prices changed.
