import {api} from '../api.js';
import {app} from '../state.js';
import {esc,fmtMoney,status} from '../ui.js';

const val=(r,fallback=null)=>r?.status==='fulfilled'?r.value:fallback;
async function storeSnapshot(store){
 const [pulse,commercial,losses,inventory,po,to]=await Promise.allSettled([
  api(`/api/stores/${store.id}/business-pulse`),
  api(`/api/stores/${store.id}/commercial`),
  api(`/api/stores/${store.id}/losses`),
  api(`/api/stores/${store.id}/inventory?status=ALL`),
  api(`/api/stores/${store.id}/receipts/po`),
  api(`/api/stores/${store.id}/receipts/to`)
 ]);
 return{store,pulse:val(pulse,{}),commercial:val(commercial,{summary:{}}),losses:val(losses,{summary:{}}),inventory:val(inventory,{summary:{}}),po:val(po,[]),to:val(to,[])};
}
const n=v=>Number(v||0).toLocaleString('fr-FR');
function card(x){
 const p=x.pulse?.snapshot?.kpis||{},c=x.commercial?.summary||{},l=x.losses?.summary||{},i=x.inventory?.summary||{};
 return`<article class="card"><div class="row"><div><span class="manager-eyebrow">CONTRÔLE DE GESTION</span><h3 style="margin:3px 0">${esc(x.store.name)}</h3></div>${status(x.pulse?.status==='READY'?'Données live':'À vérifier',x.pulse?.status==='READY'?'ok':'warn')}</div>
 <div class="grid g4" style="margin-top:12px">
  <div><span class="label">CA jour</span><strong class="kpi">${fmtMoney(p.netSales)}</strong></div>
  <div><span class="label">Prix / promos</span><strong class="kpi">${n(c.total)}</strong><div class="small muted">${n(c.mismatch)} écart(s)</div></div>
  <div><span class="label">Démarque coût</span><strong class="kpi">${fmtMoney(l.costValue)}</strong><div class="small muted">couverture ${n(l.costCoverage)}%</div></div>
  <div><span class="label">Écarts inventaire</span><strong class="kpi">${n(i.varianceLines)}</strong><div class="small muted">${n(i.openSessions)} session(s) ouverte(s)</div></div>
 </div>
 <div class="small muted" style="margin-top:10px">Réceptions : ${x.po.length} PO · ${x.to.length} TO · lecture seule réseau</div></article>`
}
export async function renderControlling(){
 const host=document.querySelector('#controllingContent');if(!host)return;
 host.innerHTML='<div class="card">Chargement de la vue Contrôle de gestion…</div>';
 const rows=await Promise.all((app.stores||[]).map(storeSnapshot));
 host.innerHTML=`<div class="banner ban-info"><strong>Vue Contrôle de gestion · lecture seule</strong><span>Prix/promos, réceptions, coûts de démarque et inventaires sur tous les magasins autorisés. Aucune écriture opérationnelle.</span></div><div class="stack" style="margin-top:14px">${rows.map(card).join('')}</div>`
}
