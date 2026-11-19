import {api} from './api.js';

export function mountGlovoPriceTest(host,storeId,getSku){
 const panel=document.createElement('section');panel.className='channel-card glovo-price-test';
 panel.innerHTML=`<div><h3>Tester l’article, ses prix et sa disponibilité</h3><p>Sélectionne un article ci-dessus, prévisualise les données puis envoie-les au magasin test 51530.</p><div class="glovo-actions"><button type="button" data-preview class="btn soft">Prévisualiser les prix</button><button type="button" data-send class="btn brand" disabled>Envoyer ce produit avec ses prix</button><button type="button" data-resume class="btn soft" hidden>Reprendre le suivi</button></div><p data-result role="status" aria-live="polite"></p></div>`;
 const anchor=host.querySelector('#glovoTestPreview')?.closest('section');
 if(anchor)anchor.after(panel);else host.append(panel);
 const el=selector=>panel.querySelector(selector),path=`/api/stores/${encodeURIComponent(storeId)}/channels/glovo`,key='storeops:glovo-product-test:'+storeId;
 let preview=null,busy=false;
 const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}};
 function remember(value){try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key)}catch{}}
 function report(message){el('[data-result]').textContent=message;}
 el('[data-resume]').hidden=!pending();
 el('[data-preview]').onclick=async()=>{
  if(busy)return;preview=null;el('[data-send]').disabled=true;
  const sku=getSku();if(!sku){report('Choisir un article dans la liste du test produit.');return;}
  busy=true;el('[data-preview]').disabled=true;report('Lecture des prix et promotions Dynamics…');
  try{
   const data=await api(path+'/product-preview?'+new URLSearchParams({sku}));
   if(!panel.isConnected)return;
   preview=data;
   report(`${data.name} · ${data.sku} · Prix de base ${data.basePrice.toFixed(2)} DH · ${data.promotion?'Prix promotionnel '+data.promotion.price.toFixed(2)+' DH, jusqu’au '+new Date(data.promotion.endTime).toLocaleDateString('fr-FR'):'Aucune promotion simple applicable trouvée'} · ${data.active?'Disponible':'Indisponible'}.`);
   el('[data-send]').disabled=false;
  }catch(error){report(error.message)}finally{busy=false;el('[data-preview]').disabled=false;}
 };
 async function watch(current){
  for(let attempt=0;attempt<40&&panel.isConnected;attempt++){
   report((current.stage==='PROMOTION'?'Promotion':'Prix de base et disponibilité')+' · attente Glovo · '+current.jobId);
   const job=await api(path+'/product-sync/'+encodeURIComponent(current.jobId));
   if(job.status==='COMPLETED'){
    if(current.stage==='CATALOG'&&job.product?.promotion){
     current=await api(path+'/product-sync/'+encodeURIComponent(current.jobId)+'/promotion',{method:'POST',noRetry:true});remember(current);continue;
    }
    report('Traitement Glovo terminé. Consulter les résultats et le rapport du produit pour confirmer son affichage.');remember(null);el('[data-resume]').hidden=true;return;
   }
   if(['FAILED','UNKNOWN','SUBMITTING'].includes(job.status))throw new Error('Envoi '+job.status+' · vérifier le traitement '+current.jobId+' avant une nouvelle tentative.');
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  if(panel.isConnected)report('Traitement encore en cours. Reprendre le suivi pour lire le résultat.');
 }
 async function follow(current){
  busy=true;el('[data-preview]').disabled=true;el('[data-send]').disabled=true;el('[data-resume]').hidden=false;
  try{await watch(current)}catch(error){report(error.message)}finally{busy=false;el('[data-preview]').disabled=false;}
 }
 el('[data-send]').onclick=async()=>{
  if(busy||!preview)return;
  if(preview.sku!==getSku()){preview=null;el('[data-send]').disabled=true;report('Article changé. Refaire la prévisualisation.');return;}
  busy=true;el('[data-send]').disabled=true;el('[data-preview]').disabled=true;
  try{
   const current=await api(path+'/product-sync',{method:'POST',body:{sku:preview.sku,fingerprint:preview.fingerprint},noRetry:true});
   remember(current);preview=null;await follow(current);
  }catch(error){report(error.message)}finally{busy=false;el('[data-preview]').disabled=false;}
 };
 el('[data-resume]').onclick=()=>{const current=pending();if(!busy&&current)void follow(current);};
}
