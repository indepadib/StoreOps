import { api } from '../api.js';
import { app } from '../state.js';
import { $,esc,toast } from '../ui.js';

let pulse=null,dimension='departments';
const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2})+' DH';
const pct=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;
const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1});
const margin=v=>v==null?'Marge non connectée':`${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}% marge`;

function tabLabel(k){return({departments:'Rayons',categories:'Catégories',products:'Articles',hourly:'Heures'}[k]||k)}
function rows(){return pulse?.snapshot?.breakdowns?.[dimension]||[]}
function renderRows(){
 const host=$('#performanceRows');if(!host)return;
 const items=rows(),total=Number(pulse?.snapshot?.kpis?.netSales||0);
 host.innerHTML=items.length?items.slice(0,30).map((r,i)=>{
  const share=total?Math.max(0,(Number(r.sales||0)/total)*100):null;
  return `<div class="performance-row"><div><strong>${i+1}. ${esc(r.label||r.key)}</strong><small>${dimension==='hourly'?'Créneau de vente':`${share==null?'':`${share.toLocaleString('fr-FR',{maximumFractionDigits:1})}% du CA · `}${margin(r.marginRate)}`}</small></div><div class="performance-row-value"><strong>${money(r.sales)}</strong><span class="small muted">${r.units==null?'':`${number(r.units)} u.`}</span></div></div>`;
 }).join(''):`<div class="performance-empty">Aucune donnée disponible pour ${esc(tabLabel(dimension).toLowerCase())}.</div>`;
 document.querySelectorAll('[data-performance-dim]').forEach(b=>b.classList.toggle('active',b.dataset.performanceDim===dimension));
}

function unavailable(p){return `<div class="performance-shell"><div class="manager-hub-head"><span class="manager-eyebrow">Business Pulse</span><h2>Performance magasin</h2><p>Le flux de ventes n’est pas encore connecté pour ce magasin.</p></div><div class="pulse-unavailable"><strong>Ventes non connectées</strong><span>StoreOps n’affiche aucune valeur estimée. Le mapping D365 ventes doit être validé avant activation LIVE.</span></div><div class="card" style="margin-top:12px"><strong>Ce qui reste disponible</strong><p class="small muted">Actions opérationnelles, stock, prix/promo, DLC, réception, équipe, incidents et fermeture restent utilisables normalement.</p></div></div>`}

export async function renderManagerPerformance(){
 try{pulse=await api(`/api/stores/${app.storeId}/business-pulse`);const host=$('#managerPerformanceContent');if(!host)return;if(pulse.status!=='READY'||!pulse.snapshot){host.innerHTML=unavailable(pulse);return}
 const k=pulse.snapshot.kpis||{},change=k.changeVsComparison;
 host.innerHTML=`<div class="performance-shell">
  <div class="manager-hub-head"><span class="manager-eyebrow">Business Pulse</span><h2>Performance magasin</h2><p>Du magasin jusqu’à l’article, avec les données réellement disponibles.</p></div>
  <div class="performance-hero">
   <div class="performance-kpi sales"><span>CA aujourd’hui</span><strong>${money(k.netSales)}</strong><small>${change==null?'Comparatif D-7 indisponible':`${pct(change)} vs D-7`}</small></div>
   <div class="performance-kpi"><span>Marge</span><strong>${k.marginRate==null?'—':pct(k.marginRate)}</strong><small>${k.marginRate==null?'Coût article non mappé':'Taux de marge'}</small></div>
   <div class="performance-kpi"><span>Tickets</span><strong>${number(k.tickets)}</strong><small>Panier ${money(k.averageBasket)}</small></div>
   <div class="performance-kpi"><span>Articles vendus</span><strong>${number(k.units)}</strong><small>${k.outOfStockCount??0} rupture(s) assortiment</small></div>
   <div class="performance-kpi"><span>Disponibilité</span><strong>${k.availabilityRate==null?'—':pct(k.availabilityRate)}</strong><small>${pulse.stock?.assortmentReady?'Assortiment à jour':'Assortiment à vérifier'}</small></div>
  </div>
  <div class="performance-tabs">${['departments','categories','products','hourly'].map(x=>`<button data-performance-dim="${x}" class="${x===dimension?'active':''}">${tabLabel(x)}</button>`).join('')}</div>
  <div id="performanceRows" class="performance-list"></div>
  <div class="pulse-actions"><span class="pulse-source">Source ${esc(pulse.source||'—')} · actualisé ${new Date(pulse.refreshedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><button class="btn soft" id="refreshPerformance">Actualiser</button></div>
 </div>`;
 renderRows();
 document.querySelectorAll('[data-performance-dim]').forEach(b=>b.onclick=()=>{dimension=b.dataset.performanceDim;renderRows()});
 $('#refreshPerformance')?.addEventListener('click',async()=>{try{pulse=await api(`/api/stores/${app.storeId}/business-pulse/refresh`,{method:'POST'});toast('Business Pulse actualisé.');renderManagerPerformance()}catch(e){toast(e.message)}});
 }catch(e){toast(e.message);throw e}
}
