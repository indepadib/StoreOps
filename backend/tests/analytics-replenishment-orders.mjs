import assert from 'node:assert/strict';
process.env.STOREOPS_DB=':memory:';
const {generateReplenishmentOrder,observedUnits,datedInbound}=await import('../services/analytics-replenishment-orders.mjs');
const {todayISO}=await import('../db.mjs');
const day=todayISO(),future=new Date(Date.parse(day)+7*86400000).toISOString().slice(0,10);
assert.equal(observedUnits({units:3,quantityByUnit:{KG:2,G:1}},'G'),2001);
assert.equal(observedUnits({units:3,quantityByUnit:{KG:2}},'G'),null);
assert.equal(observedUnits({units:3,quantityByUnit:{KG:2,PC:1}},'G'),null);
assert.equal(datedInbound([{remainingQty:3,unit:'PC',planningDate:day},{remainingQty:12,unit:'PC',planningDate:future}],'PC',day,2,'PO'),3);
assert.equal(datedInbound([{remainingQty:3,unit:'PC',requestedDeliveryDate:day}],'PC',day,2,'PO'),null);
assert.equal(datedInbound([{planningRemaining:null,remainingQty:0,unit:'PC',planningDate:day}],'PC',day,2,'TO'),null);

const products=Array.from({length:137},(_,i)=>`HS-${i}`);
const stores=[{id:'a',name:'Magasin A'},{id:'b',name:'Magasin B'}];
const readyStock=items=>({status:'READY',complete:true,items});
const calls=[];
const sources={
 readSales:async id=>{calls.push(id);return {status:'READY',days:28,products:products.map(key=>({key,label:key,units:280,quantityByUnit:{PC:280}}))};},
 readAssortment:()=>({status:'READY',included:new Set(products)}),
 readWarehouse:async()=>readyStock(products.map(productNumber=>({productNumber,availableOnHandQuantity:12}))),
 readStore:async()=>readyStock([]),
 readPO:async()=>({mode:'LIVE',diagnostics:{authoritative:true},items:[]}),
 readTO:async()=>({mode:'LIVE',diagnostics:{authoritative:true},items:[]}),
 readReferences:async skus=>new Map(skus.map(sku=>[sku,{productName:sku,inventoryUnit:'PC',purchaseUnit:'PC',supplyMode:sku==='HS-1'?'DIRECT_SUPPLIER':'WAREHOUSE',primaryVendorAccount:'V001'}])),
 readRules:()=>[],readTaxonomy:()=>[],readLeadDays:()=>new Map([['V001',3]])
};
const po=await generateReplenishmentOrder({mode:'PO',warehouse:'DC',stores},sources);
assert.deepEqual(calls,['a','b']);assert.equal(po.rows.length,136);assert.equal(po.examined,137);
assert.equal(po.rows[0].usage,20);assert.equal(po.rows[0].supplier,'V001');assert.equal(po.rows[0].warehouse,'DC');assert.equal(po.rows[0].store,null);
assert.equal(po.rows[0].available,12,'warehouse inventory is used once for all stores');
const to=await generateReplenishmentOrder({mode:'TO',warehouse:'DC',stores:[stores[0]]},sources);
assert.equal(to.rows.length,136);assert.equal(to.rows[0].usage,10);assert.equal(to.rows[0].store,'Magasin A');assert.equal(to.rows[0].quantity,12);
assert(to.rows[0].shortfall>0,'insufficient source stock caps a transfer');
const missingDates=await generateReplenishmentOrder({mode:'TO',warehouse:'DC',stores:[stores[0]]},{...sources,readTO:async()=>({mode:'LIVE',diagnostics:{authoritative:true},items:[{lines:[{productNumber:'HS-0',unit:'PC',planningRemaining:2}]}]})});
assert.equal(missingDates.rows.length,135);assert.equal(missingDates.blocked[0].sku,'HS-0');
const missingLead=await generateReplenishmentOrder({mode:'PO',warehouse:'DC',stores},{...sources,readLeadDays:()=>new Map()});
assert.equal(missingLead.rows.length,0);assert.equal(missingLead.blocked.length,136);
await assert.rejects(generateReplenishmentOrder({mode:'PO',warehouse:'DC',stores},{...sources,readSales:async()=>({status:'TRUNCATED'})}),{code:'REPLENISHMENT_INCOMPLETE'});
console.log('PASS whole-scope PO/TO, network demand, warehouse stock cap, dated inbound and missing data gates');
