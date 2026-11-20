import {api} from '../api.js';
import {app} from '../state.js';
import {rawbtLink,isAndroid} from '../rawbt-print.js';
import {documentPrintControls} from '../label-document.js';

export function renderDirectLabels(){
 const host=document.getElementById('dlcMarkdownContent');
 if(!host)return;
 const storeId=app.storeId;
 const endpoint=`/api/stores/${encodeURIComponent(storeId)}/direct-labels`;
 host.innerHTML=`<form class="card" id="directLabelForm">
   <div class="form-grid">
    <div class="field"><label for="labelArticle">Code interne ou EAN</label><input id="labelArticle" name="code" required maxlength="40" autocomplete="off"></div>
    <div class="field"><label for="labelDiscount">Remise</label><select id="labelDiscount" name="markdownCode"><option value="MD20">−20 %</option><option value="MD50">−50 %</option></select></div>
    <div class="field"><label for="labelReason">Motif</label><select id="labelReason" name="reason" required><option value="">Choisir</option><option value="CASSE">Casse</option><option value="FRAIS">Frais</option></select></div>
    <div class="field"><label for="labelQuantity">Étiquettes</label><input id="labelQuantity" name="quantity" type="number" min="1" max="50" step="1" value="1" required></div>
    <div class="field"><label for="labelPrintApp">Impression</label><select id="labelPrintApp" name="printApp"><option value="RONGTA">Rongta · fichier étiquette</option><option value="EXISTING">Impression magasin / RawBT</option></select></div>
   </div>
   <p role="status" aria-live="polite"></p><button class="btn brand" type="submit">Vérifier le prix</button><div data-print-result></div>
 </form>`;
 const form=host.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]'),result=form.querySelector('[data-print-result]');
 const fields=[...form.querySelectorAll('input, select')];
 const article=form.elements.namedItem('code'),quantity=form.elements.namedItem('quantity');
 const printApp=form.elements.namedItem('printApp');
 try{printApp.value=localStorage.getItem('storeops:label-print-app')==='EXISTING'?'EXISTING':'RONGTA';}catch{}
 printApp.addEventListener('change',()=>{try{localStorage.setItem('storeops:label-print-app',printApp.value)}catch{}});
 let preview=null,job=null,requestKey=null,revision=0;
 function resetPreview(){
  revision++;
  preview=null;job=null;requestKey=null;
  status.textContent='';result.replaceChildren();button.textContent='Vérifier le prix';
 }
 form.addEventListener('input',resetPreview);
 function nextArticle(){
  article.value='';quantity.value='1';
  resetPreview();fields.forEach(field=>field.disabled=false);button.disabled=false;article.focus();
 }
 function showNextArticle(){
  const next=document.createElement('button');
  next.className='btn brand';next.type='button';next.textContent='Article suivant';
  next.addEventListener('click',nextArticle);
  result.replaceChildren(next);
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const version=revision;
  const input=Object.fromEntries(new FormData(form));
  if(preview)fields.forEach(field=>field.disabled=true);
  button.disabled=true;
  try{
   if(!preview){
    status.textContent='Recherche de l’article…';
    const data=await api(`${endpoint}?${new URLSearchParams({code:input.code,markdownCode:input.markdownCode})}`);
    if(revision!==version||!form.isConnected)return;
    preview=data;
    const money=new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD'});
    status.textContent=`${data.productName} · ${money.format(data.originalPrice)} → ${money.format(data.finalPrice)}`;
    button.textContent='Imprimer';
    return;
   }
   requestKey??=crypto.randomUUID();
   job??=await api(endpoint,{method:'POST',body:{...input,output:input.printApp==='RONGTA'?'DOCUMENT':undefined,quantity:Number(input.quantity),expectedPrice:preview.finalPrice,idempotencyKey:requestKey,canOpenRawBt:isAndroid()}});
   if(job.document){
    documentPrintControls(result,job.label,job.quantity,nextArticle);
    status.textContent='Étiquettes prêtes pour Rongta. Le PDF contient uniquement les étiquettes, sans en-tête de page.';
   }else if(job.mobile){
    if(!isAndroid())throw new Error('Ouvre cette page sur le PDA Android pour imprimer avec RawBT.');
    const path=`/api/label-print-jobs/${encodeURIComponent(job.id)}/rawbt`;
    const prepared=await api(path,{method:'POST',body:{action:'prepare'}});
    const batches=prepared.batches||[prepared.payload],links=batches.map((payload,index)=>{
     const link=document.createElement('a');link.className='btn brand';
     link.href=rawbtLink(payload,prepared.payload_format);
     link.textContent=batches.length===1?'Ouvrir RawBT et imprimer':`Imprimer le lot ${index+1} / ${batches.length}`;
     if(index>0)link.setAttribute('aria-disabled','true');
     return link;
    });
    const confirm=document.createElement('button');confirm.className='btn soft';confirm.type='button';confirm.textContent='Confirmer la sortie';confirm.disabled=true;
    const failed=document.createElement('button');failed.className='btn soft';failed.type='button';failed.textContent='Impression manquante ou incomplète';
    links.forEach((link,index)=>link.addEventListener('click',event=>{
     if(link.dataset.sent||index>0&&!links[index-1].dataset.sent){event.preventDefault();return;}
     link.dataset.sent='1';link.textContent=`Lot ${index+1} transmis · vérifier la sortie`;
     links[index+1]?.removeAttribute('aria-disabled');
     confirm.disabled=!links.every(item=>item.dataset.sent);
    }));
    async function finish(action){
     if(action==='failed'&&!window.confirm('Après contrôle du rouleau, confirmer que l’impression manque ou est incomplète ?'))return;
     confirm.disabled=true;failed.disabled=true;
     try{
      await api(path,{method:'POST',body:{action,confirmed:true}});
      status.textContent=action==='confirm'?'Impression confirmée.':'Échec enregistré. Vérifie le rouleau avant de préparer une nouvelle impression.';
      showNextArticle();
     }catch(error){status.textContent=error.message;confirm.disabled=!links.every(item=>item.dataset.sent);failed.disabled=false;}
    }
    confirm.addEventListener('click',()=>finish('confirm'));
    failed.addEventListener('click',()=>finish('failed'));
    result.replaceChildren(...links,confirm,failed);
    status.textContent='Étiquettes prêtes. Ouvre RawBT.';
   }else{
    status.textContent=`${job.quantity} étiquette(s) en file pour le relais magasin.`;
    showNextArticle();
   }
  }catch(error){status.textContent=error.message;if(error.status===409&&!job){preview=null;button.textContent='Vérifier le prix';}}
  finally{const locked=result.childElementCount>0;fields.forEach(field=>field.disabled=locked);button.disabled=locked;}
 });
}
