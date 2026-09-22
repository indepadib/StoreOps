import {api} from '../api.js';
import {app} from '../state.js';
import {esc,fmtMoney,status} from '../ui.js';

async function snap(store){
 const [pulse,losses,inventory,po,to]=await Promise.allSettled([
  api(`/api/stores/${store.id}/business-pulse`),
  api(`/api/stores/${store.id}/losses`),
  api(`/api/stores/${store.id}/inventory?status=ALL`),
  api(`/api/stores/${store.id}/receipts/po`),
  api(`/api/stores/${store.id}/receipts/to`)
 ]);
 const get=(x,f)=>x.status==='fulfilled'?x.value:f;
 return{store,pulse:get(pulse,{}),losses:get(losses,{summary:{}}),inventory:get(inventory,{summary:{}}),po:get(po,[]),to:get(to,[])}
}
const num=v=>Number(v||0);
function storeCard(x){
 const k=x.pulse?.snapshot?.kpis||{},l=x.losses?.summary||{},i=x.inventory?.summary||{};
 return`<article class="card"><div class="row"><div><span class="manager-eyebrow">MAGASIN</span><h3 style="margin:3px 0">${esc(x.store.name)}</h3></div>${status(x.pulse?.status==='READY'?'Live':'À vérifier',x.pulse?.status==='READY'?'ok':'warn')}</div>
 <div class="grid g4" style="margin-top:12px"><div><span class="label">CA</span><strong class="kpi">${fmtMoney(k.netSales)}</strong></div><div><span class="label">Tickets</span><strong class="kpi">${num(k.tickets).toLocaleString('fr-FR')}</strong></div><div><span class="label">Panier</span><strong class="kpi">${fmtMoney(k.averageBasket)}</strong></div><div><span class="label">Ruptures</span><strong class="kpi">${k.outOfStockCount==null?'—':num(k.outOfStockCount).toLocaleString('fr-FR')}</strong></div></div>
 <div class="small muted" style="margin-top:10px">Démarque coût ${fmtMoney(l.costValue)} · ${num(i.openSessions)} inventaire(s) ouvert(s) · ${x.po.length+x.to.length} réception(s) visible(s)</div></article>`
}
export async function renderExecutive(){
 const host=document.querySelector('#executiveContent');if(!host)return;
 host.innerHTML='<div class="card">Chargement du cockpit dirigeant…</div>';
 const rows=await Promise.all((app.stores||[]).map(snap));
 const ca=rows.reduce((s,x)=>s+num(x.pulse?.snapshot?.kpis?.netSales),0),tickets=rows.reduce((s,x)=>s+num(x.pulse?.snapshot?.kpis?.tickets),0),ruptures=rows.reduce((s,x)=>s+num(x.pulse?.snapshot?.kpis?.outOfStockCount),0);
 host.innerHTML=`<div class="banner ban-info"><strong>Cockpit Dirigeant / Finance</strong><span>Lecture réseau haut niveau. Aucun contrôle ni écriture opérationnelle depuis cette vue.</span></div>
 <div class="grid g4" style="margin-top:14px"><div class="card"><div class="label">CA réseau jour</div><div class="kpi">${fmtMoney(ca)}</div></div><div class="card"><div class="label">Tickets</div><div class="kpi">${tickets.toLocaleString('fr-FR')}</div></div><div class="card"><div class="label">Panier réseau</div><div class="kpi">${fmtMoney(tickets?ca/tickets:null)}</div></div><div class="card"><div class="label">Ruptures</div><div class="kpi">${ruptures.toLocaleString('fr-FR')}</div></div></div>
 <div class="stack" style="margin-top:14px">${rows.map(storeCard).join('')}</div>`
}
