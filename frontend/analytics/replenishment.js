import {calculateMinMax,mountMinMax} from './replenishment-minmax.js';

export function classifyProposal(data,reviewDays=2){
 const {replenishment:plan,storeStock,merchandising}=data;
 if(merchandising?.assortment?.status!=='ASSORTED')return {title:'Assortiment à confirmer',quantity:null};
 if(storeStock?.unavailable||storeStock?.mappingRequired||!Number.isFinite(storeStock?.availableStock))return {title:'Stock magasin à vérifier',quantity:null};
 if(plan?.salesVelocity?.status!=='READY')return {title:'Ventes indisponibles',quantity:null};
 const unit=value=>String(value??'').trim().toUpperCase();
 if(plan.salesVelocity.saleRows>0&&(!unit(data.item?.inventoryUnit)||unit(plan.salesVelocity.quantityUnit)!==unit(data.item.inventoryUnit)))return {title:'Unités de vente et de stock à rapprocher',quantity:null};
 if(plan.inputs?.supplyMode!=='WAREHOUSE')return {title:'Approvisionnement entrepôt à confirmer',quantity:null};
 if(!Number.isFinite(storeStock.incomingStock))return {title:'Arrivages à confirmer',quantity:null};
 if(storeStock.incomingStock>0)return {title:'Dates des arrivages à confirmer dans le calculateur',quantity:null};
 if(!Number.isFinite(data.supplyStock?.availableStock))return {title:'Stock entrepôt indisponible',quantity:null};
 if(!Number.isFinite(plan.metrics?.adjustedDailyVelocity))return {title:'Consommation moyenne indisponible',quantity:null};
 if(!data.item?.inventoryUnit)return {title:'Unité de stock indisponible',quantity:null};
 const {leadTimeDays,safetyDays,packSize}=plan.inputs;
 const calculation=calculateMinMax({mode:'TO',usage:plan.metrics.adjustedDailyVelocity,leadDays:leadTimeDays,safetyDays,reviewDays,available:storeStock.availableStock,inbound:storeStock.incomingStock,pack:packSize,sourceAvailable:data.supplyStock.availableStock});
 const title=calculation.quantity>0?(calculation.shortfall>0?'Proposition TO partielle':'Proposition TO · entrepôt vers magasin'):calculation.need>0?'Besoin magasin · entrepôt insuffisant':'Stock suffisant';
 return {title,quantity:calculation.quantity||null,calculation};
}

export function parseReferences(value){
 const codes=[...new Set(String(value).toUpperCase().split(/[\s,;]+/).filter(Boolean))];
 if(!codes.length||codes.length>10)throw new Error('Saisis entre 1 et 10 références.');
 if(codes.some(code=>!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(code)))throw new Error('Vérifie les codes internes ou EAN saisis.');
 return codes;
}

export async function readShortlist(codes,read,{current=()=>true,progress=()=>{},reviewDays=2}={}){
 const rows=[],seen=new Set();
 for(const [index,code] of codes.entries()){
  if(!current())break;
  progress(index+1,codes.length,code);
  try{
   const data=await read(code);
   if(!current())break;
   const sku=String(data.item.productNumber||code).toUpperCase();
   if(!seen.has(sku)){const proposal=classifyProposal(data,reviewDays);seen.add(sku);rows.push({code,data,proposal});}
  }catch(error){if(current())rows.push({code,error:error.message||'Lecture indisponible.'});}
 }
 return rows.sort((a,b)=>Number(b.proposal?.quantity!=null)-Number(a.proposal?.quantity!=null));
}

export function mountReplenishment(core,host){
 const form=host.querySelector('[data-replenishment-form]'),store=form.elements.namedItem('store'),reference=form.elements.namedItem('reference');
 const status=host.querySelector('[data-replenishment-status]'),result=host.querySelector('[data-replenishment-result]'),button=form.querySelector('button');
 let revision=0;
 function clear(){revision++;status.textContent='';result.replaceChildren();button.disabled=false;}
 function syncStores(){
  const previous=store.value;
  const stores=core.getSelectedStores();
  const option=document.createElement('option');option.value='';option.textContent='Choisir un magasin';
  const choices=stores.map(({id,name})=>{const item=document.createElement('option');item.value=id;item.textContent=name;return item;});
  store.replaceChildren(option,...choices);
  store.value=stores.length===1?stores[0].id:stores.some(s=>s.id===previous)?previous:'';
  clear();
 }
 document.addEventListener('retail-intelligence:period',syncStores);
 document.addEventListener('retail-intelligence:data',syncStores);
 form.addEventListener('input',clear);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  clear();
  const token=revision,storeId=store.value;
  if(!core.getSelectedStores().some(s=>s.id===storeId))return;
  button.disabled=true;
  try{
   const codes=parseReferences(reference.value);
   const rows=await readShortlist(codes,code=>core.api(`/api/stores/${encodeURIComponent(storeId)}/item-assistant/${encodeURIComponent(code)}`,{noRetry:true}),{
    current:()=>token===revision,
    reviewDays:Number(form.elements.namedItem('reviewDays').value),
    progress:(index,total,code)=>{status.textContent=`${index}/${total} · Lecture de ${code}…`;}
   });
   if(token!==revision)return;
   for(const row of rows){
    if(row.error){const warning=document.createElement('p');warning.textContent=`${row.code} · ${row.error}`;result.append(warning);continue;}
    const {data,proposal}=row,plan=data.replenishment;
    const item=document.createElement('details');item.open=rows.length===1;
    const heading=document.createElement('summary');heading.textContent=`${data.item.name} · ${proposal.title}${proposal.quantity===null?'':` · ${core.number(proposal.quantity)} ${data.item.inventoryUnit||''}`}`;
   const values=document.createElement('dl');
   const fields=[['Stock magasin',data.storeStock?.availableStock],['Arrivages',data.storeStock?.incomingStock],['Stock entrepôt',data.supplyStock?.availableStock],['Unité de stock',data.item.inventoryUnit],['Ventes moyennes sur 7 jours',plan?.salesVelocity?.quantityUnit?plan.salesVelocity.dailySales7:null],['Ventes moyennes sur 28 jours',plan?.salesVelocity?.quantityUnit?plan.salesVelocity.dailySales28:null],['Consommation moyenne retenue',proposal.calculation?plan.metrics.adjustedDailyVelocity:null],['Délai de transfert (jours)',plan?.inputs?.leadTimeDays],['Minimum',proposal.calculation?.min],['Maximum',proposal.calculation?.max],['Stock avec arrivages',proposal.calculation?.position],['Besoin restant après transfert',proposal.calculation?.shortfall]];
   for(const [label,value] of fields){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value==null?'Indisponible':typeof value==='number'?core.number(value):String(value);values.append(term,detail);}
    item.append(heading,values);result.append(item);
   }
   const proposed=rows.filter(row=>row.proposal?.quantity!=null).length;
   const unavailable=rows.filter(row=>row.error).length;
   status.textContent=`${proposed} proposition(s) · ${rows.length-unavailable} article(s) analysé(s)${unavailable?` · ${unavailable} lecture(s) en échec`:''}`;
  }catch(error){if(token===revision)status.textContent=error.message||'Lecture indisponible.';}
  finally{if(token===revision)button.disabled=false;}
 });
 syncStores();
}

if(typeof document!=='undefined'){
 const host=document.getElementById('replenishmentPanel');
 if(host&&window.RETAIL_INTELLIGENCE)mountReplenishment(window.RETAIL_INTELLIGENCE,host);
 const calculator=document.getElementById('replenishmentCalculator');
 if(calculator&&window.RETAIL_INTELLIGENCE)mountMinMax(calculator,window.RETAIL_INTELLIGENCE.number);
}
