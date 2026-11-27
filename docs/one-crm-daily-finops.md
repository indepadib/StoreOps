# One CRM — bounded daily sync

- UTC: purchase/RFM 02:00, Earn 02:30, Burn 03:00. No hourly or minute cron. At most three scheduled starts/day. No change to StoreOps Analytics or DLC.
- Reuse all complete archived company/store/business-day partitions indefinitely; missing purchase detail counts as incomplete. Existing Burn records are refreshed only if the underlying purchase partition changed. Failed/unavailable days remain missing. Existing partial caches are not promoted to complete.
- RFM backfill capped at two groups of up to two consecutive days; Earn/Burn retain their existing two groups of up to three days. Existing locks and cooldowns remain. No unbounded loops or automatic full imports.
- The last verified RFM snapshot may remain visible up to seven days, explicitly stale, with actual as-of date. Master snapshot reads retain the last verified data for eight days; writes still require a newly validated snapshot.
- Master and identity stay paused in this change: the current master importer is a paginated full replacement, not a verified incremental import. Before activation, validate the Dynamics modification/deletion watermark, durable cursor and reconciliation, and define name refresh policy. Do not restart the old minute jobs.
- Acceptance before production: CI pass, validate source coverage per store-day, compare two runs on unchanged data (zero new Dynamics reads for completed partitions), verify incomplete day recovery and freshness labels. Measure usage after activation.
