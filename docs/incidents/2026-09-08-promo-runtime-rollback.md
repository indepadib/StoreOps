# 2026-09-08 — Promotion runtime rollback

Production safety redeploy after global Netlify Function 502 responses while D365 promotion reads were enabled.

- D365_PROMOTION_READ_MODE reset to simulated in production.
- Article/EAN, stock and price reads remain unchanged.
- No D365 writes enabled.
- Promotion LIVE must not be re-enabled until runtime isolation is validated.
