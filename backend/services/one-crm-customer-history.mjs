import {attachParentSalesEligibility,parentSaleEligible} from './sales-parent-transactions.mjs';
const SOURCE='D365/RetailTransactionSalesTransBIEntities';
const clean=v=>String(v??'').trim();
const valid=v=>typeof v==='string'&&v.length>0&&v.length<=160&&!/[\x00-\x1f]/.test(v);
const field=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(v||'');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const money=v=>Math.round(v*100)/100;
const identity={company:'dataAreaId',store:'store',terminal:'terminalId',transaction:'transactionId'};
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const anonymous=new Set(['','0','ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN']);
const unavailable=reason=>({status:'UNAVAILABLE',reason,activationEnabled:false});
export async function readCustomerPositiveHistory({accountRef,company,stores,page},{readCollection,salesConfig,settings,amount,eligible,now=()=>new Date().toISOString()}){
 if(!valid(accountRef)||anonymous.has(accountRef.toUpperCase())||!valid(company)||!Array.isArray(stores)||!stores.length||stores.length>2||!Number.isSafeInteger(page)||page<1)return unavailable('INVALID_HISTORY_SCOPE');
 try{
  const mappings=stores.map(s=>{
   const cfg=salesConfig(s.id),d=settings(s.id)?.d365,storeNumber=clean(d?.storeNumber),f=cfg?.fields||{};
   if(!cfg?.ready||cfg.entity!=='RetailTransactionSalesTransBIEntities'||f.store!=='store'||!valid(storeNumber)||clean(d?.legalEntityId)!==company||![f.customer,f.date,f.product,f.net,f.quantity].every(field)||Object.values(f).filter(Boolean).some(v=>!field(v)))throw Error('Mapping not verified');
   return {storeId:s.id,storeNumber,cfg,f};
  });
  if(new Set(mappings.map(m=>m.storeNumber)).size!==mappings.length)throw Error('Duplicate store mapping');
  const tickets=[];
  for(const {storeId,storeNumber,cfg,f} of mappings){
   const base="dataAreaId eq "+quote(company)+" and store eq "+quote(storeNumber);
   const select=[...new Set([...Object.values(identity),f.customer,f.date,f.product,f.net,f.quantity,f.salesUnit||'unit',f.name,f.taxAmount,f.status,f.returnNoSale,f.taxItemGroup,'discAmount'].filter(Boolean))].join(',');
   const rows=await readCollection('RetailTransactionSalesTransBIEntities',{filter:base+' and '+f.customer+' eq '+quote(accountRef),select,extra:'cross-company=true'});
   if(!Array.isArray(rows)||rows.length>10000)throw Error('History bound');
   const keys=new Map();
   for(const r of rows){
    const terminal=clean(r.terminalId),tx=clean(r.transactionId),date=clean(r[f.date]).slice(0,10);
    if(clean(r.dataAreaId)!==company||clean(r.store)!==storeNumber||clean(r[f.customer])!==accountRef||!valid(terminal)||!valid(tx)||!day(date)||!valid(clean(r[f.product]))||r[f.net]==null||clean(r[f.net])===''||!Number.isFinite(Number(r[f.net])))throw Error('Source partition invalid');
    const key=JSON.stringify([terminal,tx]);
    if(keys.has(key)&&keys.get(key).date!==date)throw Error('Ambiguous parent identity across days');
    keys.set(key,{terminal,tx,date});
   }
   if(keys.size>500)throw Error('History parent bound');
   const headers=[],pairs=[...keys.values()];
   for(let i=0;i<pairs.length;i+=20){
    const disjunction=pairs.slice(i,i+20).map(k=>'(terminal eq '+quote(k.terminal)+' and transactionId eq '+quote(k.tx)+')').join(' or ');
    const part=await readCollection('RetailTransactionTableBIEntities',{filter:base+' and ('+disjunction+')',select:'dataAreaId,store,terminal,transactionId,type,entryStatus',extra:'cross-company=true'});
    if(!Array.isArray(part)||part.some(h=>clean(h.dataAreaId)!==company||clean(h.store)!==storeNumber||!keys.has(JSON.stringify([clean(h.terminal),clean(h.transactionId)]))))throw Error('Parent partition invalid');
    headers.push(...part);
   }
   const groups=new Map();
   for(const r of attachParentSalesEligibility(rows,headers,identity)){
    if(!r[parentSaleEligible]||!eligible(r,cfg))continue;
    const terminal=clean(r.terminalId),transactionRef=clean(r.transactionId),date=clean(r[f.date]).slice(0,10),key=JSON.stringify([terminal,transactionRef,date]),value=amount(r,cfg);
    if(!Number.isFinite(value)||value<=0||!Number.isSafeInteger(Math.round(value*100)))throw Error('Invalid amount');
    const group=groups.get(key)||{storeId,date,transactionRef,terminal,positiveTtc:0,items:new Map()};
    const productNumber=clean(r[f.product]),unit=clean(r[f.salesUnit||'unit'])||null,itemKey=JSON.stringify([productNumber,unit]),quantity=r[f.quantity]==null||clean(r[f.quantity])===''?null:Math.abs(Number(r[f.quantity]));
    if(quantity!==null&&!Number.isFinite(quantity))throw Error('Invalid quantity');
    const item=group.items.get(itemKey)||{productNumber,productName:f.name?clean(r[f.name])||null:null,unit,quantity:0,positiveTtc:0};
    item.quantity=item.quantity===null||quantity===null?null:item.quantity+quantity;item.positiveTtc+=value;group.positiveTtc+=value;group.items.set(itemKey,item);groups.set(key,group);
   }
   for(const g of groups.values()){if(g.items.size>500)throw Error('Ticket bound');tickets.push({...g,positiveTtc:money(g.positiveTtc),items:[...g.items.values()].map(x=>({...x,positiveTtc:money(x.positiveTtc)}))})}
  }
  tickets.sort((a,b)=>b.date.localeCompare(a.date)||a.storeId.localeCompare(b.storeId)||a.transactionRef.localeCompare(b.transactionRef)||a.terminal.localeCompare(b.terminal));
  const totalTickets=tickets.length,positiveTtc=money(tickets.reduce((n,t)=>n+t.positiveTtc,0));
  if(!Number.isSafeInteger(Math.round(positiveTtc*100))||page>Math.max(1,Math.ceil(totalTickets/20)))return unavailable('HISTORY_PAGE_UNAVAILABLE');
  return {status:'READY',accountRef,source:SOURCE,scope:'APPROVED_PILOT_STORES',storeIds:mappings.map(m=>m.storeId),basis:'POSITIVE_ACCOUNT_LINES_EXCLUDES_RETURNS',currency:'MAD',checkedAt:now(),financialReconciliation:'NOT_VERIFIED',totalTickets,positiveTtc,firstPurchase:totalTickets?tickets.at(-1).date:null,lastPurchase:totalTickets?tickets[0].date:null,page,pageSize:20,rows:tickets.slice((page-1)*20,page*20).map(({terminal,...r})=>r),activationEnabled:false};
 }catch{return unavailable('HISTORY_SOURCE_UNAVAILABLE')}
}
