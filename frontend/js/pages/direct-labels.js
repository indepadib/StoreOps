import {api} from '../api.js';
import {app} from '../state.js';
import {rawbtLink,isAndroid} from '../rawbt-print.js';

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
   </div>
   <p role="status" aria-live="polite"></p><button class="btn brand" type="submit">Vérifier le prix</button><div data-print-result></div>
 </form>`;
 const form=host.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]'),result=form.querySelector('[data-print-result]');
 const fields=[...form.querySelectorAll('input, select')];
 const article=form.elements.namedItem('code'),quantity=form.elements.namedItem('quantity');
 let preview=null,job=null,requestKey=null,revision=0;
 function resetPreview(){
  revision++;
  preview=null;job=null;requestKey=null;
  status.textContent='';result.replaceChildren();button.textContent='Vérifier le prix';
 }
 form.addEventListener('input',resetPreview);
 function showNextArticle(){
  const next=document.createElement('button');
  next.className='btn brand';next.type='button';next.textContent='Article suivant';
  next.addEventListener('click',()=>{
   article.value='';quantity.value='1';
   resetPreview();fields.forEach(field=>field.disabled=false);button.disabled=false;article.focus();
  });
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
   job??=await api(endpoint,{method:'POST',body:{...input,quantity:Number(input.quantity),expectedPrice:preview.finalPrice,idempotencyKey:requestKey,canOpenRawBt:isAndroid()}});
   if(job.mobile){
    if(!isAndroid())throw new Error('Ouvre cette page sur le PDA Android pour imprimer avec RawBT.');
    const path=`/api/label-print-jobs/${encodeURIComponent(job.id)}/rawbt`;
    const prepared=await api(path,{method:'POST',body:{action:'prepare'}});
    const link=document.createElement('a');link.className='btn brand';link.href=rawbtLink(prepared.payload,prepared.payload_format);link.textContent='Ouvrir RawBT et imprimer';
    const confirm=document.createElement('button');confirm.className='btn soft';confirm.type='button';confirm.textContent='Confirmer la sortie';confirm.disabled=true;
    const failed=document.createElement('button');failed.className='btn soft';failed.type='button';failed.textContent='Impression manquante ou incomplète';
    link.addEventListener('click',e=>{if(link.dataset.sent){e.preventDefault();return}link.dataset.sent='1';confirm.disabled=false;});
    async function finish(action){
     if(action==='failed'&&!window.confirm('Après contrôle du rouleau, confirmer que l’impression manque ou est incomplète ?'))return;
     confirm.disabled=true;failed.disabled=true;
     try{
      await api(path,{method:'POST',body:{action,confirmed:true}});
      status.textContent=action==='confirm'?'Impression confirmée.':'Échec enregistré. Vérifie le rouleau avant de préparer une nouvelle impression.';
      showNextArticle();
     }catch(error){status.textContent=error.message;confirm.disabled=!link.dataset.sent;failed.disabled=false;}
    }
    confirm.addEventListener('click',()=>finish('confirm'));
    failed.addEventListener('click',()=>finish('failed'));
    result.replaceChildren(link,confirm,failed);
    status.textContent='Étiquettes prêtes. Ouvre RawBT.';
   }else{
    status.textContent=`${job.quantity} étiquette(s) en file pour le relais magasin.`;
    showNextArticle();
   }
  }catch(error){status.textContent=error.message;if(error.status===409&&!job){preview=null;button.textContent='Vérifier le prix';}}
  finally{const locked=result.childElementCount>0;fields.forEach(field=>field.disabled=locked);button.disabled=locked;}
 });
}
