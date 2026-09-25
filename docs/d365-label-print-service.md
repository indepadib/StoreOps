# StoreOps → D365 custom label print contract

StoreOps can already resolve the active Document Routing printer for each pilot store:

- Val Fleuri: `Honeywell PC42E-T (ValFleuri1)`
- Trèfle: `Honeywell PC42E-T (Trefel)`
- Legal entity: `5001`
- Custom label data source used by the current D365 dialog: `Promo Label`

## Why a small D365 extension is required

The tenant OData metadata exposes printer-management actions such as `SyncPrinters` and `GetRegisteredPrintersByClient`, but no action that triggers **Print custom labels**. Therefore StoreOps must not write to `RetailItemLabelsToPrint` or `DocumentRoutingJobs` directly.

A small X++ custom service should expose one operation:

`StoreOpsIntegration / LabelPrintService / printProductLabel`

Expected HTTP path:

`/api/services/StoreOpsIntegration/LabelPrintService/printProductLabel`

StoreOps sends:

```json
{
  "contractVersion": "STOREOPS_LABEL_PRINT_V1",
  "company": "5001",
  "storeId": "val-fleuri",
  "storeNumber": "FRP0001",
  "warehouseId": "FRP0001",
  "itemNumber": "HS-003577",
  "ean": "optional",
  "labelLayoutDataSourceId": "Promo Label",
  "printerName": "Honeywell PC42E-T (ValFleuri1)",
  "printerId": "907c923e-6999-4ada-9055-21c570cc7be2",
  "quantity": 1
}
```

The X++ implementation must:
1. validate company, item, data source and active Document Routing printer;
2. use the **standard D365 Custom Label framework** used by the native Released products > Options > Print custom labels button;
3. render the existing label/layout for the selected product;
4. submit the rendered label to Document Routing using the supplied printer;
5. return a success/failure payload with a traceable request/job identifier.

Do not bypass the Custom Label framework by inserting arbitrary rows into routing tables.

## StoreOps activation

After the service is deployed, set Netlify production variable:

`D365_LABEL_PRINT_SERVICE_PATH=/api/services/StoreOpsIntegration/LabelPrintService/printProductLabel`

Optional:
`D365_LABEL_DATA_SOURCE_ID=Promo Label`

No frontend change is then required; StoreOps will automatically enable the label-print button.
