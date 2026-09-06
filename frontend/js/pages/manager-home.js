import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';
import { calculateStoreHealth } from '../store-health.js';
import { managerPhase,managerPhaseLabel } from '../manager-journey.js';
import { managerDayCompliance } from '../manager-compliance.js';
import { loadManagerInbox,actionKind,categoryLabel,syncManagerNav } from '../manager-action-inbox.js';

function actionCard(i){
  const kind=actionKind(i);
  return `<button class="manager-action-card ${i.severity==='CRITICAL'?'critical':''}" data-manager-go="${esc(i.page)}"><div><div class="chips"><span class="chip ${kind}">${esc(categoryLabel(i.category))}</span>${i.blocking?'<span class="chip danger">Bloquant</span>':''}${i.meta?`<span class="chip">${esc(i.meta)}</span>`:''}</div><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></div><span class="arrow">›</span></button>`;
}

function phaseStrip(phase){
  const order=['OPENING','DAY','CLOSING'],labels={OPENING:'Ouverture',DAY:'Exploitation',CLOSING:'Fermeture'};
  const idx=phase==='CLOSED'?3:Math.max(0,order.indexOf(phase));
  return `<div class="manager-phase-strip">${order.map((p,i)=>`<div class="manager-phase-step ${i<idx?'done':i===idx?'current':'next'}"><span>${i<idx?'✓':i+1}</span><strong>${labels[p]}</strong></div>`).join('')}</div>`;
}

export async function renderManagerHome(){
  const inbox=await loadManagerInbox();
  syncManagerNav(inbox);
  const d=inbox.dashboard,store=currentStore(),phase=managerPhase(d),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0];
  const hours=store?.opening_time&&store?.closing_time?`${store.opening_time}–${store.closing_time}`:'';
  const health=calculateStoreHealth({dashboard:d,staff:inbox.staff,cold:inbox.cold,cashOpen:inbox.cashOpen,receipts:inbox.receipts,quality:inbox.quality,maintenance:inbox.maintenance,loss:inbox.lossData.summary||{}});
  const compliance=managerDayCompliance({dashboard:d,staff:inbox.staff,cold:inbox.cold,cashOpen:inbox.cashOpen,receipts:inbox.receipts,quality:inbox.quality,maintenance:inbox.maintenance,loss:inbox.lossData.summary||{}});
  const top=inbox.items.slice(0,5),remaining=Math.max(0,inbox.items.length-top.length);
  const title=phase==='OPENING'?'Préparez le magasin sans rien oublier.':phase==='CLOSING'?'Sécurisez la fin de journée.':phase==='CLOSED'?'Journée terminée.':'Pilotez les exceptions, pas les menus.';

  $('#todayContent').innerHTML=`
    <div class="manager-home manager-home-simple">
      <div class="manager-inbox-head">
        <span class="manager-eyebrow">Bonjour ${esc(firstName)} · ${esc(store?.name||'Magasin')}</span>
        <h2>${esc(title)}</h2>
        <p>${inbox.summary.total?`${inbox.summary.total} action(s) demandent votre attention.`:'Aucune action urgente pour le moment.'}</p>
      </div>

      <div class="manager-inbox-stats">
        <button class="manager-inbox-stat ${inbox.summary.blocking?'danger':''}" data-manager-go="managerControls"><strong>${inbox.summary.total}</strong><span>À valider</span></button>
        <button class="manager-inbox-stat ${inbox.summary.alertCritical?'danger':''}" data-manager-go="incidents"><strong>${inbox.summary.alerts}</strong><span>Alertes</span></button>
        <div class="manager-inbox-stat"><strong>${health.score}</strong><span>Santé / 100</span></div>
      </div>

      ${inbox.summary.alerts?`<div class="manager-alert-strip"><div><strong>${inbox.summary.alerts} alerte(s) ouverte(s)</strong><small>${inbox.summary.alertCritical?`${inbox.summary.alertCritical} critique(s) · `:''}actions correctives, preuves et clôture</small></div><button data-manager-go="incidents">Traiter</button></div>`:''}

      <section class="manager-inbox-section">
        <div class="manager-inbox-section-head"><div><h3>À faire maintenant</h3><span>Trié par blocage et priorité métier.</span></div>${inbox.summary.blocking?status(`${inbox.summary.blocking} bloquant(s)`,'danger'):status('Priorisé','neutral')}</div>
        <div class="manager-action-list">${top.length?top.map(actionCard).join(''):'<div class="manager-all-good"><strong>Rien à valider.</strong><span>StoreOps vous préviendra dès qu’un contrôle ou une anomalie apparaît.</span></div>'}</div>
        ${remaining?`<button class="btn soft" data-manager-go="managerControls" style="width:100%;margin-top:10px">Voir les ${remaining} autres action(s)</button>`:''}
      </section>

      <section class="manager-journey-compact">
        <div class="row"><div><span class="manager-eyebrow">Parcours magasin</span><strong>${managerPhaseLabel(phase)} · ${hours||'horaires magasin'}</strong></div><button class="btn ghost" data-manager-go="managerJourney">Ouvrir</button></div>
        <div style="margin-top:10px">${phaseStrip(phase)}</div>
      </section>

      <section class="manager-completion-strip" style="margin-top:14px"><div class="row"><div><span class="manager-eyebrow">Traçabilité du jour</span><strong>${compliance.done}/${compliance.total} obligation(s) réalisée(s)</strong></div><strong class="manager-completion-percent">${compliance.percent}%</strong></div>${progress(compliance.percent)}</section>
    </div>`;
}
