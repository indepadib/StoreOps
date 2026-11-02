import {config} from '../config.mjs';
import {listDataEntities,probeDataEntity,odataGetAll} from './dynamics.mjs';
import {storeOperationalSettings} from './store-settings.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const clean=v=>String(v??'').trim(),escape=v=>clean(v).replaceAll("'","''"),number=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const domains={counting:'Counting',adjustment:'Adjustment',movement:'Movement'};
const pick=(sample,...names)=>names.find(n=>Object.hasOwn(sample,n))||null;
export function inventoryMapping(sample,entity,domain){
 const m={entity,domain,product:pick(sample,'ItemNumber','ItemId','ProductNumber'),warehouse:pick(sample,'InventoryWarehouseId','WarehouseId','InventLocationId'),date:pick(sample,'TransactionDate','CountingDate','InventoryDate','JournalDate','TransDate'),journal:pick(sample,'JournalBatchNumber','JournalNumber','InventoryJournalNumber','JournalId'),line:pick(sample,'LineNumber','LineNum'),quantity:pick(sample,'InventoryQuantity','AdjustmentQuantity','Quantity'),counted:pick(sample,'CountedQuantity','CountedInventoryQuantity'),theoretical:pick(sample,'OnHandQuantity','OnHandInventoryQuantity'),difference:pick(sample,'CountingDifferenceQuantity','QuantityDifference','VarianceQuantity'),unit:pick(sample,'InventoryUnitSymbol','UnitSymbol','UnitId','InventoryUnitId'),reason:pick(sample,'ReasonCode','InventoryReasonCode','ReasonCodeId'),cost:pick(sample,'CostAmount','InventoryCostAmount'),posted:pick(sample,'IsPosted','Posted','JournalStatus'),description:pick(sample,'ItemName','ProductName','Description')};
 if(!m.product||!m.warehouse||!m.date||!m.journal)throw Object.assign(new Error('Article, dépôt, date réelle ou journal non exposé : lecture magasin non prouvée.'),{code:'INVENTORY_SCOPE_UNPROVEN'});
 const date=clean(sample[m.date]);if(!/^\d{4}-\d{2}-\d{2}/.test(date))throw Object.assign(new Error('Type de date du journal non observable.'),{code:'INVENTORY_DATE_UNPROVEN'});
 m.dateTime=date.includes('T');return m;
}
export function inventoryJournalRow(row,m,store){
 const posted=m.posted?clean(row[m.posted]).split('.').pop().replaceAll("'",'').toUpperCase():null;
 const counted=m.counted?number(row[m.counted]):null,theoretical=m.theoretical?number(row[m.theoretical]):null;
 return{source:'DYNAMICS',domain:m.domain,storeId:store.id,storeName:store.name,warehouse:clean(row[m.warehouse]),date:clean(row[m.date]).slice(0,10),journal:clean(row[m.journal]),line:m.line?row[m.line]:null,productNumber:clean(row[m.product]),productName:m.description?clean(row[m.description]):'',quantity:m.quantity?number(row[m.quantity]):null,counted,theoretical,difference:m.difference?number(row[m.difference]):counted!=null&&theoretical!=null?counted-theoretical:null,unit:m.unit?clean(row[m.unit]):null,reason:m.reason?clean(row[m.reason]):null,costAmount:m.cost?number(row[m.cost]):null,posted:posted==null?null:/^(YES|TRUE|1|POSTED)$/.test(posted)?true:/^(NO|FALSE|0|DRAFT|NOTPOSTED)$/.test(posted)?false:null};
}
async function discover(domain,deps){
 const k=analyticsCacheKey('inventory-journal-schema-v1',[config.dynamics.baseUrl,config.dynamics.dataAreaId,domain]),hit=await deps.read(k);if(hit?.unavailable)throw Object.assign(new Error(hit.message),{code:'DYNAMICS_INVENTORY_NOT_EXPOSED',details:hit.details});if(hit)return hit;
 const catalog=await deps.list(domains[domain]),candidates=catalog.map(r=>{const props=Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),v]));return clean(props.publiccollectionname||props.entitysetname)}).filter(n=>/invent/i.test(n)&&/journal/i.test(n)&&!/(header|name|reason|composite)/i.test(n)&&/^[A-Za-z0-9_]+$/.test(n)).sort((a,b)=>Number(/lines|entries/i.test(b))-Number(/lines|entries/i.test(a)));
 const errors=[];
 for(const entity of [...new Set(candidates)].slice(0,3))try{const r=await deps.probe(entity,{top:1,filter:deps.company,extra:'cross-company=true'});if(!r.ok||!r.rows?.length){errors.push('Aucune ligne témoin accessible pour '+entity);continue}const mapping=inventoryMapping(r.rows[0],entity,domain);await deps.write(k,'inventory-journal-schema-v1',mapping,86400);return mapping}catch(e){errors.push(e.code||'SCHEMA_NOT_READABLE')}
 const message=candidates.length?'Journal identifié, mais dépôt/date/champs non lisibles ou accès refusé.':'Aucune collection publique de journal '+domains[domain]+' trouvée dans les métadonnées Dynamics.';await deps.write(k,'inventory-journal-schema-v1',{unavailable:true,message,details:errors},120);throw Object.assign(new Error(message),{code:'DYNAMICS_INVENTORY_NOT_EXPOSED',details:errors});
}
export async function readDynamicsInventory(stores,input,deps={}){
 const domain=clean(input.domain),start=clean(input.start),end=clean(input.end),valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 if(!domains[domain]||!valid(start)||!valid(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>365)throw Object.assign(new Error('Type de journal et période valides requis (366 jours maximum).'),{status:400});
 if(stores.length!==1)throw Object.assign(new Error('La lecture des journaux se fait magasin par magasin.'),{status:400});
 const store=stores[0],warehouse=deps.warehouse||storeOperationalSettings(store.id).storeWarehouseId;
 const result={source:'DYNAMICS',domain,storeId:store.id,storeName:store.name,warehouseId:warehouse,period:{start,end},rows:[],complete:false,checkedAt:new Date().toISOString(),basis:'Journaux Dynamics uniquement. Un mouvement ou ajustement négatif ne constitue pas automatiquement une démarque. Les quantités de références différentes ne sont pas additionnées. Sans statut comptabilisé exposé, aucun total financier définitif.'};
 if(!warehouse)return{...result,status:'UNMAPPED',message:'Dépôt magasin non configuré.'};
 if(!deps.list&&config.dynamics.mode!=='live')return{...result,status:'UNAVAILABLE',message:'Connexion Dynamics réelle requise.'};
 const area=deps.dataAreaId||config.dynamics.dataAreaId;if(!area)return{...result,status:'UNMAPPED',message:'Société Dynamics non configurée ; lecture interdite sans périmètre prouvé.'};const company=area?`${config.dynamics.dataAreaField} eq '${escape(area)}'`:'';
 const io={list:deps.list||listDataEntities,probe:deps.probe||probeDataEntity,get:deps.get||odataGetAll,read:deps.read||readAnalyticsCache,write:deps.write||writeAnalyticsCache,company};
 const key=analyticsCacheKey('inventory-journal-report-v1',[config.dynamics.baseUrl,area,domain,store.id,warehouse,start,end]),cached=await io.read(key);if(cached&&input.force!=='1')return{...cached,storeId:store.id,storeName:store.name,cached:true};
 try{const m=deps.mapping||await discover(domain,io),from=start+(m.dateTime?'T00:00:00Z':''),until=new Date(end+'T12:00:00Z');until.setUTCDate(until.getUTCDate()+1);const next=until.toISOString().slice(0,10)+(m.dateTime?'T00:00:00Z':'');
 const filter=[company,`${m.warehouse} eq '${escape(warehouse)}'`,`${m.date} ge ${from}`,`${m.date} lt ${next}`].filter(Boolean).join(' and '),fields=[...new Set(Object.entries(m).filter(([k,v])=>!['entity','domain','dateTime'].includes(k)&&v).map(([,v])=>v))];
 const payload=await io.get(m.entity,{filter,select:fields.join(','),extra:'cross-company=true'+(m.line?`&$orderby=${m.journal},${m.line}`:''),pageSize:500,maxRows:5000});
 const rows=(payload.value||[]).filter(r=>clean(r[m.warehouse])===clean(warehouse)&&clean(r[m.date]).slice(0,10)>=start&&clean(r[m.date]).slice(0,10)<=end).map(r=>inventoryJournalRow(r,m,store));
 const response={...result,status:payload.truncated?'PARTIAL':'READY',complete:!payload.truncated,entity:m.entity,rows,message:payload.truncated?'Lecture limitée à 5 000 lignes ; réduire la période.':rows.length?'Journaux lus dans Dynamics.':'Aucun journal dans Dynamics sur ce dépôt et cette période.',fields:{posted:!!m.posted,reason:!!m.reason,cost:!!m.cost,unit:!!m.unit,counted:!!m.counted,theoretical:!!m.theoretical}};await io.write(key,'inventory-journal-report-v1',response,300);return response;
 }catch(e){const response={...result,status:'UNAVAILABLE',code:e.code||'DYNAMICS_INVENTORY_READ_FAILED',message:e.code==='DYNAMICS_INVENTORY_NOT_EXPOSED'?e.message:'Lecture des journaux Dynamics indisponible : accès ou structure à vérifier.',details:e.details||[]};await io.write(key,'inventory-journal-report-v1',response,120);return response;}
}
