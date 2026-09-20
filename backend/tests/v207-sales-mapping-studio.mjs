import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v207-sales-mapping-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_SALES_READ_MODE='simulated';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {saveD365SalesMappingDraft,d365SalesMappingSettings,evaluateD365SalesSmokeRows,activateD365SalesMapping,disableD365SalesMapping,d365SalesMappingSignature}=await import('../services/d365-sales-mapping.mjs');
const {salesIntegrationConfig,aggregateSalesRows}=await import('../services/dynamics-sales.mjs');
const {integrationSnapshot}=await import('../services/integration-registry.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(actor,'platform/admin test user required');
db.prepare(`DELETE FROM d365_sales_mapping_settings`).run();

const mapping={
 entity:'RetailTransactionSalesTransBIEntities',
 fields:{
  channel:'RetailChannelId',
  businessDate:'BusinessDate',
  transaction:'TransactionId',
  product:'ItemId',
  net:'NetAmountInclTax',
  quantity:'Qty',
  cost:'CostAmount',
  time:'TransactionTime',
  productName:'ItemName',
  department:'',
  category:''
 },
 dateFilterMode:'datetime',
 salesSign:-1,
 quantitySign:1,
 costSign:-1
};

let saved=saveD365SalesMappingDraft({actor,input:mapping});
assert.equal(saved.state,'DRAFT');
assert.equal(saved.fields.channel,'RetailChannelId');
assert.equal(saved.fields.cost,'CostAmount');
assert.throws(()=>activateD365SalesMapping({actor}),e=>e.code==='D365_SALES_MAPPING_NOT_VALIDATED');

const rows=[
 {RetailChannelId:'10001',BusinessDate:'2026-09-19T09:00:00Z',TransactionId:'T-001',ItemId:'HS-001',NetAmountInclTax:-120,Qty:2,CostAmount:-80,TransactionTime:'09:12:00',ItemName:'Article A'},
 {RetailChannelId:'10001',BusinessDate:'2026-09-19T10:00:00Z',TransactionId:'T-002',ItemId:'HS-002',NetAmountInclTax:-50,Qty:1,CostAmount:-31,TransactionTime:'10:05:00',ItemName:'Article B'}
];
const smoke=evaluateD365SalesSmokeRows({rows,mapping,retailChannelId:'10001',latencyMs:25,filtered:true});
assert.equal(smoke.status,'PASSED');
assert.equal(smoke.uniqueTickets,2);
assert.equal(smoke.channelMatches,2);
assert.equal(smoke.metrics.sales.sample,120);
assert.equal(smoke.metrics.cost.sample,80);
assert.equal(smoke.marginCandidate,true);

db.prepare(`UPDATE d365_sales_mapping_settings SET state='VALIDATED',smoke_json=?,validated_at=CURRENT_TIMESTAMP,validated_by=? WHERE id='default'`).run(JSON.stringify(smoke),actor.id);
saved=activateD365SalesMapping({actor});
assert.equal(saved.state,'LIVE');

let cfg=salesIntegrationConfig('val-fleuri');
assert.equal(cfg.mode,'LIVE');
assert.equal(cfg.ready,false,'global mapping must not make a store ready before its own smoke');
assert(cfg.missing.includes('storeSmoke'));
db.prepare(`INSERT OR REPLACE INTO d365_sales_store_validation(store_id,entity,channel_field,channel_value,channel_kind,mapping_signature,state,smoke_json,validated_at,updated_at) VALUES(?,?,?,?,?,?, 'PASSED', ?, CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run('val-fleuri',mapping.entity,mapping.fields.channel,'10001','RETAIL_CHANNEL',d365SalesMappingSignature(saved),JSON.stringify({...smoke,storeId:'val-fleuri'}));
cfg=salesIntegrationConfig('val-fleuri');
assert.equal(cfg.ready,true);
assert.equal(cfg.mappingSource,'STOREOPS_VALIDATED_MAPPING');
assert.equal(cfg.retailId,'10001');
assert.equal(cfg.fields.store,'RetailChannelId');
assert.equal(cfg.fields.date,'BusinessDate');
assert.equal(cfg.fields.transaction,'TransactionId');
assert.equal(cfg.fields.net,'NetAmountInclTax');
assert.equal(cfg.fields.cost,'CostAmount');
assert.equal(cfg.dateFilterMode,'datetime');

const aggregate=aggregateSalesRows(rows,cfg);
assert.equal(aggregate.netSales,170);
assert.equal(aggregate.tickets,2);
assert.equal(aggregate.units,3);
assert.equal(aggregate.marginValue,59);
assert.equal(Math.round(aggregate.marginRate*100)/100,34.71);

const integrations=integrationSnapshot();
assert.equal(integrations.coverage['sales.transactions.read'].ready,true);
assert.equal(integrations.coverage['sales.margin.read'].ready,true);

saved=disableD365SalesMapping({actor});
assert.equal(saved.state,'DISABLED');
assert.equal(d365SalesMappingSettings().state,'DISABLED');
const disabledCfg=salesIntegrationConfig('val-fleuri');
assert.equal(disabledCfg.mappingState,'DISABLED');
assert.equal(disabledCfg.mode,'DISABLED');

const bad=evaluateD365SalesSmokeRows({rows:[{RetailChannelId:'10001',BusinessDate:'2026-09-19',TransactionId:'T'}],mapping,retailChannelId:'10001'});
assert.equal(bad.status,'FAILED');
assert(bad.missingInPayload.includes('net'));

console.log('V2.07 sales mapping lifecycle contract: OK');
