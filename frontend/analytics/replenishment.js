export function classifyProposal(data){
 const {replenishment:plan,storeStock,merchandising}=data;
 if(merchandising?.assortment?.status!=='ASSORTED')return {title:'Assortiment à confirmer',quantity:null};
 if(storeStock?.unavailable||storeStock?.mappingRequired||!Number.isFinite(storeStock?.availableStock))return {title:'Stock magasin à vérifier',quantity:null};
 if(plan?.salesVelocity?.status!=='READY')return {title:'Ventes indisponibles',quantity:null};
 const unit=value=>String(value??'').trim().toUpperCase();
 if(plan.salesVelocity.saleRows>0&&(!unit(data.item?.inventoryUnit)||unit(plan.salesVelocity.quantityUnit)!==unit(data.item.inventoryUnit)))return {title:'Unités de vente et de stock à rapprocher',quantity:null};
 if(plan.decision==='OK')return {title:'Stock suffisant',quantity:null};
 if(['DIRECT_ORDER','REPLENISH','PARTIAL'].includes(plan.decision)&&!Number.isFinite(storeStock.incomingStock))return {title:'Arrivages à confirmer',quantity:null};
 if(plan.decision==='DIRECT_ORDER'&&!plan.inputs?.supplierAccount)return {title:'Fournisseur à confirmer',quantity:null};
 if(Number.isFinite(plan.actionQty)&&plan.actionQty>0){
  if(plan.decision==='DIRECT_ORDER')return {title:'Proposition PO · commande fournisseur',quantity:plan.actionQty};
  if(['REPLENISH','PARTIAL'].includes(plan.decision))return {title:plan.decision==='PARTIAL'?'Proposition TO · transfert partiel':'Proposition TO · transfert entrepôt',quantity:plan.actionQty};
 }
 return {title:plan.presentation?.title||'Besoin à vérifier',quantity:null};
}

export function mountReplenishment(core,host){
 const form=host.querySelector('form'),store=form.elements.namedItem('store'),reference=form.elements.namedItem('reference');
 const status=host.querySelector('[role=status]'),result=host.querySelector('[data-replenishment-result]'),button=form.querySelector('button');
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
  const token=revision,storeId=store.value,code=reference.value.trim();
  if(!code||!core.getSelectedStores().some(s=>s.id===storeId))return;
  button.disabled=true;status.textContent='Lecture du stock, des ventes et de l’assortiment…';
  try{
   const data=await core.api(`/api/stores/${encodeURIComponent(storeId)}/item-assistant/${encodeURIComponent(code)}`);
   if(token!==revision)return;
   const proposal=classifyProposal(data),plan=data.replenishment;
   const heading=document.createElement('h3');heading.textContent=`${data.item.name} · ${proposal.title}`;
   const summary=document.createElement('p');summary.textContent=proposal.quantity===null?'Vérifie les données ci-dessous.': `Quantité proposée : ${core.number(proposal.quantity)} ${data.item.inventoryUnit||''}`;
   const values=document.createElement('dl');
   const fields=[['Stock magasin',data.storeStock?.availableStock],['Arrivages',data.storeStock?.incomingStock],['Stock entrepôt',data.supplyStock?.availableStock],['Unité de stock',data.item.inventoryUnit],['Ventes moyennes sur 7 jours',plan?.salesVelocity?.quantityUnit?plan.salesVelocity.dailySales7:null],['Ventes moyennes sur 28 jours',plan?.salesVelocity?.quantityUnit?plan.salesVelocity.dailySales28:null],['Unité de vente observée',plan?.salesVelocity?.quantityUnit],['Couverture actuelle (jours)',proposal.quantity!==null?plan?.metrics?.coverDays:null],['Couverture cible (jours)',plan?.metrics?.targetDays],['Fournisseur',plan?.inputs?.supplierAccount]];
   for(const [label,value] of fields){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value==null?'Indisponible':typeof value==='number'?core.number(value):String(value);values.append(term,detail);}
   result.replaceChildren(heading,summary,values);status.textContent='';
  }catch(error){if(token===revision)status.textContent=error.message||'Lecture indisponible.';}
  finally{if(token===revision)button.disabled=false;}
 });
 syncStores();
}

if(typeof document!=='undefined'){
 const host=document.getElementById('replenishmentPanel');
 if(host&&window.RETAIL_INTELLIGENCE)mountReplenishment(window.RETAIL_INTELLIGENCE,host);
}
