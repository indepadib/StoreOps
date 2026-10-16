# StoreOps Store Print Bridge

This small service runs **inside the store network** (Windows PC, mini-PC or Raspberry Pi). StoreOps in the cloud never connects directly to a private printer IP.

## Runtime
Node.js 22+. Configure:
- `STOREOPS_BASE_URL=https://storeops.ma`
- `STOREOPS_PRINT_BRIDGE_TOKEN=<shared secret configured in Netlify>`
- `STOREOPS_PRINTER_BRIDGE_KEY=<same key configured for the store printer in StoreOps>`
- `STOREOPS_PRINTER_HOST=<printer LAN IP or DNS>`
- `STOREOPS_PRINTER_PORT=9100` for raw Zebra-compatible TCP
- optional `STOREOPS_PRINT_POLL_MS=5000`
- optional `STOREOPS_PRINT_JOURNAL=/path/storeops-print-journal.json`

Run:
`node store-print/bridge.mjs`

The local journal intentionally refuses an automatic resend when printer bytes were already sent but the cloud acknowledgement failed. An operator must verify the physical output first, preventing accidental duplicate labels.

Physical printer validation is mandatory before production use. The current payload is ZPL and requires a compatible printer or a future protocol adapter.
