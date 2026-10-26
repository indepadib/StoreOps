import assert from 'node:assert/strict';import {latestInvoicePurchases} from '../services/analytics-article-reference.mjs';
const row={ItemId:'P',Qty:2,LineAmount:50,PurchUnit:'BOX',CurrencyCode:'MAD',InvoiceDate:'2026-10-20T00:00:00Z',CreatedOn:'2026-10-21T00:00:00Z',SourceKey:'1',InvoiceId:'INV'};
let m=latestInvoicePurchases([row,{...row,Qty:-1,InvoiceDate:'2026-10-25T00:00:00Z'}]);assert.equal(m.get('P').price,25);assert.equal(m.get('P').unit,'BOX');assert.equal(m.get('P').date,'2026-10-20');assert.equal(m.get('P').scope,'COMPANY');
m=latestInvoicePurchases([{...row,ItemId:'ZERO',LineAmount:0},{...row,ItemId:'NULL',LineAmount:null},{...row,ItemId:'UNIT',PurchUnit:''},{...row,InvoiceDate:'2026-10-21T00:00:00Z',LineAmount:80},row]);assert.equal(m.get('ZERO').price,0);assert.equal(m.get('NULL').price,null);assert.equal(m.get('NULL').status,'UNAVAILABLE');assert.equal(m.get('UNIT').price,null);assert.equal(m.get('P').price,40);
const {handleCustomerBiApi}=await import('../services/analytics-customer-bi-api.mjs');const request=url=>handleCustomerBiApi({req:{method:'GET'},user:{role:'ops_director'},url:new URL('https://test'+url)});
const scope=await request('/api/analytics/intelligence-scope');assert.equal(scope.status,200);assert.ok(scope.data.excludedStores.some(s=>s.id==='zeraoui'),'unmapped active stores must be explicit, not a fatal ALL failure');
const denied=await handleCustomerBiApi({req:{method:'GET'},user:{role:'store_manager',store_id:'val-fleuri'},url:new URL('https://test/api/analytics/intelligence-scope?storeIds=trefle')});assert.equal(denied.status,403);
console.log('PASS dated net invoice purchase, credit-note exclusion, nulls, units, company scope and unavailable-store isolation');

await assert.rejects(()=>request('/api/analytics/detention/prepare?storeId=val-fleuri'),e=>e.status===422,'stock preparation must reach the stock route, not the ticket-date validator');

assert.equal(latestInvoicePurchases([row,{...row,InvoiceDate:'2026-10-22T00:00:00Z',LineAmount:null}]).get('P').price,null,'a missing latest price must not silently fall back to an older invoice');
