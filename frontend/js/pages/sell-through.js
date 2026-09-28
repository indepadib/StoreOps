import {api} from '../api.js';
import {app} from '../state.js';
import {$,esc,toast} from '../ui.js';

let data=null,filter='ALL';
const n=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1});
const label=t=>t==='DEAD'?'Aucune vente':'Rotation lente';
function rows(){return (data?.items||[]).filter(x=>filter==='ALL'||x.type===filter)}
function card(x){
 const action=x.type==='DEAD'?'Vérifier rayon puis décider':'Réduire le stock / accélérer la vente';
 return `<article class="growth-item ${x.type==='DEAD'?'danger':'warn'}"><div class="growth-item-head"><div><span class="growth-chip">${label(x.type)}</span><strong>${esc(x.name||x.productNumber)}</strong><small>${esc(x.category||x.productNumber)}</small></div><div class="growth-stock"><b>${n(x.availableStock)}</b><span>en stock</span></div></div><p>${esc(x.reason)}</p><div class="growth-facts">${x.type==='SLOW'?`<span><b>${n(x.dailySales)}/j</b> rythme</span><span><b>${n(x.coverageDays)} j</b> couverture</span>`:`<span><b>${x.noSaleDays} j</b> sans vente</span>`}<span><b>${esc(action)}</b></span></div><div class="growth-actions"><button class="btn soft" data-manager-go="inventory">Contrôler stock</button><button class="btn brand" data-coolsave-product="${esc(x.productNumber)}">Cool & Save</button></div></article>`;
}
function draw(){
 const host=$('#sellThroughContent');if(!host||!data)return;const s=data.summary||{};
 host.innerHTML=`<div class="growth-shell"><div class="manager-hub-head"><span class="manager-eyebrow">ROTATION & INVENDUS</span><h2>Ce qui ne se vend pas mérite une action.</h2><p>StoreOps distingue les articles sans aucune vente des surstocks à rotation lente.</p></div><div class="growth-kpis"><div><span>Aucune vente</span><strong>${n(s.dead)}</strong><small>${n(s.deadStockUnits)} u. en stock</small></div><div><span>Rotation lente</span><strong>${n(s.slow)}</strong><small>${n(s.slowStockUnits)} u. en stock</small></div><div><span>Fenêtre analysée</span><strong>${data.windowDays||30} j</strong><small>Dynamics ventes + stock</small></div></div><div class="growth-filter"><button data-sell-filter="ALL" class="${filter==='ALL'?'active':''}">Tous</button><button data-sell-filter="DEAD" class="${filter==='DEAD'?'active':''}">Aucune vente</button><button data-sell-filter="SLOW" class="${filter==='SLOW'?'active':''}">Rotation lente</button></div><div class="growth-list">${rows().map(card).join('')||'<div class="growth-empty"><strong>Rien à traiter.</strong><span>Aucun dormant ou surstock significatif détecté avec les seuils actuels.</span></div>'}</div><div class="growth-trust">Seuils actuels : aucune vente ≥ ${data.thresholds?.deadNoSaleDays||30} jours · rotation lente ≥ ${data.thresholds?.slowCoverageDays||30} jours de couverture.</div></div>`;
 host.querySelectorAll('[data-sell-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.sellFilter;draw()});
 host.querySelectorAll('[data-coolsave-product]').forEach(b=>b.onclick=()=>{try{sessionStorage.setItem('storeops_coolsave_prefill',b.dataset.coolsaveProduct)}catch{};document.querySelector('[data-page="coolSave"]')?.click()});
}
export async function renderSellThrough(){
 const host=$('#sellThroughContent');if(host)host.innerHTML='<div class="growth-loading">Analyse ventes + stock…</div>';
 try{data=await api(`/api/stores/${app.storeId}/sell-through`);draw()}catch(e){if(host)host.innerHTML=`<div class="growth-error">${esc(e.message)}</div>`;toast(e.message)}
}
