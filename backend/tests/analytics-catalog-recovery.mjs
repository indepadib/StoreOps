import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildSalesProof} from '../../frontend/analytics/sales-proof-model.js';
import {filterAndSortRows} from '../../frontend/analytics/table-analysis.js';

const source=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
const fragment=source.slice(source.indexOf('  const catalogCachePrefix='),source.indexOf('  function addDays('));
let now=Date.now(),tenant='A';
const saved=new Map(),state={catalog:new Map(),catalogTenant:null};
class Clock extends Date{static now(){return now;}}
const context={state,Date:Clock,Map,sectionState:()=>({tenant}),localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)}};
vm.runInNewContext(fragment+';globalThis.catalog={hydrateCatalogCache,persistCatalogCache,catalogNeedsRefresh,cacheCatalogItems};',context);
const cache=context.catalog;
cache.hydrateCatalogCache();
cache.cacheCatalogItems([{productNumber:'SKU',productName:null,primaryVendorAccount:null,vendorName:null}],tenant);
assert.equal(cache.catalogNeedsRefresh('SKU'),false,'a failed identity read has a short retry delay');
now+=60_001;
assert.equal(cache.catalogNeedsRefresh('SKU'),true,'an unresolved article must be retried instead of being permanently cached');
cache.cacheCatalogItems([{productNumber:'GOOD',productName:'Nom complet',primaryVendorAccount:'V',vendorName:'Fournisseur'}],tenant);
cache.persistCatalogCache();
assert.equal(cache.catalogNeedsRefresh('SKU'),true,'saving a newer row must not renew an older missing identity');
assert.equal(cache.catalogNeedsRefresh('GOOD'),false);
now+=15*60_000;
assert.equal(cache.catalogNeedsRefresh('GOOD'),true,'complete article attributes must eventually refresh');
tenant='B';
assert.equal(cache.cacheCatalogItems([{productNumber:'LATE',productName:'Ancienne société'}],'A'),false,'late source responses must not cross tenants');
cache.hydrateCatalogCache();
assert.equal(state.catalog.size,0,'switching tenants clears the previous article dictionary');
cache.cacheCatalogItems([{productNumber:'B',productName:'B'}],tenant);cache.persistCatalogCache();
tenant='A';cache.hydrateCatalogCache();
assert(state.catalog.has('GOOD'));assert(!state.catalog.has('B'));

const selected={tenant:'A',section:'sales',periodStart:'2026-11-01',periodEnd:'2026-11-01',compareStart:'2026-10-31',compareEnd:'2026-10-31',selectedStoreIds:['store']};
const data={period:{startDate:selected.periodStart,endDate:selected.periodEnd},comparison:{startDate:selected.compareStart,endDate:selected.compareEnd},stores:[{storeId:'store'}],summary:{current:{sales:10},previous:{sales:9}},products:[{key:'SKU',label:'Ancien libellé',sales:10,previousSales:9}]};
const nodes=new Map(),listeners=new Map(),clicks=new Map(),downloads=[];
const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',querySelectorAll:()=>[]});return nodes.get(key);};
const host={querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>clicks.set(name,fn)};
const api={getState:()=>selected,getStoreScopeLabel:()=> 'Magasin',money:String,number:String,percent:String,escapeHtml:value=>String(value??''),downloadCsv:(_name,rows)=>downloads.push(rows)};
const ui={buildSalesProof,filterAndSortRows,URL,Intl,Date,Map,Set,WeakMap,window:{RETAIL_INTELLIGENCE:api,RETAIL_DECISION_INTELLIGENCE:{getData:()=>data}},document:{getElementById:id=>id==='salesProof'?host:null,querySelector:()=>null,addEventListener:(name,fn)=>listeners.set(name,fn)}};
const module=readFileSync(new URL('../../frontend/analytics/sales-proof.js',import.meta.url),'utf8').replace(/^(?:import[^;]+;\s*)+/,'');
vm.runInNewContext(module,ui);
clicks.get('click')({target:{closest:()=>({dataset:{salesView:'products'},hasAttribute:()=>false})}});
assert.match(node('tbody').innerHTML,/Ancien libellé/);
listeners.get('retail-intelligence:catalog')({detail:{tenant:'A',items:[{productNumber:'SKU',productName:'Libellé Dynamics complet'}]}});
assert.match(node('tbody').innerHTML,/Libellé Dynamics complet/,'the normal catalog event must update the sales proof table');
listeners.get('retail-intelligence:catalog')({detail:{tenant:'B',items:[{productNumber:'SKU',productName:'Mauvais tenant'}]}});
assert.doesNotMatch(node('tbody').innerHTML,/Mauvais tenant/);
clicks.get('click')({target:{closest:()=>({dataset:{},hasAttribute:key=>key==='data-sales-export'})}});
assert(downloads[0].some(row=>row.includes('Libellé Dynamics complet')),'the export must use the same enriched name');

process.env.STOREOPS_DB=':memory:';
const {releasedProductProfile}=await import('../services/released-product-sourcing.mjs');
assert.equal(releasedProductProfile({ItemNumber:'SKU',PrimaryVendorAccountNumber:'',PrimaryVendorAccount:'V-REAL'}).primaryVendorAccount,'V-REAL');
const previous=process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD;
process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD='SupplierCustom';
assert.equal(releasedProductProfile({ItemNumber:'SKU',SupplierCustom:'V-CUSTOM',PrimaryVendorAccountNumber:''}).primaryVendorAccount,'V-CUSTOM');
if(previous===undefined)delete process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD;else process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD=previous;
const {releasedProductSourcingMany}=await import('../services/released-product-sourcing.mjs');
const {config}=await import('../config.mjs');
const oldMode=config.dynamics.mode;config.dynamics.mode='live';
const codes=['MISSING-A','MISSING-B','MISSING-C','MISSING-D','PRESENT-E'];let schemaReads=0;
const resolved=await releasedProductSourcingMany(codes,{
 readOne:async(_entity,options)=>{
  if(/(?:ItemNumber|ProductNumber) eq/.test(options.filter))return{value:[]};
  schemaReads++;return{value:[{ItemNumber:'PRESENT-E',ProductName:'Nom vérifié',PrimaryVendorAccountNumber:'',PrimaryVendorAccount:'V-REAL',SupplyMode:'DC',CreatedDateTime:'2026-10-01T08:00:00Z',AssortmentDepth:''}]};
 },
 readAll:async(_entity,options)=>{
  assert(options.select.includes('CreatedDateTime')&&options.select.includes('AssortmentDepth'),'observed article attributes must survive the batched select');
  assert(!options.select.includes('ModifiedDateTime'),'optional unobserved fields must not be added to the select');
  assert(options.select.includes('PrimaryVendorAccountNumber')&&options.select.includes('PrimaryVendorAccount'),'both observable supplier fields must be selected for later rows');
  return{value:[{ItemNumber:'PRESENT-E',ProductName:'Nom vérifié',PrimaryVendorAccountNumber:'',PrimaryVendorAccount:'V-REAL',SupplyMode:'DC',CreatedDateTime:'2026-10-01T08:00:00Z',AssortmentDepth:'COMPLEMENTAIRE'}]};
 }
});
assert.equal(schemaReads,1);
assert.equal(resolved.get('PRESENT-E').productName,'Nom vérifié','four missing codes must not hide valid later articles');
assert.equal(resolved.get('PRESENT-E').primaryVendorAccount,'V-REAL');
assert.equal(resolved.get('PRESENT-E').articleAttributes.assortmentDepth,'COMPLEMENTAIRE');
assert.equal(resolved.get('PRESENT-E').articleAttributes.createdAt,'2026-10-01T08:00:00Z');
assert.equal(resolved.get('PRESENT-E').articleAttributes.modifiedAt,null);
config.dynamics.mode=oldMode;
console.log('PASS article cache expiry, missing-name retry, tenant isolation, sales catalog event/export and supplier field fallback');
