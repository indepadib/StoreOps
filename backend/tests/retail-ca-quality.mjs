import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-retail-ca-quality-${process.pid}.db`;
const {retailDisplaySalesAmount,aggregateSalesRows}=await import('../services/dynamics-sales.mjs');

const screenshotRow={
  netAmount:-1008165.88,
  taxAmount:-160288.19,
  transactionId:'TOTAL'
};
const htCfg={sign:-1,fields:{net:'netAmount',taxAmount:'taxAmount',transaction:'transactionId'}};
assert.equal(
  retailDisplaySalesAmount(screenshotRow,htCfg),
  1168454.07,
  'D365 HT net amount + sales tax must reconcile to TTC business CA'
);

const ttcCfg={sign:-1,fields:{net:'netAmountInclTax',taxAmount:'taxAmount',transaction:'transactionId'}};
assert.equal(
  retailDisplaySalesAmount({netAmountInclTax:-120,taxAmount:-20},ttcCfg),
  120,
  'tax-inclusive field must never have tax added twice'
);

const rows=[
  {transactionId:'T1',netAmount:-100,taxAmount:-20,custAccount:'C1'},
  {transactionId:'T2',netAmount:-50,taxAmount:-10,custAccount:''}
];
const result=aggregateSalesRows(rows,{sign:-1,fields:{net:'netAmount',taxAmount:'taxAmount',transaction:'transactionId',customer:'custAccount'}});
assert.equal(result.sales,180);
assert.equal(result.loyalty.identifiedSales,120);
assert.equal(result.tickets,2);

const mappingSource=readFileSync(new URL('../services/d365-mapping-diagnostics.mjs',import.meta.url),'utf8');
assert.match(mappingSource,/net:\['netamountincltax'.*'netamount'/,'auto-mapping must prefer TTC over HT');

const decisionSource=readFileSync(new URL('../services/decision-intelligence.mjs',import.meta.url),'utf8');
assert.match(decisionSource,/:30;/,'default business sanity gate must block implausible global margin above 30%');

console.log('Retail Intelligence CA / margin quality contract passed.');
