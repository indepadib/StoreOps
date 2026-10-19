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

## White label layout

The standard StoreOps markdown label now uses white 50 × 25 mm stock at 203 dpi (Honeywell LNX3-1 compatible language). Both MD20 and MD50 print black on white: product name, large discount and new price, previous price, expiry date and CODE128. No yellow/red stock is required.

Existing printer records keep their dimensions. In DLC → Direction settings, save the store printer to apply the new 50 × 25 mm white-stock preset. Do not change the format while old-format print jobs are queued; verify the queue first. Test one physical label and its POS scan before bulk printing. Network connectivity and ZPL mode still require on-site verification.

The generator preserves at least ten modules of blank space on either side of CODE128. Codes too wide for the configured stock are rejected rather than cropped. The screen preview is indicative, not a scannable barcode.
