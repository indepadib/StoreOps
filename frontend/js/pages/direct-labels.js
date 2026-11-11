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
 let preview=null,job=null,requestKey=null,revision=0;
 form.addEventListener('input',()=>{
  revision++;
  preview=null;job=null;requestKey=null;
  status.textContent='';result.replaceChildren();button.textContent='Vérifier le prix';
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const version=revision;
  const input=Object.fromEntries(new FormData(form));
  const fields=[...form.querySelectorAll('input, select')];
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
   job??=await api(endpoint,{method:'POST',body:{...input,quantity:Number(input.quantity),expectedPrice:preview.finalPrice,idempotencyKey:requestKey}});
   if(job.mobile){
    if(!isAndroid())throw new Error('Ouvre cette page sur le PDA Android pour imprimer avec RawBT.');
    const path=`/api/label-print-jobs/${encodeURIComponent(job.id)}/rawbt`;
    const prepared=await api(path,{method:'POST',body:{action:'prepare'}});
    const link=document.createElement('a');link.className='btn brand';link.href=rawbtLink(prepared.payload,prepared.payload_format);link.textContent='Ouvrir RawBT et imprimer';
    const confirm=document.createElement('button');confirm.className='btn soft';confirm.type='button';confirm.textContent='Confirmer la sortie';confirm.disabled=true;
    link.addEventListener('click',e=>{if(link.dataset.sent){e.preventDefault();return}link.dataset.sent='1';confirm.disabled=false;});
    confirm.addEventListener('click',async()=>{
     confirm.disabled=true;
     try{await api(path,{method:'POST',body:{action:'confirm',confirmed:true}});status.textContent='Impression confirmée.';result.replaceChildren();}
     catch(error){status.textContent=error.message;confirm.disabled=false;}
    });
    result.replaceChildren(link,confirm);
    status.textContent='Étiquettes prêtes. Ouvre RawBT.';
   }else status.textContent=`${job.quantity} étiquette(s) envoyée(s) à l’imprimante.`;
  }catch(error){status.textContent=error.message;if(error.status===409&&!job){preview=null;button.textContent='Vérifier le prix';}}
  finally{fields.forEach(field=>field.disabled=false);button.disabled=!!job&&!job.mobile||result.childElementCount>0;}
 });
}
