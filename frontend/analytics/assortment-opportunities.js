import {mountAnalysisGrid} from './analysis-grid.js';
import {buildAssortmentOpportunities,assortmentMode} from './assortment-opportunities-model.js';
import {readAssortmentPeriod} from './assortment-period.js';
import {analyticalProductCode} from './product-history.js';
const columns=[
 ['productNumber','Code article'],['productName','Article'],['sourceSales','CA source',true],['sourceDaily','CA source / jour',true],['targetSales','CA cible',true],['historyReading','Historique réception cible'],['department','Département'],['reading','Lecture métier'],['action','Piste à vérifier'],
 ['rayon','Rayon',false,true],['family','Famille',false,true],['subfamily','Sous-famille',false,true],['subsubfamily','Sous-sous-famille',false,true],['vendor','Fournisseur principal actuel',false,true],['origin','Origine fournisseur actuelle',false,true],['targetDaily','CA cible / jour',true,true],['sourceQuantities','Quantités source par unité',false,true],['targetQuantities','Quantités cible par unité',false,true],['firstReceiptDate','Première réception datée cible',false,true],['codes','Codes de vente rapprochés',false,true]
].map(([key,label,numeric,optional])=>({key,label,numeric:!!numeric,optional:!!optional}));
export function mountAssortmentOpportunities(){
 const core=window.RETAIL_INTELLIGENCE,host=document.getElementById('detentionViews');if(!core||!host)return;
 const panel=document.createElement('section');panel.className='assortment-opportunities';
 panel.innerHTML='<header><span class="studio-kicker">ASSORTIMENT ENTRE MAGASINS</span><h2>Ce qui se vend ici et manque à l’historique de l’autre magasin</h2><p>Comparer une demande observée à un historique de réception. Les ventes source ne sont pas une prévision de ventes pour le magasin cible.</p></header><div class="analysis-grid-tools"><label>Magasin source<select data-source></select></label><button type="button" data-swap>Inverser</button><label>Magasin cible<select data-target></select></label><label><input type="checkbox" data-target-sales> Lire aussi les ventes cible</label><button type="button" data-load>Analyser la période sélectionnée</button><button type="button" data-cancel hidden>Annuler</button></div><p class="studio-note">Les deux magasins ci-dessus définissent cette comparaison, parmi vos magasins autorisés. Les dates du filtre global s’appliquent. Sans lecture des ventes cible, leur montant reste N/D. La réception est recherchée dans tout l’historique accessible, sans filtre de date.</p><p data-status role="status"></p><div class="analysis-grid-tools"><label>Lecture<select data-mode><option value="NO_RECEIPT">Vendus source · sans réception historique cible</option><option value="BOTH_SELL">Vendus dans les deux magasins</option><option value="RECEIVED_NO_SALES">Reçus cible · aucune vente sur la période</option><option value="CONTRADICTION">Vendus cible · sans réception retrouvée</option><option value="UNKNOWN">Historique cible incomplet</option><option value="ALL">Tous les articles observés</option></select></label><button type="button" data-history>Relire l’historique cible</button><button type="button" data-catalog>Compléter libellés et hiérarchie</button></div><p data-summary role="status"></p><div data-grid></div><details><summary>Sources, limites et règles de décision</summary><p>Sans réception signifie absent de l’historique accessible des achats et transferts confirmés. Cela ne certifie pas une absence depuis l’ouverture. Un historique incomplet suspend ce classement. Un article avec des ventes et retours qui se compensent n’est pas un invendu. Un article sans vente n’est pas nécessairement en stock : la disponibilité actuelle doit être vérifiée séparément. Les anciens et nouveaux codes du jus d’orange sont rapprochés. Les quantités gardent leurs unités ; aucun total g/kg/PC mélangé. Le fournisseur et l’origine viennent de la fiche actuelle, pas d’une attribution historique des achats. Une opportunité d’assortiment n’est ni une autorisation ni une quantité de PO/TO : vérifier assortiment autorisé, cycle de vie, demande locale, stock, arrivages, délai, colisage, capacité et budget.</p></details>';
 host.prepend(panel);const el=q=>panel.querySelector(q),catalog=new Map();
 let generation=0,controller=null,snapshot=null,timer;
 const grid=mountAnalysisGrid(el('[data-grid]'),{columns,onChange:rows=>{const ca=rows.reduce((n,r)=>n+r.sourceSales,0);el('[data-summary]').textContent=snapshot?`${rows.length} articles filtrés · CA observé source ${core.money(ca)} sur ${snapshot.start} → ${snapshot.end}. Aucun potentiel cible extrapolé.`:'Lancer une analyse pour afficher les articles.'}});
 const shops=()=>core.getState().stores||[];
 function populate(){const previous=[el('[data-source]').value,el('[data-target]').value],stores=shops();for(const [index,key] of ['source','target'].entries()){const select=el(`[data-${key}]`);select.replaceChildren(...stores.map(store=>new Option(store.name,store.id)));select.value=stores.some(s=>s.id===previous[index])?previous[index]:stores.some(s=>s.id===(index?'trefle':'val-fleuri'))?(index?'trefle':'val-fleuri'):stores[index]?.id||''}}
 function clear(){generation++;controller?.abort();controller=null;snapshot=null;clearTimeout(timer);grid.setRows([]);el('[data-load]').disabled=false;el('[data-history]').disabled=false;el('[data-catalog]').disabled=false;el('[data-cancel]').hidden=true;el('[data-status]').textContent='Choisir les deux magasins puis lancer l’analyse. Le résultat n’utilise pas le stock nul comme preuve d’absence historique.'}
 function context(){return{'Magasin source':shops().find(s=>s.id===snapshot.source)?.name||snapshot.source,'Magasin cible':shops().find(s=>s.id===snapshot.target)?.name||snapshot.target,'Début ventes':snapshot.start,'Fin ventes':snapshot.end,'Lecture métier':el('[data-mode]').selectedOptions[0].textContent,'Ventes cible':snapshot.targetSales?'Complètes sur la période':'Non lues','Historique cible':snapshot.history?.complete?'Toutes les lignes accessibles préparées':'Incomplet','Historique vérifié le':snapshot.history?.checkedAt||'N/D','Limite historique':'Archives depuis ouverture non certifiées','Source ventes':snapshot.salesSource||'D365 ventes magasin','Généré le':snapshot.generatedAt}}
 function render(){if(!snapshot)return;
  for(const option of el('[data-mode]').options)option.disabled=(['BOTH_SELL','RECEIVED_NO_SALES','CONTRADICTION'].includes(option.value)&&!snapshot.targetSales)||(option.value==='UNKNOWN'&&snapshot.history?.complete===true);
  if(!snapshot.targetSales&&['BOTH_SELL','RECEIVED_NO_SALES','CONTRADICTION'].includes(el('[data-mode]').value))el('[data-mode]').value='NO_RECEIPT';
  if(!snapshot.history?.complete&&el('[data-mode]').value==='NO_RECEIPT')el('[data-mode]').value='UNKNOWN';
  if(snapshot.history?.complete&&el('[data-mode]').value==='UNKNOWN')el('[data-mode]').value='NO_RECEIPT';
  const rows=buildAssortmentOpportunities({...snapshot,catalog});grid.setRows(rows.filter(row=>assortmentMode(row,el('[data-mode]').value)),context())}
 function current(own){return own===generation}
 async function readHistory(target,own,signal,force=false){
  const query=new URLSearchParams({storeId:target,kind:'store'}),read=()=>core.api('/api/analytics/detention/history?'+query,{noRetry:true,signal});
  const existing=await read();if(!current(own)||existing.complete&&!force)return existing;
  let cursor=0,token=null,steps=0;const seen=new Set();
  do{if(++steps>250||seen.has(cursor))throw Error('Pagination de réception incohérente.');seen.add(cursor);
   const q=new URLSearchParams({storeId:target,kind:'store',cursor:String(cursor)});if(token)q.set('snapshot',token);
   if(force&&cursor===0&&!token)q.set('force','1');
   const page=await core.api('/api/analytics/detention/history/prepare?'+q,{noRetry:true,signal});if(!current(own))return existing;
   token=page.snapshot;cursor=page.nextCursor;el('[data-status]').textContent='Historique cible · '+(page.scanned||0)+' lignes examinées';
  }while(cursor!=null);
  const prepared=await read();if(current(own))document.dispatchEvent(new CustomEvent('retail-intelligence:detention-history-ready',{detail:{storeId:target}}));return prepared;
 }
 async function run(){
  clear();populate();const own=generation,state=core.getState(),source=el('[data-source]').value,target=el('[data-target]').value,start=state.periodStart,end=state.periodEnd,includeTarget=el('[data-target-sales]').checked;
  if(!source||!target||source===target){el('[data-status]').textContent='Choisir deux magasins différents.';return}
  controller=new AbortController();const abort=controller;el('[data-load]').disabled=true;el('[data-cancel]').hidden=false;
  try{
   const history=await readHistory(target,own,abort.signal);if(!current(own))return;
   const sales=await readAssortmentPeriod({start,end,storeIds:includeTarget?[source,target]:[source],signal:abort.signal,read:(job,signal)=>core.api('/api/analytics/assortment/sales?'+new URLSearchParams({storeId:job.storeId,start:job.start,end:job.end}),{noRetry:true,signal}),onProgress:({done,total})=>{if(current(own))el('[data-status]').textContent=`Lecture ventes ${done} / ${total} tranches · aucun total partiel publié.`}});
   if(!current(own))return;snapshot={source,target,start,end,sourceSales:sales.get(source),targetSales:includeTarget?sales.get(target):null,history,generatedAt:new Date().toISOString()};render();
   el('[data-status]').textContent=history.complete?'Ventes complètes et historique cible préparé. Utiliser les lectures métier et filtres de colonnes ; l’export inclut toutes les lignes sélectionnées.':'Ventes complètes, historique cible incomplet : aucun classement « sans réception » validé. Compléter l’historique ou sélectionner la lecture « Historique cible incomplet ».';
  }catch(error){if(current(own)&&!abort.signal.aborted)el('[data-status]').textContent='Analyse indisponible : '+error.message}
  finally{if(current(own)){controller=null;el('[data-load]').disabled=false;el('[data-cancel]').hidden=true}}
 }
 el('[data-load]').onclick=run;el('[data-cancel]').onclick=clear;el('[data-mode]').onchange=render;
 for(const key of ['source','target','target-sales'])el(`[data-${key}]`).onchange=clear;
 el('[data-swap]').onclick=()=>{const source=el('[data-source]').value;el('[data-source]').value=el('[data-target]').value;el('[data-target]').value=source;clear()};
 el('[data-history]').onclick=async()=>{
  if(controller){el('[data-status]').textContent='Terminer ou annuler la lecture en cours.';return}
  const target=el('[data-target]').value,own=generation;if(!target)return;controller=new AbortController();const abort=controller;el('[data-history]').disabled=true;el('[data-cancel]').hidden=false;
  try{
   const history=await readHistory(target,own,abort.signal,true);if(!current(own))return;if(snapshot){snapshot.history=history;render()}el('[data-status]').textContent=history.complete?'Historique cible préparé, classement actualisé.':'Historique encore partiel : aucun classement d’absence certifié.';
  }catch(error){if(current(own)&&!abort.signal.aborted)el('[data-status]').textContent=error.message}finally{if(current(own)){controller=null;el('[data-history]').disabled=false;el('[data-cancel]').hidden=true}}
 };
 el('[data-catalog]').onclick=async()=>{
  if(!snapshot||controller){el('[data-status]').textContent='Lancer ou terminer l’analyse avant de compléter les libellés.';return}
  const own=generation,missing=[...new Set(buildAssortmentOpportunities({...snapshot,catalog}).filter(r=>assortmentMode(r,el('[data-mode]').value)).filter(r=>!r.productName||!r.department).map(r=>r.productNumber))];controller=new AbortController();const abort=controller;el('[data-catalog]').disabled=true;el('[data-cancel]').hidden=false;
  try{for(let i=0;i<missing.length;i+=240){const result=await core.api('/api/analytics/catalog?'+new URLSearchParams({products:missing.slice(i,i+240).join(',')}),{noRetry:true,signal:abort.signal});if(!current(own))return;for(const row of result.items||[])catalog.set(analyticalProductCode(row.productNumber),row);el('[data-status]').textContent=`Libellés et hiérarchie · ${Math.min(i+240,missing.length)} / ${missing.length} articles`;render()}el('[data-status]').textContent='Enrichissement terminé. Les informations non exposées restent N/D.';
  }catch(error){if(current(own)&&!abort.signal.aborted)el('[data-status]').textContent='Enrichissement incomplet : '+error.message}finally{if(current(own)){controller=null;el('[data-catalog]').disabled=false;el('[data-cancel]').hidden=true}}
 };
 document.addEventListener('retail-intelligence:period',()=>{clear();populate()});
 document.addEventListener('retail-intelligence:stock',event=>{if(!event.detail.complete)return;for(const row of event.detail.rows||[])if(row.productName)catalog.set(analyticalProductCode(row.productNumber),row);render()});
 populate();clear();
}
if(typeof document!=='undefined')mountAssortmentOpportunities();
