import { api } from '../api.js';
import { app } from '../state.js';
import { $,esc,toast } from '../ui.js';

let pulse=null,dimension='departments';
const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2})+' DH';
const pct=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;
const ratio=v=>v==null?'—':`${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;
const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2});
const safeRows=k=>(pulse?.snapshot?.breakdowns?.[k]||[]);
const top=k=>safeRows(k)[0]||null;
function tabLabel(k){return({departments:'Rayons',categories:'Catégories',products:'Articles',hourly:'Heures'}[k]||k)}
function tone(v,{goodAbove=true}={}){if(v==null)return'';const n=Number(v);return goodAbove?(n>0?'up':n<0?'down':''):(n>0?'down':n<0?'up':'')}
function metric(label,value,small='',cls=''){return `<div class="performance-kpi ${cls}"><span>${esc(label)}</span><strong>${value}</strong><small>${small}</small></div>`}
function insight(label,row,kind){if(!row)return `<div><span>${esc(label)}</span><strong>—</strong><small>Donnée indisponible</small></div>`;const detail=kind==='hourly'?'créneau le plus fort':`${money(row.sales)} · ${number(row.units)} u.`;return `<div><span>${esc(label)}</span><strong>${esc(row.label||row.key)}</strong><small>${detail}</small></div>`}
function rows(){return safeRows(dimension)}
function renderRows(){
 const host=$('#performanceRows');if(!host)return;
 const items=rows(),total=Number(pulse?.snapshot?.kpis?.netSales||0),max=Math.max(0,...items.map(x=>Math.max(0,Number(x.sales||0))));
 host.innerHTML=items.length?items.slice(0,30).map((r,i)=>{
  const sales=Math.max(0,Number(r.sales||0)),share=total?Math.max(0,(sales/total)*100):null,width=max?Math.max(2,(sales/max)*100):0;
  return `<div class="performance-row"><div class="performance-rank">${i+1}</div><div class="performance-row-main"><div class="performance-row-head"><strong>${esc(r.label||r.key)}</strong><span>${share==null?'':ratio(share)+' du CA'}</span></div><div class="performance-bar"><i style="width:${width}%"></i></div><small>${dimension==='hourly'?'Créneau de vente':`${number(r.units)} unité(s) vendue(s)`}</small></div><div class="performance-row-value"><strong>${money(r.sales)}</strong></div></div>`;
 }).join(''):`<div class="performance-empty">Aucune donnée disponible pour ${esc(tabLabel(dimension).toLowerCase())}.</div>`;
 document.querySelectorAll('[data-performance-dim]').forEach(b=>b.classList.toggle('active',b.dataset.performanceDim===dimension));
}
function unavailable(p){return `<div class="performance-shell"><div class="manager-hub-head"><span class="manager-eyebrow">Business Pulse</span><h2>Performance magasin</h2><p>Le flux de ventes n’est pas encore connecté pour ce magasin.</p></div><div class="pulse-unavailable"><strong>Ventes non connectées</strong><span>StoreOps n’affiche aucune valeur estimée. Le mapping D365 ventes doit être validé avant activation LIVE.</span></div></div>`}
function sourceHealth(){
 const d=pulse?.diagnostics||{},stock=pulse?.stock||{},rows=Number(d.rows||0),excluded=Number(d.dataQuality?.excludedRows||0);
 return `<div class="performance-trust"><div><span>Transactions lues</span><strong>${number(rows)}</strong></div><div><span>Lignes exclues</span><strong>${number(excluded)}</strong><small>annulées / voidées</small></div><div><span>Stock & ruptures</span><strong>${stock.ruptureReady?'Prêt':'Partiel'}</strong><small>${esc(stock.supplyReadStatus||stock.assortmentState||'')}</small></div><div><span>Mapping ventes</span><strong>${esc(pulse?.integration?.mappingState||'—')}</strong><small>${esc(pulse?.integration?.entity||'source D365')}</small></div></div>`
}

export async function renderManagerPerformance(){
 try{
  pulse=await api(`/api/stores/${app.storeId}/business-pulse`);
  const host=$('#managerPerformanceContent');if(!host)return;
  if(pulse.status!=='READY'||!pulse.snapshot){host.innerHTML=unavailable(pulse);return}
  const k=pulse.snapshot.kpis||{},change=k.changeVsComparison,delta=k.comparisonDelta,stock=pulse.stock||{},dep=top('departments'),cat=top('categories'),prod=top('products'),hour=top('hourly');
  host.innerHTML=`<div class="performance-shell performance-dashboard">
   <div class="manager-hub-head performance-title"><div><span class="manager-eyebrow">BUSINESS PULSE · PILOTAGE</span><h2>Les chiffres du magasin</h2><p>Ventes, clients et disponibilité dans une seule lecture opérationnelle.</p></div><button class="btn soft" id="refreshPerformance">Actualiser</button></div>

   <section class="performance-section">
    <div class="performance-section-head"><div><strong>Ventes aujourd’hui</strong><span>Ce qui se passe réellement en caisse.</span></div><span class="performance-live">LIVE</span></div>
    <div class="performance-hero performance-sales-grid">
     ${metric('CA aujourd’hui',money(k.netSales),change==null?'Comparatif D-7 indisponible':`${pct(change)} vs D-7 · ${delta==null?'—':money(delta)}`,'sales')}
     ${metric('CA D-7',money(k.comparison),'Même jour semaine précédente')}
     ${metric('Tickets',number(k.tickets),`Panier moyen ${money(k.averageBasket)}`)}
     ${metric('Panier moyen',money(k.averageBasket),`${number(k.itemsPerTicket)} article(s) / ticket`)}
     ${metric('Articles vendus',number(k.units),k.salesPerUnit==null?'':`CA / article ${money(k.salesPerUnit)}`)}
     ${metric('Évolution CA',pct(change),delta==null?'—':`${Number(delta)>=0?'+':''}${money(delta)} vs D-7`,`trend ${tone(change)}`)}
    </div>
   </section>

   <section class="performance-section">
    <div class="performance-section-head"><div><strong>Customer & fidélité</strong><span>Identification, valeur client et recrutement.</span></div></div>
    <div class="performance-hero performance-customer-grid">
     ${metric('Poids CA encarté',ratio(k.identifiedSalesShare),k.identifiedSales==null?'CA identifié indisponible':money(k.identifiedSales)+' identifié','customer-main')}
     ${metric('Tickets identifiés',ratio(k.identifiedTicketRate),k.identifiedTickets==null?'—':number(k.identifiedTickets)+' ticket(s)')}
     ${metric('Panier encarté',money(k.identifiedAverageBasket),'panier moyen identifié')}
     ${metric('Panier non fidélité',money(k.nonLoyaltyAverageBasket),`${number(k.nonLoyaltyTickets)} ticket(s) non fidélité`)}
     ${metric('Uplift panier encarté',ratio(k.basketUpliftIdentified),k.basketUpliftIdentified==null?'Comparaison indisponible':'vs panier non fidélité',`trend ${tone(k.basketUpliftIdentified)}`)}
     ${metric('Nouveaux recrutés',number(k.recruitments),k.recruitments==null?'Source enrôlement à connecter':'cartes enrôlées aujourd’hui')}
     ${metric('Recrutement / non fidélité',ratio(k.recruitmentRateNonLoyalty),k.recruitmentRateNonLoyalty==null?'Source nouveaux recrutements à connecter':'nouveaux / tickets non fidélité','customer-main')}
    </div>
   </section>

   <section class="performance-section">
    <div class="performance-section-head"><div><strong>Disponibilité & stock</strong><span>Le chiffre ne suffit pas : ce qui risque de casser la vente.</span></div></div>
    <div class="performance-hero performance-stock-grid">
     ${metric('Ruptures',number(k.outOfStockCount),stock.ruptureReady?'vendu 30j · stock 0':'calcul stock incomplet',Number(k.outOfStockCount)>0?'danger':'')}
     ${metric('Proches ruptures',number(k.nearOutOfStockCount),`couverture ≤ ${stock.lowCoverageDays||'2,5'} j`,Number(k.nearOutOfStockCount)>0?'warn':'')}
     ${metric('Stocks négatifs',number(k.negativeStockCount),'à contrôler physiquement',Number(k.negativeStockCount)>0?'danger':'')}
     ${metric('Hors assortiment avec stock',number(k.residualOutsideAssortment),'stock résiduel à traiter')}
    </div>
   </section>

   <section class="performance-section">
    <div class="performance-section-head"><div><strong>Lecture rapide</strong><span>Où se fait le chiffre aujourd’hui.</span></div></div>
    <div class="performance-insights">
     ${insight('Top rayon',dep)}
     ${insight('Top catégorie',cat)}
     ${insight('Top article',prod)}
     ${insight('Heure la plus forte',hour,'hourly')}
    </div>
   </section>

   <section class="performance-section">
    <div class="performance-section-head"><div><strong>Décomposition du CA</strong><span>Descendez du rayon jusqu’à l’article.</span></div></div>
    <div class="performance-tabs">${['departments','categories','products','hourly'].map(x=>`<button data-performance-dim="${x}" class="${x===dimension?'active':''}">${tabLabel(x)}</button>`).join('')}</div>
    <div id="performanceRows" class="performance-list"></div>
   </section>

   ${sourceHealth()}
   <div class="pulse-actions"><span class="pulse-source">Source ${esc(pulse.source||'—')} · actualisé ${new Date(pulse.refreshedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span></div>
  </div>`;
  renderRows();
  document.querySelectorAll('[data-performance-dim]').forEach(b=>b.onclick=()=>{dimension=b.dataset.performanceDim;renderRows()});
  $('#refreshPerformance')?.addEventListener('click',async()=>{try{pulse=await api(`/api/stores/${app.storeId}/business-pulse/refresh`,{method:'POST'});toast('Business Pulse actualisé.');renderManagerPerformance()}catch(e){toast(e.message)}});
 }catch(e){toast(e.message);throw e}
}
