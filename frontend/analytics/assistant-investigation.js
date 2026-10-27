const $=id=>document.getElementById(id);
export function investigationContext(){return {productNumber:$('assistantArticle').value.trim().toUpperCase(),articleContext:$('pricingContextSku').value.trim().toUpperCase(),eventDate:$('assistantEventDate').value||undefined,windowDays:Number($('assistantWindowDays').value||14)}}
export async function requestInvestigation(body,{api,signal,onProgress,isCurrent}){
 const post=()=>api('/api/analytics/assistant',{method:'POST',noRetry:true,signal,body});let result=await post();
 if(result.status!=='PREPARATION_REQUIRED')return result;
 const tasks=result.tasks||[];if(tasks.length>500)throw new Error('Trop de journées à préparer : réduire la fenêtre ou le nombre de magasins.');
 let next=0,done=0,failed=false;
 const worker=async()=>{while(next<tasks.length&&!failed){if(signal.aborted||!isCurrent())throw new DOMException('Périmètre modifié','AbortError');const task=tasks[next++];try{await api('/api/analytics/customer-intelligence/prepare?'+new URLSearchParams({storeId:task.storeId,date:task.date}),{noRetry:true,signal});done++;onProgress(`Enquête ${result.product.productNumber} · préparation des tickets ${done}/${tasks.length} · ${task.storeName} · ${task.date}`)}catch(error){failed=true;throw error}}};
 await Promise.all(Array.from({length:Math.min(2,tasks.length)},worker));
 if(signal.aborted||!isCurrent())throw new DOMException('Périmètre modifié','AbortError');
 onProgress('Tickets préparés · comparaison du prix, des paniers et du retour des clients…');result=await post();
 if(result.status==='PREPARATION_REQUIRED')throw new Error('Certaines preuves de tickets ont expiré pendant la préparation. Réduire la fenêtre et relancer ; aucun total incomplet n’est publié.');
 return result;
}
export function renderInvestigation(container,result){
 const r=result.analysis;if(!r)return false;
 container.classList.add('assistant-investigation');$('analyticsAssistant').classList.add('expanded');$('analyticsAssistantExpand').setAttribute('aria-expanded','true');
 const number=v=>v==null?'À compléter':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(v),groupNames={REPURCHASED:'Rachètent l’article',RETURNED_WITHOUT:'Reviennent sans lui',OTHER_STORE:'Revus ailleurs',NOT_OBSERVED:'Non revus sur la fenêtre'};
 const paragraphs=result.answer.split('\n\n');for(const text of paragraphs.splice(0,2)){const p=document.createElement('p');p.textContent=text;container.appendChild(p)}
 const cards=document.createElement('div');cards.className='impact-cohorts';
 for(const g of r.cohort.groups){const card=document.createElement('article'),label=document.createElement('small'),value=document.createElement('strong'),note=document.createElement('span');label.textContent=groupNames[g.status];value.textContent=number(g.count);note.textContent='Achats avant : '+number(g.previousSales)+' DH · après : '+number(g.currentSales)+' DH';card.append(label,value,note);cards.appendChild(card)}container.appendChild(cards);
 for(const text of paragraphs){const parts=text.split('\n'),first=parts.shift();if(/^\d+\./.test(first)){const section=document.createElement('details'),heading=document.createElement('summary'),p=document.createElement('p');section.className='impact-section';section.open=/^[124569]\./.test(first);heading.textContent=first;p.textContent=parts.join('\n');section.append(heading,p);container.appendChild(section)}else{const p=document.createElement('p');p.textContent=text;container.appendChild(p)}}
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='impact-export';exportButton.textContent='Exporter cette enquête';exportButton.addEventListener('click',()=>{const blob=new Blob(['\ufeff'+result.answer],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='storeops-enquete-'+r.product.productNumber+'-'+r.period.start+'.txt';a.click();URL.revokeObjectURL(url)});container.appendChild(exportButton);return true;
}
export function initInvestigation(){
 try{const saved=JSON.parse(localStorage.getItem('analytics:article-investigation:v1')||'{}');if(typeof saved.productNumber==='string')$('assistantArticle').value=saved.productNumber;if(typeof saved.eventDate==='string')$('assistantEventDate').value=saved.eventDate;if([7,14,21,28].includes(saved.windowDays))$('assistantWindowDays').value=String(saved.windowDays)}catch{}
 for(const id of ['assistantArticle','assistantEventDate','assistantWindowDays'])$(id).addEventListener('change',()=>{const c=investigationContext();localStorage.setItem('analytics:article-investigation:v1',JSON.stringify({productNumber:c.productNumber,eventDate:c.eventDate,windowDays:c.windowDays}))});
 $('analyticsAssistantExpand').addEventListener('click',()=>{const expanded=$('analyticsAssistant').classList.toggle('expanded');$('analyticsAssistantExpand').setAttribute('aria-expanded',String(expanded))});
 $('assistantInvestigate').addEventListener('click',()=>{const code=$('assistantArticle').value.trim()||$('pricingContextSku').value.trim();$('analyticsAssistantQuestion').value=`Quel est l’impact du changement de prix de ${code} sur les ventes, le panier, les autres achats et le retour des clients ? Distingue les habitués et les non-revus, et propose des actions.`;$('analyticsAssistantForm').requestSubmit()});
}
