import { createXlsxBlob } from './xlsx-workbook.js';

const core=window.RETAIL_INTELLIGENCE;
const button=document.getElementById('fullExportBtn');
const SESSION_KEY='retail-intelligence:monthly-export-job:v3';
const MAX_VISIBLE_WAIT_MS=90_000;
const progressBanner=document.getElementById('fullExportStatus');
function report(message,{ready=false}={}){
 if(!progressBanner)return;
 progressBanner.hidden=false;progressBanner.textContent=message;
 progressBanner.classList.toggle('is-ready',ready)
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const n=v=>v===null||v===undefined||v===''?0:Number(v)||0;
const round=v=>Math.round((Number(v)||0)*100)/100;
const ratio=(a,b)=>b?round(a/b*100):null;
function toast(message){
 const el=document.getElementById('toast');if(!el)return;
 el.textContent=message;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),5500)
}
function daysBetween(start,end){
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.floor((b-a)/86400000)+1:null
}
function getSavedJob(fingerprint){
 try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.fingerprint===fingerprint?value.jobId:null}catch{return null}
}
function phaseLabel(progress={}){
 const labels={QUEUED:'En attente de préparation',INITIALIZING:'Connexion aux données',READING_SALES:'Lecture Dynamics',ENRICHING_CATALOG:'Enrichissement des articles',SAVING:'Enregistrement des résultats',READY:'Prêt',FAILED:'Échec de la préparation'};
 const label=labels[progress.phase]||'Préparation';
 return label+(Number.isFinite(Number(progress.total))&&Number(progress.total)>0?' · '+(progress.completed||0)+'/'+progress.total:'')
}
async function saveXlsx(blob,filename){
 const type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const file=new File([blob],filename,{type});
 if(navigator.share&&navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:'StoreOps Analytics · export des ventes',text:'Classeur multi-onglets · ventes et comparaison'});return 'SHARED'}
  catch(error){if(error?.name==='AbortError')return 'CANCELLED'}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);return 'DOWNLOADED'
}
function buildSheets(job,rows){
 const basketIssue=code=>!code?'OK':({BASKET_NOT_PREPARED:'Paniers non préparés',BASKET_COLLECTION_UNAVAILABLE:'Source panier indisponible',BASKET_IDENTITY_INCOMPLETE:'Identité de certains tickets incomplète',BASKET_INVALID_SALES:'Montants panier inexploitables',BASKET_TICKETS_MISMATCH:'Nombre de tickets différent de la source ventes',BASKET_SALES_MISMATCH:'CA des paniers différent de la source ventes'}[code]||'Source panier indisponible');
 const columns=job.columns||[],keys=columns.map(c=>c.key),headers=columns.map(c=>c.label);
 const find=key=>keys.indexOf(key);
 const get=(row,key)=>{const i=find(key);return i<0?null:row[i]};
 const network=rows.filter(r=>get(r,'scope_type')==='NETWORK');
 const stores=rows.filter(r=>get(r,'scope_type')==='STORE');
 const sum=(set,key)=>round(set.reduce((acc,row)=>acc+n(get(row,key)),0));
 const detailColumns=['store_code','store_name','product_number','product_name','department','rayon','family','subfamily','status_vs_n1','ca_n','ca_n1','ca_delta','ca_evolution_pct','quantity_n','quantity_unit_n','quantity_n1','quantity_unit_n1','ca_weight_pct','rank_ca_n','abc_class_n','basket_penetration_pct','sales_source_status_n','basket_source_status_n'];
 const storeGroups=new Map();
 for(const row of stores){
  const key=String(get(row,'store_id')||get(row,'store_code')||'');
  let x=storeGroups.get(key);
  if(!x){x={code:get(row,'store_code'),name:get(row,'store_name'),current:0,previous:0,products:0,tickets:get(row,'tickets_scope_n'),ticketsPrevious:get(row,'tickets_scope_n1'),incomplete:0};storeGroups.set(key,x)}
  x.current+=n(get(row,'ca_n'));x.previous+=n(get(row,'ca_n1'));x.products++;
  if(get(row,'sales_source_status_n')!=='READY'||get(row,'sales_source_status_n1')!=='READY')x.incomplete++
 }
 const storeSummary=[...storeGroups.values()].sort((a,b)=>b.current-a.current).map(x=>[
  x.code,x.name,round(x.current),round(x.previous),round(x.current-x.previous),x.previous?ratio(x.current-x.previous,x.previous):null,
  x.tickets,x.ticketsPrevious,x.tickets?round(x.current/x.tickets):null,x.products,x.incomplete?'PARTIEL':'READY'
 ]);
 const totalCurrent=n(job.summary?.currentSales),totalPrevious=n(job.summary?.comparisonSales);
 const networkReconciliation=network.length?round(sum(network,'ca_n')-totalCurrent):null;
 const storeReconciliation=round(sum(stores,'ca_n')-totalCurrent);
 const qualityRows=[
  ['Source','StoreOps Analytics / Dynamics 365','Lecture des ventes selon le périmètre sélectionné'],
  ['Statut export',job.dataStatus||'INCONNU',job.dataStatus==='READY'?'Ventes complètes et paniers rapprochés sur tous les magasins':'Vérifier les sources manquantes ou les paniers non rapprochés'],
  ['Magasins sélectionnés',job.summary?.stores||0,'Val Fleuri / Trèfle selon filtre'],
  ['Articles réseau',network.length,'Dédoublonnés par code article'],
  ['Lignes magasin',stores.length,'Une ligne par magasin et par article'],
  ['Écart CA réseau vs contrôle',networkReconciliation,'Doit être proche de zéro en DH (arrondis possibles)'],
  ['Écart CA magasins vs contrôle',storeReconciliation,'Doit être proche de zéro en DH (arrondis possibles)'],
  ['Baskets période disponibles',job.diagnostics?.basketCurrentReady??null,'Présence panier et associations seulement si READY'],
  ['Baskets comparaison disponibles',job.diagnostics?.basketComparisonReady??null,'Ne pas transformer une donnée manquante en zéro'],
  ['Marge','NON PUBLIÉE','COGS et conversions KG/G à valider avec la comptabilité'],
  ['Périmètre fiscal','CA TTC','La base des indicateurs doit être rapprochée avec Retail & Commerce'],
  ...(job.diagnostics?.basketErrors||[]).map(e=>['Indicateurs panier '+e.storeId,basketIssue(e.current),'Comparaison : '+basketIssue(e.comparison)])
 ];
 const summaryRows=[
  ['RETAIL INTELLIGENCE — RAPPORT VENTES','', 'Synthèse de la période choisie'],
  ['Période',job.period?.startDate+' au '+job.period?.endDate,'Dates inclusives'],
  ['Comparaison',job.comparison?.startDate+' au '+job.comparison?.endDate,job.comparison?.label||''],
  ['Statut des données',job.dataStatus||'INCONNU','READY = ventes complètes et paniers rapprochés sur tout le périmètre'],
  ['CA période TTC',totalCurrent,'DH'],
  ['CA comparaison TTC',totalPrevious,'DH'],
  ['Écart CA',round(totalCurrent-totalPrevious),'DH'],
  ['Évolution CA %',totalPrevious?ratio(totalCurrent-totalPrevious,totalPrevious):null,'N/D si base comparaison nulle'],
  ['Nombre de tickets période',job.summary?.currentTickets??null,'Source agrégée Dynamics'],
  ['Nombre de tickets comparaison',job.summary?.comparisonTickets??null,'Source agrégée Dynamics'],
  ['Panier moyen période',job.summary?.currentTickets?round(totalCurrent/job.summary.currentTickets):null,'CA TTC / tickets'],
  ['Panier moyen comparaison',job.summary?.comparisonTickets?round(totalPrevious/job.summary.comparisonTickets):null,'CA TTC / tickets'],
  ['Magasins sélectionnés',job.summary?.stores??null,''],
  ['Produits distincts réseau',network.length,''],
  ['Lignes articles magasins',stores.length,''],
  ['Réconciliation ventes magasins',storeReconciliation,'Écart avec CA total; cible 0 DH'],
  ['Marge',null,'Non communiquée tant que le coût D365 et les unités g/kg ne sont pas validés']
 ];
 const alerts=[...stores].filter(row=>get(row,'ca_delta')!==null)
  .sort((a,b)=>n(get(a,'ca_delta'))-n(get(b,'ca_delta'))).slice(0,80).map(row=>[
   'PLUS FORTE BAISSE',...detailColumns.map(key=>get(row,key))
  ]);
 const growthRows=[...stores].sort((a,b)=>n(get(b,'ca_delta'))-n(get(a,'ca_delta'))).slice(0,80).map(row=>[
  'PLUS FORTE HAUSSE',...detailColumns.map(key=>get(row,key))
 ]);
 const newRows=stores.filter(r=>['NEW_VS_COMPARISON','LOST_VS_COMPARISON'].includes(get(r,'status_vs_n1')))
  .sort((a,b)=>Math.abs(n(get(b,'ca_delta')))-Math.abs(n(get(a,'ca_delta')))).slice(0,100).map(row=>[
   get(row,'status_vs_n1')==='LOST_VS_COMPARISON'?'ARTICLE PERDU':'NOUVEL ARTICLE',...detailColumns.map(key=>get(row,key))
  ]);
 const dictionary=[
  ['CA période TTC','Somme des ventes TTC valides sur la période, selon mapping D365','DH','Vérification contre Retail & Commerce'],
  ['CA comparaison TTC','CA TTC sur la fenêtre comparée','DH','Fenêtre exactement celle sélectionnée'],
  ['Évolution CA','(CA période - CA comparaison) / |CA comparaison| × 100','%','N/D si base nulle'],
  ['Poids CA','CA de l’article / CA total du même périmètre × 100','%','Ne pas additionner réseau + magasins'],
  ['CA quotidien','CA article / nombre de jours calendaires de la fenêtre','DH/jour','Ne représente pas les jours d’ouverture'],
  ['ABC CA','A ≤80 %, B ≤95 %, C >95 % du CA cumulé trié par article','Classe','Analyse de concentration'],
  ['Prix moyen réalisé','CA / quantité vendue, si unité homogène','DH/unité','N/D si unité mélangée'],
  ['Effet volume','(Quantité N - Quantité comparaison) × prix de comparaison','DH','Estimation sur unité identique uniquement'],
  ['Effet prix','Quantité N × (prix N - prix comparaison)','DH','Estimation sur unité identique uniquement'],
  ['Présence panier','Tickets avec produit / tickets analysés × 100','%','N/D si preuves panier non préparées'],
  ['Lift association','P(A et B) / [P(A) × P(B)]','Indice','N/D si paniers non disponibles'],
  ['Remises','Remises identifiées par les lignes de tickets','DH','Selon couverture de la source'],
  ['Marge','Non calculée dans cet export','—','Validation coût, HT/TTC et conversion g/kg nécessaire'],
  ['Statut ventes','READY / PARTIAL / TRUNCATED / UNAVAILABLE','État source','Tout statut autre que READY doit être investigué'],
  ['Statut paniers','READY / UNAVAILABLE','État source','N/D et non zéro en cas d’indisponibilité']
 ];
 return [
  {name:'01 Synthèse',headers:['Indicateur','Valeur','Interprétation'],keys:['indicator','value','note'],rows:summaryRows,widths:[39,26,56]},
  {name:'02 Magasins',headers:['Code','Magasin','CA TTC période','CA TTC comparaison','Écart CA','Évolution %','Tickets période','Tickets comparaison','Panier moyen','Articles','Qualité'],keys:['code','name','ca_n','ca_n1','ca_delta','ca_evolution_pct','tickets_n','tickets_n1','basket','products','quality'],rows:storeSummary,widths:[17,26,22,24,20,19,18,20,18,15,18]},
  {name:'03 Articles réseau',headers,keys,rows:network,widths:headers.map(h=>/libellé|produit|magasin/i.test(h)?31:17)},
  {name:'04 Articles magasins',headers,keys,rows:stores,widths:headers.map(h=>/libellé|produit|magasin/i.test(h)?31:17)},
  {name:'05 Alertes commerciales',headers:['Analyse',...detailColumns.map(key=>columns[find(key)]?.label||key)],keys:['alert',...detailColumns],rows:[...alerts,...growthRows,...newRows],widths:[23,...detailColumns.map(k=>k==='product_name'?35:18)]},
  {name:'06 Dictionnaire KPI',headers:['KPI','Définition / calcul','Unité','Précautions'],keys:['indicator','definition','unit','caution'],rows:dictionary,widths:[31,67,17,58]},
  {name:'07 Qualité données',headers:['Contrôle','Valeur','Interprétation'],keys:['control','value','note'],rows:qualityRows,widths:[36,27,64]}
 ]
}
async function prepareJob(jobId){
 const stopAt=Date.now()+MAX_VISIBLE_WAIT_MS;
 for(let attempt=0;Date.now()<stopAt;attempt++){
  const job=await core.api('/api/analytics/monthly-export/jobs/'+encodeURIComponent(jobId),{noRetry:true});
  if(job.status==='FAILED'){
   sessionStorage.removeItem(SESSION_KEY);
   throw Object.assign(new Error(job.message||'La préparation de l’export a échoué.'),{code:job.code||'EXPORT_FAILED'})
  }
  if(job.status==='READY')return job;
  const phase=phaseLabel(job.progress);
  button.textContent=phase;
  report('Export en préparation · '+phase+'. Les données restent en cours de traitement sur le serveur.');
  await sleep(Math.min(5000,2500+attempt*180))
 }
 report('Export toujours en préparation. Tu peux continuer à utiliser StoreOps : reviens sur cette page et reclique sur Export complet pour récupérer le même fichier.');
 return null
}
async function readPage(jobId,page,total){
 const url='/api/analytics/monthly-export/jobs/'+encodeURIComponent(jobId)+'/pages/'+page;
 for(let attempt=0;attempt<8;attempt++){
  try{return await core.api(url,{noRetry:true})}
  catch(error){
   if((error?.status===409||error?.code==='EXPORT_NOT_READY')&&attempt<7){
    button.textContent='Synchronisation des pages '+(page+1)+'/'+total;
    await sleep(Math.min(2200,400+attempt*300));continue
   }
   throw error
  }
 }
 throw new Error('La page Excel est momentanément indisponible.')
}
async function run(){
 if(!core||!button)return;
 const state=core.getState(),days=daysBetween(state.periodStart,state.periodEnd),comparisonDays=daysBetween(state.compareStart,state.compareEnd);
 if(!days||days>31||!comparisonDays||comparisonDays>31){toast('Choisis deux périodes valides de 1 à 31 jours.');return}
 const stores=core.getSelectedStores();
 if(!stores.length){toast('Sélectionne au moins un magasin.');return}
 const query={start:state.periodStart,end:state.periodEnd,compareStart:state.compareStart,compareEnd:state.compareEnd,
  comparisonMode:state.comparisonMode||'custom',scope:'all',storeIds:stores.map(s=>s.id)};
 const fingerprint=JSON.stringify(query);
 const original=button.innerHTML;button.disabled=true;
 try{
  report('Préparation de l’export · recherche des données et du dernier traitement.');
  let jobId=getSavedJob(fingerprint);
  if(!jobId){
   button.textContent='Création de l’export…';
   const created=await core.api('/api/analytics/monthly-export/jobs',{method:'POST',body:query,noRetry:true});
   jobId=created.jobId;
   sessionStorage.setItem(SESSION_KEY,JSON.stringify({jobId,fingerprint}));
  }
  let job;
  try{job=await prepareJob(jobId)}
  catch(error){if(error?.code==='EXPORT_JOB_NOT_FOUND'){
   sessionStorage.removeItem(SESSION_KEY);throw new Error('L’export précédent a expiré. Relance pour en créer un nouveau.');
  }throw error}
  if(!job){toast('Export en cours côté serveur. Reclique plus tard pour reprendre, sans recommencer.');return}
  if(!job.columns?.length)throw new Error('L’export est dépourvu de définition des colonnes.');
  report('Données prêtes · récupération des '+job.pages+' pages du fichier Excel.',{ready:true});
  const rows=[];
  for(let page=0;page<(job.pages||0);page++){
   button.textContent='Téléchargement des données '+(page+1)+'/'+job.pages;
   const data=await readPage(jobId,page,job.pages);
   rows.push(...(data.rows||[]))
  }
  if(!rows.length)throw new Error('Aucune ligne de ventes à exporter sur cette période.');
  button.textContent='Création du classeur Excel…';
  const workbook=await createXlsxBlob(buildSheets(job,rows));
  const storeScope=stores.length===1?String(stores[0].code||stores[0].id):'RESEAU';
  const partial=job.dataStatus==='READY'?'':'-PARTIEL';
  const filename='StoreOps-Analytics-Ventes-'+storeScope+'-'+state.periodStart+'_'+state.periodEnd+partial+'.xlsx';
  const result=await saveXlsx(workbook,filename);
  if(result!=='CANCELLED'){
   report(rows.length+' lignes préparées · 7 onglets Excel · '+(partial?'données partielles à contrôler':'ventes prêtes')+'.',{ready:true});
   toast(rows.length+' lignes · 7 onglets Excel · '+(partial?'Données partielles à contrôler':'Ventes prêtes')+'.')
  }
 }catch(error){console.error('StoreOps Analytics XLSX export failed',error);const message=error?.message||'Impossible de préparer le classeur.';report('Export interrompu : '+message);toast(message)}
 finally{button.disabled=false;button.innerHTML=original}
}
button?.addEventListener('click',run);
