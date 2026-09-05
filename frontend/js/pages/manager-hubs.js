import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';
import { managerPhase,managerPhaseLabel } from '../manager-journey.js';

const controlItems=[
  ['staffing','Équipe & prise de poste','Présences, couverture et remplacements.'],
  ['coldChain','Chaîne du froid','Températures et conformité des zones.'],
  ['cashOpening','Préparation caisses','POS, TPE, fonds et shifts prêts.'],
  ['commercial','Prix & promotions','Prix rayon, signalétique et promos Dynamics.'],
  ['receipts','Réception','Quantités et contrôle qualité article par article.'],
  ['dlc','DLC / DDM','Périmés, alertes et FEFO.'],
  ['inventory','Stock & inventaire','Comptages, recomptages et écarts.'],
  ['quality','Qualité','Contrôles terrain et non-conformités.'],
  ['maintenance','Maintenance','Pannes et indisponibilités équipements.'],
  ['losses','Démarque & pertes','Casse, périmés, avaries, vols.'],
  ['cash','Caisses & clôture','Rapprochement des shifts et moyens de paiement.']
];

const navCard=(page,title,detail,meta='')=>`<button class="manager-hub-card" data-manager-go="${page}"><div><strong>${esc(title)}</strong><p>${esc(detail)}</p>${meta?`<small>${esc(meta)}</small>`:''}</div><span>›</span></button>`;

function guidedCopy(phase,d){
  if(phase==='OPENING')return{eyebrow:'Étape 1 sur 3',title:'Ouvrir le magasin',detail:`${d.opening?.done||0}/${d.opening?.total||0} étapes faites. StoreOps vous montre uniquement la prochaine.`,page:'opening',cta:'Continuer l’ouverture'};
  if(phase==='CLOSING')return{eyebrow:'Étape 3 sur 3',title:'Fermer le magasin',detail:`${d.closing?.done||0}/${d.closing?.total||0} étapes faites. Terminez les contrôles puis sécurisez le magasin.`,page:'closing',cta:'Continuer la fermeture'};
  if(phase==='CLOSED')return{eyebrow:'Journée terminée',title:'Tout est clôturé',detail:'Les contrôles et preuves du jour sont enregistrés. Vous pouvez consulter le résumé.',page:'today',cta:'Voir le résumé'};
  return{eyebrow:'Étape 2 sur 3',title:'Piloter la journée',detail:'StoreOps fait remonter uniquement ce qui demande votre attention. Pas besoin de parcourir tous les modules.',page:'today',cta:'Voir ce qui est à faire'};
}

function phaseDots(phase){
  const order=['OPENING','DAY','CLOSING'],idx=phase==='CLOSED'?3:order.indexOf(phase);
  return`<div class="manager-guided-progress" aria-label="Progression de la journée">${order.map((_,i)=>`<span class="${i<idx?'done':i===idx?'current':''}"></span>`).join('')}</div>`;
}

export async function renderManagerJourney(){
  const d=await api(`/api/stores/${app.storeId}/dashboard`),phase=managerPhase(d),store=currentStore(),g=guidedCopy(phase,d);
  $('#managerJourneyContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">${esc(store?.name||'Magasin')}</span><h2>Votre journée</h2><p>Une seule étape à la fois.</p></div>
    <section class="manager-guided-card">
      <span class="manager-eyebrow">${esc(g.eyebrow)}</span>
      <h2>${esc(g.title)}</h2>
      <p>${esc(g.detail)}</p>
      ${phaseDots(phase)}
      <button class="btn brand manager-guided-cta" data-manager-go="${esc(g.page)}">${esc(g.cta)} →</button>
      <div class="manager-guided-secondary"><button class="btn ghost" data-manager-go="managerControls">Voir tous les contrôles</button></div>
    </section>
    <details class="card manager-guided-summary">
      <summary><strong>Voir le détail de la journée</strong></summary>
      <div style="margin-top:14px">
        <div class="manager-progress-row"><span>Ouverture</span>${progress(d.opening?.percent||0)}<strong>${d.opening?.percent||0}%</strong></div>
        <div class="manager-progress-row"><span>Fermeture</span>${progress(d.closing?.percent||0)}<strong>${d.closing?.percent||0}%</strong></div>
        <div class="focus-meta"><span>Phase actuelle</span>${status(managerPhaseLabel(phase),phase==='CLOSED'?'ok':phase==='OPENING'||phase==='CLOSING'?'warn':'neutral')}</div>
        <div class="focus-meta"><span>Passation en cours</span><strong>${d.handover?.pending||0}</strong></div>
      </div>
    </details>`;
}

export async function renderManagerControls(){
  const d=await api(`/api/stores/${app.storeId}/dashboard`),phase=managerPhase(d);
  $('#managerControlsContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">${managerPhaseLabel(phase)}</span><h2>Mes contrôles</h2><p>Utilisez cet écran seulement si vous voulez accéder directement à un contrôle.</p></div>
    <div class="manager-control-groups">
      <section><div class="manager-section-label">Démarrage</div>${controlItems.slice(0,4).map(x=>navCard(...x)).join('')}</section>
      <section><div class="manager-section-label">Magasin</div>${controlItems.slice(4,10).map(x=>navCard(...x)).join('')}</section>
      <section><div class="manager-section-label">Fin de journée</div>${navCard(...controlItems[10])}${navCard('closing','Fermeture magasin','Parcours final de sécurisation et clôture.')}</section>
    </div>`;
}

export async function renderManagerMore(){
  $('#managerMoreContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">Plus</span><h2>Outils</h2><p>Les fonctions moins fréquentes restent ici.</p></div>
    <div class="manager-more-grid">
      ${navCard('handover','Passation','Sujets transmis entre équipes et journées.')}
      ${navCard('incidents','Incidents & actions','Actions correctives, preuves et clôture.')}
      ${navCard('inventory','Stock & inventaire','Inventaires et écarts de stock.')}
      ${navCard('quality','Qualité','Contrôles ponctuels et historique.')}
      ${navCard('maintenance','Maintenance','Pannes et remises en service.')}
      ${navCard('losses','Démarque & pertes','Sorties et justificatifs.')}
    </div>`;
}
