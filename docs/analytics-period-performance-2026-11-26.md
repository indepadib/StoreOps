# Analytics periods and comparative sales KPIs

## Changes

The browser retains two-day source slices and the 503/504 subdivision fallback.
It now schedules at most two blocks at a time for both single-store and network
scopes, instead of serialising all 45 network blocks of a 90-day period.
Incomplete or invalid slices are not cached. Slice reuse is confined to the
current page, tenant and exact selected-store/date pair, bounded to 24 MiB and
15 minutes. Explicit refresh bypasses the cache. The full previously persisted
result can be reused by sales, categories and CRM as well as the executive page,
only with matching dates/store identities and complete coverage. Browser cache
generation is v37.

The backend coalesces identical non-forced range reads within one instance,
including source/company/mapping/projection identity. Failures are released and
forced reads do not join older work. Customer names are reused per account and
source/company, rather than only per arbitrary batch of accounts in a date slice.
Unresolved names remain retryable. Daily basket evidence writes are awaited in a
bounded pool of six instead of one serial database round trip per day. Neither
ERP inclusion rules nor cost semantics are changed.

Sales now includes an expandable section with nine additional comparative cards:
unidentified revenue, number and rate of identified tickets, share of identified
revenue, identified and unidentified basket, observed discounts, revenue share
under periodic discount, and share of tickets with periodic discount. Percentage
shares compare in percentage points. These are calculated on the complete merged
period; missing data stay unavailable. The existing daily averages remain in the
main cards and are not duplicated. Periodic discount is an observed transaction
measure, not promotional uplift or causal impact.

## Validation and limits

`node backend/tests/analytics-period-performance.mjs` tests complete 90-day date
coverage, unequal windows, bounded concurrency, expiry, scope isolation, force,
failure invalidation, cancellation, coalescing, repeated identity reuse and KPI
formulas. The 90-day synthetic fixture performs 45 cold reads and zero warm reads.
Recurrent account-name source calls fall from 45 to one in that fixture. These
figures are NOT D365 production timings, and no claim of a threefold cold D365
speedup is made. The source still must be read for a genuinely uncached period.

Production acceptance: measure 30 and 90 days, one and two stores, cold and warm,
with an authenticated authorised session; compare totals and all source coverage
before/after. Monitor D365 throttling and 503/504 incidence with the two-block
pool. If source throttling offsets the parallelism, tune scheduling from measured
latencies rather than increasing concurrency blindly. A durable daily sales mart
remains the longer-term solution for first-time large historical reads.
