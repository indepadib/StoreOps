import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';
import { managerPhase,managerPhaseLabel } from '../manager-journey.js';
import { loadManagerInbox,actionKind,categoryLabel,priorityLabel,syncManagerNav } from '../manager-action-inbox.js';

const navCard=(page,title,detail,meta='')=>`<button class="manager-hub-card" data-manager-go="${page}"><div><strong>${esc(title)}</strong><p>${esc(detail)}</p>${meta?`<small>${esc(meta)}</small>`:''}</div><span>›</span></button>`;

function actionCard(i){
  const kind=actionKind(i),pclass=i.priority==='P0'?'priority-p0':i.priority==='P1'?'priority-p1':'';
  return`<button class="manager-action-card ${i.priority==='P0'?'critical':''}" data-manager-go="${esc(i.page)}"><div><div class="chips"><span class="chip ${pclass}">${esc(priorityLabel(i.priority))}</span><span class="chip ${kind}">${esc(categoryLabel(i.category))}</span>${i.blocking?'<span class="chip danger">Bloquant</span>':''}${i.meta?`<span class="chip">${esc(i.meta)}</span>`:''}</div><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></div><span class="arrow">›</span></button>`;
}

function guidedCopy(phase,d){
  if(phase==='OPENING')return{eyebrow:'Ouverture',title:'Ouvrir le magasin',detail:`${d.opening?.done||0}/${d.opening?.total||0} étapes validées. Une validation → l’étape suivante.`,page:'opening',cta:'Reprendre l’ouverture'};
  if(phase==='CLOSING')return{eyebrow:'Fermeture',title:'Fermer le magasin',detail:`${d.closing?.done||0}/${d.closing?.total||0} étapes validées. StoreOps vous guide jusqu’à la clôture.`,page:'closing',cta:'Reprendre la fermeture'};
  if(phase==='CLOSED')return{eyebrow:'Terminé',title:'Journée clôturée',detail:'Les validations, alertes et preuves de la journée sont enregistrées.',page:'today',cta:'Voir le résumé'};
  return{eyebrow:'Exploitation',title:'Piloter le magasin',detail:'Traitez les validations et alertes au fil de la journée. Le parcours reste disponible ici.',page:'managerControls',cta:'Voir ce qui est à valider'};
}

function phaseDots(phase){const order=['OPENING','DAY','CLOSING'],idx=phase==='CLOSED'?3:order.indexOf(phase);return`<div class="manager-guided-progress" aria-label="Progression de la journée">${order.map((_,i)=>`<span class="${i<idx?'done':i===idx?'current':''}"></span>`).join('')}</div>`}

export async function renderManagerJourney(){
  const [d,inbox]=await Promise.all([api(`/api/stores/${app.storeId}/dashboard`),loadManagerInbox()]);
  syncManagerNav(inbox);
  const phase=managerPhase(d),store=currentStore(),g=guidedCopy(phase,d);
  $('#managerJourneyContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">${esc(store?.name||'Magasin')}</span><h2>Votre journée</h2><p>Une seule étape à la fois. Vous validez, StoreOps passe automatiquement à la suite.</p></div>
    ${inbox.summary.p0?`<section class="manager-alert-strip"><div><strong>${inbox.summary.p0} action(s) immédiate(s)</strong><small>Traitez-les avant de poursuivre le jalon magasin.</small></div><button data-manager-go="managerControls">Voir</button></section>`:''}
    <section class="manager-guided-card">
      <span class="manager-eyebrow">${esc(g.eyebrow)}</span><h2>${esc(g.title)}</h2><p>${esc(g.detail)}</p>${phaseDots(phase)}
      <button class="btn brand manager-guided-cta" data-manager-go="${esc(g.page)}">${esc(g.cta)} →</button>
    </section>
    <section class="card manager-guided-summary" style="margin-top:12px">
      <div class="manager-progress-row"><span>Ouverture</span>${progress(d.opening?.percent||0)}<strong>${d.opening?.percent||0}%</strong></div>
      <div class="manager-progress-row"><span>Fermeture</span>${progress(d.closing?.percent||0)}<strong>${d.closing?.percent||0}%</strong></div>
      <div class="focus-meta"><span>Phase actuelle</span>${status(managerPhaseLabel(phase),phase==='CLOSED'?'ok':phase==='OPENING'||phase==='CLOSING'?'warn':'neutral')}</div>
    </section>`;
}

export async function renderManagerControls(){
  const inbox=await loadManagerInbox();syncManagerNav(inbox);
  const priorityGroups=[
    ['P0','À traiter immédiatement','Sécurité, stock négatif, rupture promo ou non-conformité critique.'],
    ['P1','Prioritaire','Ruptures, recomptages, prix/promos et retards à traiter rapidement.'],
    ['P2','À faire aujourd’hui','Validations restantes du parcours opérationnel.'],
    ['P3','À surveiller','Sujets non urgents à garder sous contrôle.']
  ];
  const stockSource=inbox.stockData?.source?`${inbox.stockData.source}${inbox.stockData.warehouse?` · ${inbox.stockData.warehouse}`:''}`:'';
  $('#managerControlsContent').innerHTML=`
    <div class="manager-inbox-head"><span class="manager-eyebrow">File de travail Responsable</span><h2>À valider</h2><p>Une seule liste, triée par impact magasin. Les plus urgents sont toujours en haut.</p></div>
    <div class="manager-inbox-stats"><div class="manager-inbox-stat ${inbox.summary.p0?'danger':''}"><strong>${inbox.summary.p0}</strong><span>Immédiats</span></div><div class="manager-inbox-stat ${inbox.summary.p1?'danger':''}"><strong>${inbox.summary.p1}</strong><span>Prioritaires</span></div><button class="manager-inbox-stat ${inbox.summary.alertCritical?'danger':''}" data-manager-go="incidents"><strong>${inbox.summary.alerts}</strong><span>Alertes</span></button></div>
    ${stockSource?`<div class="small muted" style="margin:-3px 2px 12px">Stock : ${esc(stockSource)}</div>`:''}
    ${inbox.items.length?priorityGroups.map(([key,label,detail])=>{const rows=inbox.items.filter(x=>x.priority===key);return rows.length?`<section class="manager-inbox-section"><div class="manager-inbox-section-head"><div><h3>${esc(label)}</h3><span>${esc(detail)}</span></div><strong>${rows.length}</strong></div><div class="manager-action-list">${rows.map(actionCard).join('')}</div></section>`:''}).join(''):'<div class="manager-all-good"><strong>Tout est validé.</strong><span>Aucune action en attente pour ce magasin.</span></div>'}
    ${inbox.alerts.length?`<section class="manager-alert-strip"><div><strong>${inbox.alerts.length} alerte(s) à traiter séparément</strong><small>Problèmes / incidents avec action corrective, preuve et clôture.</small></div><button data-manager-go="incidents">Ouvrir</button></section>`:''}`;
}

export async function renderManagerMore(){
  const inbox=await loadManagerInbox();syncManagerNav(inbox);
  $('#managerMoreContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">Plus</span><h2>Tous les outils</h2><p>Accès direct aux modules quand vous ne passez pas par la file « À valider ».</p></div>
    <div class="manager-more-grid">
      ${navCard('commercial','Prix & promotions','Scan prix, changements du jour et promotions.')}
      ${navCard('inventory','Stock & inventaire','Comptages, recomptages, ruptures et écarts.')}
      ${navCard('receipts','Réception','Contrôle qualité article par article.')}
      ${navCard('dlc','DLC / DDM','Contrôle article et alertes DLC.')}
      ${navCard('handover','Passation','Sujets transmis entre équipes et journées.')}
      ${navCard('quality','Qualité','Contrôles ponctuels et historique.')}
      ${navCard('maintenance','Maintenance','Pannes et remises en service.')}
      ${navCard('losses','Démarque & pertes','Sorties et justificatifs.')}
      ${navCard('cash','Caisses & clôture','Rapprochement des shifts et moyens de paiement.')}
    </div>`;
}
