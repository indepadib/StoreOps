import {api} from './api.js';
import {app} from './state.js';
import {esc,status,toast} from './ui.js';

const STAGE_LABELS={
  CRITERIA:'Cadrage & critères',
  SOURCING:'Sourcing & remontée',
  QUALIFICATION:'Qualification & visite',
  NEGOTIATION:'Négociation locative',
  COMMITTEE:'Comité Expansion',
  BUSINESS_PLAN:'Business Plan & validations',
  LEGAL_TECHNICAL:'Sécurisation juridique & technique',
  FINAL_DECISION:'Décision finale & signature',
  CLOSING_HANDOVER:'Closing & passation'
};
const STAGE_INTENT={
  CRITERIA:'Confirmer que l’opportunité entre dans le format, la zone, la surface et les règles d’implantation validées.',
  SOURCING:'Centraliser une opportunité traçable, documentée et sans engagement envers le bailleur.',
  QUALIFICATION:'Qualifier objectivement le site sur dossier puis sur le terrain avant toute négociation engageante.',
  NEGOTIATION:'Négocier les termes locatifs de façon non engageante et tracer la fiche de négociation.',
  COMMITTEE:'Présenter un dossier standardisé et tracer l’avis du Comité Expansion ainsi que ses éventuelles réserves.',
  BUSINESS_PLAN:'Faire établir et challenger le BP, obtenir l’avis Exploitation, la revue DAF puis l’approbation DG.',
  LEGAL_TECHNICAL:'Sécuriser le titre, le bailleur, le projet de bail, la faisabilité technique et lever les réserves bloquantes.',
  FINAL_DECISION:'Obtenir l’autorisation finale d’engagement, signer par le représentant habilité et déclencher QHSE.',
  CLOSING_HANDOVER:'Finaliser le closing immobilier, la remise des clés, la passation aux équipes et l’archivage.'
};
const DECISION_LABELS={PENDING:'À décider',GO:'GO',HOLD:'HOLD',NO_GO:'NO GO'};
const PRIORITY_LABELS={LOW:'Basse',NORMAL:'Normale',HIGH:'Haute',CRITICAL:'Critique'};
let allowed=false,config=null,projects=[],selectedId=null,mode='board',filter='ALL',detecting=false;

function injectStyle(){
  if(document.querySelector('link[href="/development.css"]'))return;
  const l=document.createElement('link');
  l.rel='stylesheet';
  l.href='/development.css';
  document.head.appendChild(l);
}
function ensureShell(){
  injectStyle();
  const nav=document.getElementById('nav');
  if(nav&&!document.getElementById('developmentNav')){
    const b=document.createElement('button');
    b.id='developmentNav';
    b.dataset.page='development';
    b.textContent='Développement';
    b.hidden=true;
    nav.appendChild(b);
  }
  const main=document.querySelector('main');
  if(main&&!document.getElementById('developmentPage')){
    const s=document.createElement('section');
    s.className='page';
    s.id='developmentPage';
    s.innerHTML='<div id="developmentContent"></div>';
    main.appendChild(s);
  }
}
function isAdminSession(){return app.user?.role==='ops_director'}
function polishAdminUsersCard(){
  const root=document.getElementById('adminStudioContent');
  const b=root?.querySelector('[data-studio-action="users"]');
  if(!b)return;
  b.classList.remove('future');
  const em=b.querySelector('em');if(em)em.textContent='Gérer les accès →';
  const small=b.querySelector('small');if(small)small.textContent='Créer les utilisateurs, choisir leur rôle, leur périmètre et leur magasin.';
}
async function detect(){
  if(detecting||!app.user)return;
  detecting=true;ensureShell();
  try{
    config=await api('/api/development/config');
    allowed=true;
    document.getElementById('developmentNav').hidden=false;
    if(!isAdminSession()){
      document.body.classList.add('development-only');
      setTimeout(openDevelopment,60);
    }else document.body.classList.remove('development-only');
    polishAdminUsersCard();
  }catch{
    allowed=false;
    document.getElementById('developmentNav').hidden=true;
  }finally{detecting=false}
}
async function load(){const r=await api('/api/development/projects');projects=r.items||[]}
function money(v){return v===null||v===undefined||v===''?'—':`${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:0})} DH`}
function date(v){if(!v)return'—';try{return new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('fr-FR')}catch{return String(v)}}
function nextStage(stage){const arr=(config?.stages||[]).map(x=>x.code);const i=arr.indexOf(stage);return i>=0&&i<arr.length-1?arr[i+1]:null}
function stageIndex(stage){return (config?.stages||[]).findIndex(x=>x.code===stage)}
function riskTone(p){return p?.risk?.severity==='danger'?'danger':p?.risk?.severity==='warn'?'warn':p?.risk?.severity==='ok'?'ok':'neutral'}
function decisionTone(v){return v==='GO'?'ok':v==='NO_GO'?'danger':v==='HOLD'?'warn':'neutral'}
function summary(){
  const active=projects.filter(p=>p.status==='ACTIVE');
  const blocked=projects.filter(p=>['BLOCKED','ACTION_LATE','OPENING_LATE'].includes(p.risk?.code));
  const soon=projects.filter(p=>p.daysToOpening!==null&&p.daysToOpening>=0&&p.daysToOpening<=90&&p.stage!=='CLOSING_HANDOVER');
  return{active:active.length,sourcing:active.filter(p=>['CRITERIA','SOURCING','QUALIFICATION'].includes(p.stage)).length,committee:active.filter(p=>p.stage==='COMMITTEE').length,bp:active.filter(p=>p.stage==='BUSINESS_PLAN').length,blocked:blocked.length,soon:soon.length};
}
function openDevelopment(){
  if(!allowed)return;
  ensureShell();
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById('developmentPage')?.classList.add('active');
  document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.id==='developmentNav'));
  window.scrollTo({top:0,behavior:'smooth'});
  load().then(render).catch(e=>toast(e.message));
}
function filtered(){
  if(filter==='ALL')return projects;
  if(filter==='ATTENTION')return projects.filter(x=>['BLOCKED','ACTION_LATE','OPENING_LATE','OPENING_SOON'].includes(x.risk?.code));
  return projects.filter(x=>x.stage===filter);
}
function projectCard(p){
  return `<button class="dev-project" data-dev-open="${esc(p.id)}">
    <div class="dev-project-top">
      <div><div class="label">${esc(STAGE_LABELS[p.stage]||p.stage)}</div><h3>${esc(p.name)}</h3><p>${esc([p.city,p.zone||p.address].filter(Boolean).join(' · '))}</p></div>
      <div class="dev-card-status">${status(p.risk?.label||'Sous contrôle',riskTone(p))}${status(DECISION_LABELS[p.decision]||p.decision,decisionTone(p.decision))}</div>
    </div>
    <div class="dev-project-meta">
      <div><span>Ouverture cible</span><strong>${date(p.target_opening_date)}</strong></div>
      <div><span>Responsable</span><strong>${esc(p.owner_name||'À affecter')}</strong></div>
      <div><span>Prochaine action</span><strong>${esc(p.next_action||'À définir')}</strong><small>${p.next_action_due_date?date(p.next_action_due_date):''}</small></div>
      <div><span>Gouvernance</span><strong>${p.stage==='BUSINESS_PLAN'?'BP & validations':p.stage==='LEGAL_TECHNICAL'?'Juridique / Technique':p.stage==='FINAL_DECISION'?'DG & signature':p.stage==='CLOSING_HANDOVER'?'Passation':money(p.capex_budget)}</strong></div>
    </div>
    ${p.blocker?`<div class="dev-blocker">⚠ ${esc(p.blocker)}</div>`:''}
    <div class="dev-progress"><span style="width:${Number(p.progress||0)}%"></span></div>
  </button>`;
}
function renderBoard(){
  const s=summary(),rows=filtered();
  return `<div class="dev-shell">
    <div class="dev-hero"><div><div class="label">DÉVELOPPEMENT & EXPANSION</div><h2>Du sourcing au bail signé, puis à la passation.</h2><p>Le parcours suit la procédure interne : qualification, négociation non engageante, Comité Expansion, Business Plan, sécurisation juridique et technique, décision DG, signature puis closing.</p></div><button class="btn brand" id="devNew">+ Nouvelle opportunité</button></div>
    <div class="dev-kpis dev-kpis-5"><div class="dev-kpi"><span>Dossiers actifs</span><strong>${s.active}</strong></div><div class="dev-kpi"><span>Amont / qualification</span><strong>${s.sourcing}</strong></div><div class="dev-kpi"><span>Au Comité</span><strong>${s.committee}</strong></div><div class="dev-kpi"><span>BP en cours</span><strong>${s.bp}</strong></div><div class="dev-kpi"><span>À surveiller</span><strong>${s.blocked}</strong></div></div>
    <div class="dev-stage-strip"><button class="dev-stage-chip ${filter==='ALL'?'active':''}" data-dev-filter="ALL">Tous · ${projects.length}</button><button class="dev-stage-chip ${filter==='ATTENTION'?'active':''}" data-dev-filter="ATTENTION">À surveiller · ${s.blocked}</button>${(config?.stages||[]).map(x=>`<button class="dev-stage-chip ${filter===x.code?'active':''}" data-dev-filter="${esc(x.code)}">${esc(x.label)} · ${projects.filter(p=>p.stage===x.code).length}</button>`).join('')}</div>
    ${rows.length?`<div class="dev-board">${rows.map(projectCard).join('')}</div>`:'<div class="dev-empty"><strong>Aucun projet dans ce périmètre.</strong><div>Créez une première opportunité pour démarrer le pipeline.</div></div>'}
  </div>`;
}
function opt(list,current,labels={}){return (list||[]).map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labels[v]||v)}</option>`).join('')}
function formValues(p={}){
  return `<div class="dev-form-grid">
    <label><span>Nom du projet *</span><input id="devName" value="${esc(p.name||'')}" placeholder="Ex. Franprix Racine"></label>
    <label><span>Ville *</span><input id="devCity" value="${esc(p.city||'Casablanca')}"></label>
    <label><span>Adresse / local</span><input id="devAddress" value="${esc(p.address||'')}" placeholder="Adresse ou repère"></label>
    <label><span>Zone / quartier</span><input id="devZone" value="${esc(p.zone||'')}"></label>
    <label><span>Source du lead</span><input id="devSource" value="${esc(p.source_lead||'')}" placeholder="Agent, propriétaire, réseau..."></label>
    <label><span>Surface m²</span><input id="devSurface" type="number" min="0" step="0.1" value="${p.surface_m2??''}"></label>
    <label><span>Propriétaire / bailleur</span><input id="devLandlord" value="${esc(p.landlord||'')}"></label>
    <label><span>Loyer mensuel DH</span><input id="devRent" type="number" min="0" step="1" value="${p.monthly_rent??''}"></label>
    <label><span>Pas-de-porte / droit d’entrée DH</span><input id="devKeyMoney" type="number" min="0" step="1" value="${p.key_money??''}"></label>
    <label><span>Budget travaux / CAPEX DH</span><input id="devCapex" type="number" min="0" step="1" value="${p.capex_budget??''}"></label>
    <label><span>CAPEX engagé DH</span><input id="devCapexCommitted" type="number" min="0" step="1" value="${p.capex_committed??''}"></label>
    <label><span>CAPEX réel DH</span><input id="devCapexActual" type="number" min="0" step="1" value="${p.capex_actual??''}"></label>
    <label><span>Score emplacement /100</span><input id="devSiteScore" type="number" min="0" max="100" value="${p.site_score??''}"></label>
    <label><span>Score économique /100</span><input id="devEconomicScore" type="number" min="0" max="100" value="${p.economic_score??''}"></label>
    <label><span>Enseigne</span><select id="devBrand"><option value="FRANPRIX" ${(p.brand||'FRANPRIX')==='FRANPRIX'?'selected':''}>Franprix</option><option value="MONOPRIX" ${p.brand==='MONOPRIX'?'selected':''}>Monoprix</option><option value="OTHER" ${p.brand==='OTHER'?'selected':''}>Autre enseigne</option></select></label>
    <label><span>Lien d’intérêt déclaré ?</span><select id="devConflict"><option value="0" ${!p.conflict_of_interest?'selected':''}>Non</option><option value="1" ${p.conflict_of_interest?'selected':''}>Oui</option></select></label>
    <label style="grid-column:1/-1"><span>Détail du lien d’intérêt / mitigation</span><input id="devConflictDetails" value="${esc(p.conflict_details||'')}" placeholder="À compléter uniquement si un lien d’intérêt existe"></label>
    <label><span>Avis Comité</span><select id="devCommitteeOpinion"><option value="PENDING" ${(p.committee_opinion||'PENDING')==='PENDING'?'selected':''}>À instruire</option><option value="FAVORABLE" ${p.committee_opinion==='FAVORABLE'?'selected':''}>Favorable</option><option value="RESERVATIONS" ${p.committee_opinion==='RESERVATIONS'?'selected':''}>Avec réserves</option><option value="UNFAVORABLE" ${p.committee_opinion==='UNFAVORABLE'?'selected':''}>Défavorable</option></select></label>
    <label><span>Statut BP</span><select id="devBpStatus"><option value="NOT_STARTED" ${(p.bp_status||'NOT_STARTED')==='NOT_STARTED'?'selected':''}>Non démarré</option><option value="IN_PROGRESS" ${p.bp_status==='IN_PROGRESS'?'selected':''}>En cours</option><option value="CONTROL_APPROVED" ${p.bp_status==='CONTROL_APPROVED'?'selected':''}>Contrôle de Gestion OK</option><option value="DAF_REVIEWED" ${p.bp_status==='DAF_REVIEWED'?'selected':''}>Revu DAF</option><option value="DG_APPROVED" ${p.bp_status==='DG_APPROVED'?'selected':''}>Approuvé DG</option><option value="REJECTED" ${p.bp_status==='REJECTED'?'selected':''}>Rejeté / à renégocier</option></select></label>
    <label><span>Validation Juridique</span><select id="devLegalStatus"><option value="PENDING" ${(p.legal_status||'PENDING')==='PENDING'?'selected':''}>À faire</option><option value="APPROVED" ${p.legal_status==='APPROVED'?'selected':''}>Validé</option><option value="BLOCKED" ${p.legal_status==='BLOCKED'?'selected':''}>Bloquant</option></select></label>
    <label><span>Validation Technique</span><select id="devTechnicalStatus"><option value="PENDING" ${(p.technical_status||'PENDING')==='PENDING'?'selected':''}>À faire</option><option value="APPROVED" ${p.technical_status==='APPROVED'?'selected':''}>Validé</option><option value="BLOCKED" ${p.technical_status==='BLOCKED'?'selected':''}>Bloquant</option></select></label>
    <label><span>Décision</span><select id="devDecision">${opt(config?.decisions||['PENDING','GO','HOLD','NO_GO'],p.decision||'PENDING',DECISION_LABELS)}</select></label>
    <label><span>Priorité</span><select id="devPriority">${opt(config?.priorities||['LOW','NORMAL','HIGH','CRITICAL'],p.priority||'NORMAL',PRIORITY_LABELS)}</select></label>
    <label><span>Ouverture cible</span><input id="devTarget" type="date" value="${esc(p.target_opening_date||'')}"></label>
    <label><span>Avancement travaux %</span><input id="devWorksProgress" type="number" min="0" max="100" value="${p.works_progress??0}"></label>
    <label><span>Responsable projet</span><select id="devOwner"><option value="">À affecter</option>${(config?.users||[]).map(u=>`<option value="${esc(u.id)}" ${u.id===p.owner_user_id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label>
    <label><span>Prochaine action</span><input id="devNextAction" value="${esc(p.next_action||'')}" placeholder="Ex. Obtenir projet de bail"></label>
    <label><span>Échéance prochaine action</span><input id="devNextActionDue" type="date" value="${esc(p.next_action_due_date||'')}"></label>
    <label><span>Blocage actuel</span><input id="devBlocker" value="${esc(p.blocker||'')}" placeholder="Vide si aucun blocage"></label>
    <label style="grid-column:1/-1"><span>Notes</span><textarea id="devNotes" placeholder="Contexte, contraintes, prochaines actions...">${esc(p.notes||'')}</textarea></label>
  </div>`;
}
function renderCreate(){
  return `<div class="dev-shell"><div class="dev-detail-head"><div><button class="btn ghost" id="devBack">← Pipeline</button><div class="label" style="margin-top:14px">NOUVEAU PROJET</div><h2>Créer une opportunité développement</h2><p class="muted">Le dossier démarre par le cadrage des critères puis suit les 9 étapes de la procédure Expansion jusqu’au closing et à la passation.</p></div></div><div class="dev-form">${formValues()}<div class="studio-savebar"><span class="small muted">Chaque changement d’étape est conditionné par les jalons obligatoires du parcours.</span><button class="btn brand" id="devCreateSave">Créer et démarrer le parcours</button></div></div></div>`;
}
function val(id){return document.getElementById(id)?.value?.trim()||''}
function num(id){const v=document.getElementById(id)?.value;return v===undefined||v===''?null:Number(v)}
function payloadFromForm(){
  return{name:val('devName'),city:val('devCity'),address:val('devAddress'),zone:val('devZone'),sourceLead:val('devSource'),surfaceM2:num('devSurface'),landlord:val('devLandlord'),monthlyRent:num('devRent'),keyMoney:num('devKeyMoney'),capexBudget:num('devCapex'),capexCommitted:num('devCapexCommitted'),capexActual:num('devCapexActual'),siteScore:num('devSiteScore'),economicScore:num('devEconomicScore'),brand:val('devBrand')||'FRANPRIX',conflictOfInterest:val('devConflict')==='1',conflictDetails:val('devConflictDetails'),committeeOpinion:val('devCommitteeOpinion')||'PENDING',bpStatus:val('devBpStatus')||'NOT_STARTED',legalStatus:val('devLegalStatus')||'PENDING',technicalStatus:val('devTechnicalStatus')||'PENDING',decision:val('devDecision')||'PENDING',priority:val('devPriority')||'NORMAL',targetOpeningDate:val('devTarget')||null,worksProgress:num('devWorksProgress')??0,ownerUserId:val('devOwner')||null,nextAction:val('devNextAction'),nextActionDueDate:val('devNextActionDue')||null,blocker:val('devBlocker'),notes:val('devNotes')};
}
async function fetchDetail(id){return api(`/api/development/projects/${encodeURIComponent(id)}`)}
function milestoneButton(m,primary=false){
  return `<button class="btn ${primary?'brand':m.status==='DONE'?'ghost':'soft'}" data-dev-milestone="${esc(m.code)}" data-dev-ms-status="${m.status==='DONE'?'PENDING':'DONE'}">${m.status==='DONE'?'Rouvrir':primary?'Valider et continuer':'Valider'}</button>`;
}
function currentStageMilestones(p){return (p.milestones||[]).filter(m=>m.stage===p.stage)}
function nextPendingMilestone(p){return currentStageMilestones(p).find(m=>m.status!=='DONE')||null}
function stageDoneCount(p){const rows=currentStageMilestones(p);return{done:rows.filter(m=>m.status==='DONE').length,total:rows.length}}
function journeyRail(p){
  const idx=stageIndex(p.stage);
  return `<div class="dev-journey-rail">${(config?.stages||[]).map((s,i)=>`<div class="dev-journey-step ${i<idx?'done':i===idx?'current':''}"><span class="dev-journey-dot">${i<idx?'✓':i+1}</span><div><strong>${esc(s.label)}</strong><small>${i<idx?'Terminée':i===idx?'Étape actuelle':'À venir'}</small></div></div>`).join('')}</div>`;
}
function currentStageChecklist(p){
  const rows=currentStageMilestones(p),pending=nextPendingMilestone(p);
  if(!rows.length)return '<div class="dev-empty"><strong>Aucun jalon pour cette étape.</strong></div>';
  return rows.map(m=>`<div class="dev-journey-check ${m.status==='DONE'?'done':m.status==='BLOCKED'?'blocked':pending?.code===m.code?'next':''}"><div class="dev-journey-check-mark">${m.status==='DONE'?'✓':m.status==='BLOCKED'?'!':'○'}</div><div class="dev-journey-check-copy"><strong>${esc(m.label)}</strong><small>${m.status==='DONE'?(m.completed_at?`Validé le ${new Date(m.completed_at).toLocaleDateString('fr-FR')}`:'Validé'):m.status==='BLOCKED'?'Bloqué':pending?.code===m.code?'À faire maintenant':'À faire ensuite'}</small></div>${m.status==='DONE'?milestoneButton(m):pending?.code===m.code?milestoneButton(m,true):''}</div>`).join('');
}
function stagePrimaryCard(p,next){
  const pending=nextPendingMilestone(p),progress=stageDoneCount(p),readiness=p.stageReadiness||{ready:false,count:0,incomplete:[]};
  if(p.stage==='CLOSING_HANDOVER'&&!pending&&readiness.ready)return `<div class="dev-journey-primary ready"><div class="label">PARCOURS DÉVELOPPEMENT TERMINÉ</div><h3>Le dossier est prêt à être passé aux équipes d’exécution.</h3><p>Closing, passation et archivage sont terminés. Les travaux et la mise en exploitation continuent dans leurs workflows respectifs.</p></div>`;
  if(pending)return `<div class="dev-journey-primary"><div><div class="label">À FAIRE MAINTENANT · ${progress.done+1} SUR ${progress.total}</div><h3>${esc(pending.label)}</h3><p>${esc(STAGE_INTENT[p.stage]||'Terminer les prérequis de cette étape.')}</p></div>${milestoneButton(pending,true)}</div>`;
  if(!readiness.ready)return `<div class="dev-journey-primary blocked"><div><div class="label">DERNIER VERROU</div><h3>${readiness.count||1} prérequis empêchent encore le passage</h3><p>${(readiness.incomplete||[]).map(x=>esc(x.label)).join(' · ')||'Compléter la décision ou les prérequis du projet.'}</p></div><button class="btn soft" id="devEditDecision">Compléter la fiche</button></div>`;
  return `<div class="dev-journey-primary ready"><div><div class="label">ÉTAPE TERMINÉE</div><h3>Prêt pour ${esc(STAGE_LABELS[next]||next)}</h3><p>Tous les prérequis obligatoires sont validés. Le projet peut avancer.</p></div><button class="btn brand" id="devNextStage">Passer à ${esc(STAGE_LABELS[next]||next)} →</button></div>`;
}
function renderDetail(p){
  const next=nextStage(p.stage),progress=stageDoneCount(p);
  return `<div class="dev-shell">
    <div class="dev-detail-head"><div><button class="btn ghost" id="devBack">← Projets</button><div class="label" style="margin-top:14px">PARCOURS DÉVELOPPEMENT · ${esc(PRIORITY_LABELS[p.priority]||p.priority)}</div><h2>${esc(p.name)}</h2><p class="muted">${esc([p.city,p.address].filter(Boolean).join(' · '))}</p><div class="dev-inline-status">${status(DECISION_LABELS[p.decision]||p.decision,decisionTone(p.decision))}${status(p.risk?.label||'Sous contrôle',riskTone(p))}</div></div><div class="dev-actions"><button class="btn ghost" id="devEdit">Modifier la fiche</button></div></div>
    ${journeyRail(p)}
    <div class="dev-journey-layout">
      <section class="dev-journey-main">
        <div class="dev-journey-stage-head"><div><div class="label">ÉTAPE ACTUELLE</div><h3>${esc(STAGE_LABELS[p.stage]||p.stage)}</h3><p>${esc(STAGE_INTENT[p.stage]||'')}</p></div><div class="dev-stage-counter"><strong>${progress.done}/${progress.total}</strong><span>jalons validés</span></div></div>
        ${stagePrimaryCard(p,next)}
        <div class="dev-card dev-journey-checklist"><div class="dev-card-head"><div><h3>Ce qu’il faut terminer maintenant</h3><p class="small muted">StoreOps ne mélange plus les prochaines étapes : seules les actions de ${esc(STAGE_LABELS[p.stage]||p.stage)} sont affichées ici.</p></div></div><div class="dev-journey-checks">${currentStageChecklist(p)}</div></div>
        ${p.blocker?`<div class="dev-card dev-risk-card"><h3>Blocage actif</h3><p>${esc(p.blocker)}</p></div>`:''}
      </section>
      <aside class="dev-journey-side">
        <div class="dev-card dev-next-card"><div class="label">PROCHAINE ACTION</div><h3>${esc(p.next_action||nextPendingMilestone(p)?.label||'À définir')}</h3><small>${p.next_action_due_date?`Échéance ${date(p.next_action_due_date)}`:'Aucune échéance définie'}</small></div>
        <div class="dev-card"><h3>Repères dossier</h3><div class="dev-facts"><div><span>Enseigne</span><strong>${esc(p.brand||'FRANPRIX')}</strong></div><div><span>Ouverture cible</span><strong>${date(p.target_opening_date)}</strong></div><div><span>Responsable</span><strong>${esc(p.owner_name||'À affecter')}</strong></div><div><span>Surface</span><strong>${p.surface_m2??'—'} m²</strong></div><div><span>Avis Comité</span><strong>${esc(p.committee_opinion||'PENDING')}</strong></div><div><span>BP</span><strong>${esc(p.bp_status||'NOT_STARTED')}</strong></div><div><span>Juridique</span><strong>${esc(p.legal_status||'PENDING')}</strong></div><div><span>Technique</span><strong>${esc(p.technical_status||'PENDING')}</strong></div></div></div>
        <details class="dev-card dev-details-collapsible"><summary>Voir le détail complet <span>⌄</span></summary><div class="dev-details-body"><h4>Business case</h4><div class="dev-facts"><div><span>Score emplacement</span><strong>${p.site_score??'—'}/100</strong></div><div><span>Score économique</span><strong>${p.economic_score??'—'}/100</strong></div><div><span>CAPEX engagé</span><strong>${money(p.capex_committed)}</strong></div><div><span>CAPEX réel</span><strong>${money(p.capex_actual)}</strong></div></div><h4>Historique</h4><div class="dev-history">${(p.history||[]).length?(p.history||[]).slice(0,12).map(h=>`<div class="dev-history-item"><strong>${esc(h.detail||h.event_type)}</strong><small>${new Date(h.created_at).toLocaleString('fr-FR')} · ${esc(h.user_name||'StoreOps')}</small></div>`).join(''):'<div class="small muted">Aucun historique.</div>'}</div></div></details>
      </aside>
    </div>
  </div>`;
}
function renderEdit(p){
  return `<div class="dev-shell"><div class="dev-detail-head"><div><button class="btn ghost" id="devBackDetail">← Parcours</button><div class="label" style="margin-top:14px">MODIFIER LE PROJET</div><h2>${esc(p.name)}</h2></div></div><div class="dev-form">${formValues(p)}<div class="studio-savebar"><span class="small muted">Budget, décision, prochaine action et blocages sont historisés avec le projet.</span><button class="btn brand" id="devEditSave">Enregistrer</button></div></div></div>`;
}
async function render(){
  const root=document.getElementById('developmentContent');if(!root)return;
  if(mode==='create')root.innerHTML=renderCreate();
  else if(mode==='detail'){const p=await fetchDetail(selectedId);root.innerHTML=renderDetail(p)}
  else if(mode==='edit'){const p=await fetchDetail(selectedId);root.innerHTML=renderEdit(p)}
  else root.innerHTML=renderBoard();
  bind();
}
function bind(){
  document.getElementById('devNew')?.addEventListener('click',()=>{mode='create';render()});
  document.getElementById('devBack')?.addEventListener('click',()=>{mode='board';selectedId=null;render()});
  document.getElementById('devBackDetail')?.addEventListener('click',()=>{mode='detail';render()});
  document.querySelectorAll('[data-dev-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.devFilter;render()});
  document.querySelectorAll('[data-dev-open]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.devOpen;mode='detail';render()});
  document.getElementById('devCreateSave')?.addEventListener('click',async()=>{try{const b=payloadFromForm();if(!b.name||!b.city)return toast('Nom du projet et ville obligatoires.');const p=await api('/api/development/projects',{method:'POST',body:b});selectedId=p.id;mode='detail';await load();render();toast('Projet créé. Le parcours Sourcing démarre maintenant.')}catch(e){toast(e.message)}});
  document.getElementById('devEdit')?.addEventListener('click',()=>{mode='edit';render()});
  document.getElementById('devEditDecision')?.addEventListener('click',()=>{mode='edit';render()});
  document.getElementById('devEditSave')?.addEventListener('click',async()=>{try{await api(`/api/development/projects/${encodeURIComponent(selectedId)}`,{method:'PUT',body:payloadFromForm()});mode='detail';await load();render();toast('Projet mis à jour.')}catch(e){toast(e.message)}});
  document.getElementById('devNextStage')?.addEventListener('click',async()=>{try{const p=await fetchDetail(selectedId),next=nextStage(p.stage);if(!next)return;await api(`/api/development/projects/${encodeURIComponent(selectedId)}/stage`,{method:'POST',body:{stage:next}});await load();render();toast(`Étape ${STAGE_LABELS[next]||next} démarrée.`)}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-dev-milestone]').forEach(b=>b.onclick=async()=>{try{await api(`/api/development/projects/${encodeURIComponent(selectedId)}/milestones/${encodeURIComponent(b.dataset.devMilestone)}`,{method:'POST',body:{status:b.dataset.devMsStatus}});await load();render();toast(b.dataset.devMsStatus==='DONE'?'Jalon validé. Parcours mis à jour.':'Jalon rouvert.')}catch(e){toast(e.message)}});
}

ensureShell();
document.addEventListener('click',e=>{const b=e.target.closest('#developmentNav');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openDevelopment()},true);
new MutationObserver(()=>{polishAdminUsersCard();detect()}).observe(document.body,{subtree:true,childList:true,characterData:true});
const timer=setInterval(()=>{polishAdminUsersCard();if(app.user){detect();if(allowed)clearInterval(timer)}},250);
setTimeout(()=>clearInterval(timer),15000);
