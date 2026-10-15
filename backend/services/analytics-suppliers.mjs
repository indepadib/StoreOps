import {db} from '../db.mjs';
import {listExpectedPurchaseOrders} from './dynamics-receiving.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';

const clean=v=>String(v??'').trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const normalize=v=>clean(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const run=async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},run));
  return out
}
function addQty(map,unit,value){const u=clean(unit).toUpperCase()||'N/A';map[u]=(map[u]||0)+num(value)}
function controlledSupplierQuality(storeIds=[],days=90){
  if(!storeIds.length)return[];
  const placeholders=storeIds.map(()=>'?').join(','),rows=db.prepare(`
    SELECT r.vendor,
           COUNT(rl.id) AS line_count,
           SUM(CASE WHEN rl.ordered_qty>0 AND rl.accepted_qty IS NOT NULL THEN 1 ELSE 0 END) AS valued_lines,
           AVG(CASE WHEN rl.ordered_qty>0 AND rl.accepted_qty IS NOT NULL
             THEN MIN(1.0,MAX(0.0,rl.accepted_qty/rl.ordered_qty)) END) AS service_ratio,
           AVG(CASE WHEN rl.delivered_qty>0 AND rl.accepted_qty IS NOT NULL
             THEN MIN(1.0,MAX(0.0,rl.accepted_qty/rl.delivered_qty)) END) AS acceptance_ratio
    FROM receipts r
    JOIN receipt_lines rl ON rl.receipt_id=r.id
    LEFT JOIN quality_controls qc ON qc.id=rl.quality_control_id
    WHERE r.store_id IN (${placeholders})
      AND rl.quality_control_id IS NOT NULL
      AND COALESCE(qc.created_at,r.posted_at,CURRENT_TIMESTAMP) >= datetime('now',?)
    GROUP BY r.vendor
  `).all(...storeIds,`-${Math.max(7,Math.min(365,days))} days`);
  return rows.map(r=>({vendorName:r.vendor,lineCount:num(r.line_count),valuedLines:num(r.valued_lines),serviceRate:r.service_ratio==null?null:round2(num(r.service_ratio)*100),acceptanceRate:r.acceptance_ratio==null?null:round2(num(r.acceptance_ratio)*100)}))
}

export async function readSupplierOperations(stores=[],{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
  const ids=(stores||[]).map(s=>s.id).filter(Boolean),key=analyticsCacheKey('suppliers-ops-v1',[ids.sort().join(','),businessDate]);
  if(!force){const hit=await readAnalyticsCache(key);if(hit)return{...hit,cache:{status:'PERSISTENT_HIT'}}}
  const snapshots=await mapLimit(stores||[],1,async store=>{
    try{
      const data=await listExpectedPurchaseOrders(store.id,{businessDate});
      return{storeId:store.id,storeName:store.name,status:data?.mode||'UNAVAILABLE',items:data?.items||[],diagnostics:data?.diagnostics||null}
    }catch(error){
      return{storeId:store.id,storeName:store.name,status:'ERROR',items:[],error:{code:error?.code||'SUPPLIER_PO_READ_FAILED',message:error?.message||String(error)}}
    }
  });
  const vendors=new Map();
  for(const snapshot of snapshots)for(const po of snapshot.items||[]){
    const account=clean(po.vendorAccount),name=clean(po.vendorName||po.vendor)||account||'Fournisseur',key=account||normalize(name);
    const cur=vendors.get(key)||{vendorKey:key,vendorAccount:account||null,vendorName:name,openPoCount:0,openLines:0,remainingByUnit:{},orderedByUnit:{},knownProgressLines:0,progressSum:0,stores:new Set()};
    cur.openPoCount++;cur.stores.add(snapshot.storeId);
    for(const line of po.lines||[]){
      cur.openLines++;
      addQty(cur.orderedByUnit,line.unit,line.orderedQty);
      addQty(cur.remainingByUnit,line.unit,line.remainingQty);
      if(line.remainingQty!=null&&num(line.orderedQty)>0){
        cur.knownProgressLines++;
        cur.progressSum+=Math.max(0,Math.min(1,(num(line.orderedQty)-num(line.remainingQty))/num(line.orderedQty)))
      }
    }
    vendors.set(key,cur)
  }
  const controlled=controlledSupplierQuality(ids,90),byName=new Map(controlled.map(x=>[normalize(x.vendorName),x]));
  const items=[...vendors.values()].map(x=>{
    const historical=byName.get(normalize(x.vendorName))||null;
    return{vendorKey:x.vendorKey,vendorAccount:x.vendorAccount,vendorName:x.vendorName,openPoCount:x.openPoCount,openLines:x.openLines,orderedByUnit:x.orderedByUnit,remainingByUnit:x.remainingByUnit,openLineProgressPct:x.knownProgressLines?round2(x.progressSum/x.knownProgressLines*100):null,serviceRate90d:historical?.serviceRate??null,acceptanceRate90d:historical?.acceptanceRate??null,serviceCoverageLines:historical?.valuedLines??0,storeCount:x.stores.size}
  }).sort((a,b)=>b.openPoCount-a.openPoCount||a.vendorName.localeCompare(b.vendorName,'fr'));
  // Include suppliers with controlled receipt history even if they have no open PO.
  for(const h of controlled)if(!items.some(x=>normalize(x.vendorName)===normalize(h.vendorName)))items.push({vendorKey:normalize(h.vendorName),vendorAccount:null,vendorName:h.vendorName,openPoCount:0,openLines:0,orderedByUnit:{},remainingByUnit:{},openLineProgressPct:null,serviceRate90d:h.serviceRate,acceptanceRate90d:h.acceptanceRate,serviceCoverageLines:h.valuedLines,storeCount:null});
  const value={status:'READY',businessDate,items,snapshots:snapshots.map(x=>({storeId:x.storeId,storeName:x.storeName,status:x.status,diagnostics:x.diagnostics,error:x.error||null})),serviceDefinition:'Moyenne par ligne contrôlée de accepted_qty / ordered_qty sur 90 jours. Affichée uniquement avec couverture.',generatedAt:new Date().toISOString()};
  await writeAnalyticsCache(key,'suppliers-ops-v1',value,900);
  return{...value,cache:{status:'MISS'}}
}
