import {randomUUID} from 'node:crypto';
import {config} from '../config.mjs';
import {probeDataEntity,odataGet,odataGetAll} from './dynamics.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {vendorNamesMany} from './vendor-directory.mjs';
const clean=v=>String(v??'').trim(),esc=v=>clean(v).replaceAll("'","''");
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const pick=(row,names)=>names.map(n=>Object.keys(row||{}).find(k=>k.toLowerCase()===n.toLowerCase())).find(Boolean);
const cacheKey=id=>analyticsCacheKey('supplier-invoices-page-v1',[id]);
const fail=message=>Object.assign(new Error(message),{status:422,code:'SUPPLIER_PURCHASE_SOURCE_UNAVAILABLE'});
const sourceNumber=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
function fields(row){return{
 company:pick(row,[config.dynamics.dataAreaField,'dataAreaId','SysDataAreaId']),
 id:pick(row,['SourceKey','RecId']),product:pick(row,['ItemId','ItemNumber']),
 date:pick(row,['InvoiceDate']),invoice:pick(row,['InvoiceId','InvoiceNumber']),
 vendor:pick(row,['OrderAccount','VendAccount','VendorAccount','VendorAccountNumber','InvoiceAccount']),
 amount:pick(row,['LineAmount']),currency:pick(row,['CurrencyCode']),quantity:pick(row,['Qty']),unit:pick(row,['PurchUnit'])
}}
export function normalizeSupplierInvoices(rows,m,{company,start,end,headers=[]}={}){
 const headerIndex=new Map();
 for(const h of headers){const key=JSON.stringify([h.invoice,h.date]);if(!headerIndex.has(key))headerIndex.set(key,new Set());headerIndex.get(key).add(h.vendor)}
 return rows.map(r=>{
  const date=clean(r[m.date]).slice(0,10),id=clean(r[m.id]),productNumber=clean(r[m.product]),invoice=clean(r[m.invoice]),raw=r[m.amount],currency=clean(r[m.currency]);
  if(clean(r[m.company]).toUpperCase()!==company.toUpperCase()||!validDate(date)||date<start||date>end||!id||!invoice||!productNumber||sourceNumber(raw)==null||!/^[A-Z]{3}$/.test(currency))throw fail('Identité, société, date, montant ou devise de facture incomplet.');
  const candidates=headerIndex.get(JSON.stringify([invoice,date]));
  const lineVendor=m.vendor?clean(r[m.vendor]):null;
  const vendorAccount=lineVendor||(candidates?.size===1?[...candidates][0]:null);
  return{id,productNumber,invoice,date,vendorAccount:vendorAccount||null,amountHT:Number(raw),currency,
   quantity:m.quantity?sourceNumber(r[m.quantity]):null,
   unit:m.unit?clean(r[m.unit])||null:null,vendorBasis:lineVendor?'INVOICE_LINE_'+m.vendor:vendorAccount?'UNIQUE_INVOICE_HEADER':null,vendorStatus:vendorAccount?'RESOLVED':candidates?.size>1?'AMBIGUOUS':'MISSING'};
 });
}
// Company-wide purchase evidence must be authorized separately from store sales.
export async function readSupplierInvoicePage({userId,start,end,cursor=null},{mode=config.dynamics.mode,company=config.dynamics.dataAreaId,probe=probeDataEntity,get=odataGet,getAll=odataGetAll,read=readAnalyticsCache,write=writeAnalyticsCache,names=vendorNamesMany}={}){
 if(!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>365)throw Object.assign(Error('Période de 1 à 366 jours requise.'),{status:400});
 if(mode!=='live'||!company)return{status:'UNAVAILABLE',items:[],message:'Achats facturés D365 non connectés.',nextCursor:null};
 let state;
 if(cursor){
  if(!/^[0-9a-f-]{36}$/i.test(cursor))throw Object.assign(Error('Curseur invalide.'),{status:400});
  state=await read(cacheKey(cursor));
  if(!state||state.userId!==userId||state.start!==start||state.end!==end||state.company!==company)throw Object.assign(Error('Lecture expirée ou hors périmètre. Relancer.'),{status:409});
  if(state.response)return state.response;
 }else{
  const entity='VendInvoiceTransBiEntities';
  const sample=(await probe(entity,{top:1,filter:`${config.dynamics.dataAreaField} eq '${esc(company)}'`,extra:'cross-company=true'})).rows?.[0];
  const m=fields(sample);
  if(!m.company||!m.id||!m.product||!m.date||!m.invoice||!m.amount||!m.currency)throw fail('La source de factures ne fournit pas le contrat article, fournisseur et montant requis.');
  state={userId,start,end,company,entity,m,continuation:null,visited:[],scanned:0};
 }
 const {m}=state;
 const until=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const filter=`${m.company} eq '${esc(company)}' and ${m.date} ge ${start}T00:00:00Z and ${m.date} lt ${until}T00:00:00Z`;
 const page=await get(state.entity,{filter,select:[...new Set(Object.values(m).filter(Boolean))].join(','),top:null,extra:'cross-company=true',continuation:state.continuation});
 if(!Array.isArray(page?.value))throw fail('Collection de factures invalide.');
 const next=page['@odata.nextLink'];
 if(next&&(typeof next!=='string'||state.visited.includes(next)))throw fail('Pagination de factures incohérente.');
 if(state.scanned+page.value.length>100000)throw fail('Périmètre trop volumineux. Réduire la période.');
 let headers=[];
 if(page.value.some(row=>!m.vendor||!clean(row[m.vendor]))){
  const entity='VendInvoiceJourBiEntities',sample=(await probe(entity,{top:1,filter:`${config.dynamics.dataAreaField} eq '${esc(company)}'`,extra:'cross-company=true'})).rows?.[0],h=fields(sample);
  if(!h.company||!h.invoice||!h.date||!h.vendor)throw fail('Le fournisseur facturant n’est pas exposé sur les lignes ou en-têtes. Aucun fournisseur principal de substitution.');
  const ids=[...new Set(page.value.map(r=>clean(r[m.invoice])))];
  for(let i=0;i<ids.length;i+=30){
   const result=await getAll(entity,{filter:`${h.company} eq '${esc(company)}' and ${h.date} ge ${start}T00:00:00Z and ${h.date} lt ${until}T00:00:00Z and (${ids.slice(i,i+30).map(id=>`${h.invoice} eq '${esc(id)}'`).join(' or ')})`,select:[h.company,h.invoice,h.date,h.vendor].join(','),extra:'cross-company=true',pageSize:1000,maxRows:10000,strict:true});
   if(result.truncated)throw fail('En-têtes de factures incomplets.');
   for(const r of result.value||[]){if(clean(r[h.company]).toUpperCase()!==company.toUpperCase())throw fail('Société de facture incohérente.');headers.push({invoice:clean(r[h.invoice]),date:clean(r[h.date]).slice(0,10),vendor:clean(r[h.vendor])})}
  }
 }
 const items=normalizeSupplierInvoices(page.value,m,{company,start,end,headers});
 const directory=await names([...new Set(items.map(r=>r.vendorAccount).filter(Boolean))]);
 for(const row of items)row.vendorName=directory.get(row.vendorAccount)?.name||null;
 let nextCursor=null;
 if(next){nextCursor=randomUUID();if(!await write(cacheKey(nextCursor),'supplier-invoices-page-v1',{...state,continuation:next,visited:[...state.visited,next],scanned:state.scanned+items.length},1800))throw fail('Stockage de pagination indisponible.');}
 const response={status:'READY',items,nextCursor,scanned:state.scanned+items.length,company,source:'D365/'+state.entity,scope:'COMPANY_NOT_STORE',basis:'Achats HT facturés signés, frais et remises globales non alloués. Ne constitue pas une attribution des ventes aux fournisseurs.'};
 if(cursor)await write(cacheKey(cursor),'supplier-invoices-page-v1',{...state,response},1800);
 return response;
}
