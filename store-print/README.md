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

## Android Bluetooth / RawBT

In Direction > DLC Markdown > Imprimante magasin, choose `ZPL · RawBT Bluetooth (Android)` and save. No bridge key is needed. Pair the printer in Android and configure RawBT for raw ZPL. The printer must interpret ZPL; successful Bluetooth pairing alone does not validate the language.

Use the explicit test label first (60 × 40 mm, 203 dpi). Check actual media size, positioning, and real Store Commerce barcode scanning separately; the test label has no sales barcode and does not validate MD20/MD50. Existing price, approval, expiry and POS validation gates stay in force.

After preparing an operation, in the print queue choose `Préparer sur ce PDA`, then the explicit `Ouvrir RawBT et imprimer` link. Returning to StoreOps, refresh and confirm physical output, or report a failure. Browser handoff is never treated as successful printing. A second preparation is refused; there is no automatic retransmission. On partial output, verify labels before requeuing; requeueing resends the whole job. RawBT lots above 180,000 UTF-8 bytes must be split into smaller selections.

The existing PC bridge ignores printers using ZPL_RAWBT. Windows users must use the PC relay mode. No bridge token is passed to Android or included in RawBT links.

Transport reference: https://github.com/402d/RawBt-and-ESCPOS-coffee (rawbt:base64 byte payload).
