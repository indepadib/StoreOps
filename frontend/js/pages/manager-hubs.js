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

export async function renderManagerJourney(){
  const d=await api(`/api/stores/${app.storeId}/dashboard`),phase=managerPhase(d),store=currentStore();
  $('#managerJourneyContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">${esc(store?.name||'Magasin')}</span><h2>Votre journée, dans le bon ordre.</h2><p>Commencez par l’ouverture, pilotez les contrôles du jour, puis clôturez. StoreOps garde le fil pour vous.</p></div>
    <div class="manager-journey-stack">
      <button class="manager-journey-card ${phase==='OPENING'?'current':''} ${['DAY','CLOSING','CLOSED'].includes(phase)?'done':''}" data-manager-go="opening"><span class="manager-step-index">${['DAY','CLOSING','CLOSED'].includes(phase)?'✓':'1'}</span><div><span class="manager-eyebrow">Étape 1</span><h3>Ouverture</h3><p>Équipe, sécurité, froid, technique, prix et caisses.</p>${progress(d.opening?.percent||0)}</div><strong>${d.opening?.percent||0}%</strong></button>
      <button class="manager-journey-card ${phase==='DAY'?'current':''}" data-manager-go="managerControls"><span class="manager-step-index">2</span><div><span class="manager-eyebrow">Étape 2</span><h3>Exploitation</h3><p>Traitez uniquement les contrôles et alertes qui apparaissent pendant la journée.</p></div><strong>${phase==='DAY'?status('En cours','ok'):status(phase==='OPENING'?'À venir':'Fait','neutral')}</strong></button>
      <button class="manager-journey-card ${phase==='CLOSING'?'current':''} ${phase==='CLOSED'?'done':''}" data-manager-go="closing"><span class="manager-step-index">${phase==='CLOSED'?'✓':'3'}</span><div><span class="manager-eyebrow">Étape 3</span><h3>Fermeture</h3><p>Caisses, pertes, stock, passation et sécurisation finale.</p>${progress(d.closing?.percent||0)}</div><strong>${d.closing?.percent||0}%</strong></button>
    </div>
    <div class="card manager-handover-shortcut"><div><strong>Passation</strong><p class="small muted">${d.handover?.pending||0} sujet(s) en cours · ${d.handover?.blocking||0} bloquant(s).</p></div><button class="btn soft" data-manager-go="handover">Ouvrir</button></div>`;
}

export async function renderManagerControls(){
  const d=await api(`/api/stores/${app.storeId}/dashboard`),phase=managerPhase(d);
  $('#managerControlsContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">${managerPhaseLabel(phase)}</span><h2>Mes contrôles magasin</h2><p>Tout est regroupé ici. Vous n’avez plus besoin de chercher le bon onglet.</p></div>
    <div class="manager-control-groups">
      <section><div class="manager-section-label">Ouverture</div>${controlItems.slice(0,4).map(x=>navCard(...x)).join('')}</section>
      <section><div class="manager-section-label">Pendant la journée</div>${controlItems.slice(4,10).map(x=>navCard(...x)).join('')}</section>
      <section><div class="manager-section-label">Fin de journée</div>${navCard(...controlItems[10])}${navCard('closing','Fermeture magasin','Parcours final de sécurisation et clôture.')}</section>
    </div>`;
}

export async function renderManagerMore(){
  $('#managerMoreContent').innerHTML=`
    <div class="manager-hub-head"><span class="manager-eyebrow">Plus</span><h2>Tous les outils</h2><p>Les fonctions moins fréquentes restent accessibles ici, sans encombrer votre parcours principal.</p></div>
    <div class="manager-more-grid">
      ${navCard('handover','Passation','Sujets transmis entre équipes et journées.')}
      ${navCard('incidents','Incidents & actions','Actions correctives, preuves et clôture.')}
      ${navCard('inventory','Stock & inventaire','Inventaires et écarts de stock.')}
      ${navCard('quality','Qualité','Contrôles ponctuels et historique.')}
      ${navCard('maintenance','Maintenance','Pannes et remises en service.')}
      ${navCard('losses','Démarque & pertes','Sorties et justificatifs.')}
    </div>`;
}
