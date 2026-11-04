import {api,apiPrivateFile} from '../api.js';
import {app} from '../state.js';
import {buyingManagementContext,loadBuyingManagement} from './buying-group-management.js';
import {renderContractIntake} from './buying-group-intake.js';
import {renderDetailedReading} from './buying-group-reading-view.js';

const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
const moment=s=>s?String(s).slice(0,10):'Non précisée';
const stages=[['DRAFT','1. Brouillon'],['EXTRACTED','2. Lecture IA'],['REVIEWED','3. Revue'],['PENDING_APPROVAL','4. Approbation'],['APPROVED','5. Validé'],['ACTIVE','6. Actif']];
const state={contractId:null,files:[],readings:[],workflow:null,ai:null,process:null,loading:false,busy:false,alert:'',error:'',previewUrl:null,selectedDocument:null};
export function chooseWorkflowContract(id){state.contractId=String(id);sessionStorage.setItem('hs_buying_contract_focus',state.contractId)}
const contracts=()=>buyingManagementContext().contracts||[];
const selected=()=>contracts().find(x=>x.id===state.contractId)||null;
const selectOptions=(values,selectedVal)=>values.map(([v,t])=>'<option value="'+h(v)+'" '+(String(v)===String(selectedVal)?'selected':'')+'>'+h(t)+'</option>').join('');
const input=(name,label,type,value='',extra='')=>'<label class="hsm-field"><span>'+h(label)+'</span><input name="'+h(name)+'" type="'+h(type)+'" value="'+h(value)+'" '+extra+'></label>';
const section=(heading,hint)=>'<div class="bg-section-title"><div><span class="bg-eyebrow">H&S · EXÉCUTION ACHATS</span><h3>'+heading+'</h3></div><span class="bg-subnote">'+hint+'</span></div>';
function statusBadge(status){
 const labels={DRAFT:'Brouillon',EXTRACTED:'Lecture à vérifier',REVIEWED:'Revue validée',PENDING_APPROVAL:'Approbation demandée',APPROVED:'Approuvé',ACTIVE:'Contrat actif',REJECTED:'Retour pour correction'};
 return '<span class="hsp-stage-badge hsp-stage-'+h(status||'DRAFT')+'">'+h(labels[status]||status)+'</span>';
}
async function loadContract(id){
 const [docs,reads]=await Promise.all([
  api('/api/buying-group/contracts/'+encodeURIComponent(id)+'/files',{noRetry:true}),
  api('/api/buying-group/contracts/'+encodeURIComponent(id)+'/readings',{noRetry:true})
 ]);
 state.files=docs.items||[];state.readings=reads.items||[];
 state.workflow=reads.workflow||{stage:'DRAFT'};state.ai=reads.ai||{enabled:false,pdfOnly:true};
 if(!state.selectedDocument||!state.files.some(x=>x.id===state.selectedDocument))
   state.selectedDocument=state.files[0]?.id||null;
}
async function reload(tab,root,navigate){
 if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl=null}
 await loadBuyingManagement({force:true});
 if(state.contractId&&selected())await loadContract(state.contractId);
 if(tab==='process')state.process=await api('/api/buying-group/process',{noRetry:true});
 await renderWorkflow(tab,root,navigate,{skipFetch:true});
}
function checklist(current){
 let index=stages.findIndex(x=>x[0]===current);
 if(current==='REJECTED')index=2;
 return '<div class="hsp-progress">'+stages.map(([id,label],i)=>'<div class="hsp-progress-item '+(i<=index?'is-done':'')+' '+(id===current?'is-current':'')+'"><div class="hsp-progress-number">'+(i+1)+'</div><small>'+h(label.slice(3))+'</small></div>').join('')+'</div>';
}
function intro(contract){
 if(!contract)return '<div class="hsp-empty"><h3>Tu peux commencer par le document</h3><p>Importe directement ton PDF ou DOCX ci-dessus : aucun fournisseur, aucune date et aucun contrat brouillon ne sont nécessaires pour déposer le fichier. Tu pourras créer le dossier ensuite.</p><button data-go-contracts class="hsm-quiet">Ou créer un contrat manuellement</button></div>';
 return '<div class="hsp-contract-head"><div><span class="bg-eyebrow">DOSSIER CONTRACTUEL · '+h(contract.entity_code)+'</span><h3>'+h(contract.title)+'</h3><p>'+h(contract.supplier_name)+' · '+moment(contract.effective_from)+' — '+moment(contract.effective_to)+'</p></div>'+
 statusBadge(state.workflow?.stage||contract.workflow_stage||'DRAFT')+'</div>';
}
function filesPanel(){
 return '<section class="bg-panel hsp-panel"><div class="hsm-heading"><h4>01 · Pièce contractuelle</h4><span class="hsm-soft">'+state.files.length+' version(s)</span></div>'+
 '<p class="hsm-note">PDF analysable par IA · DOCX archivable (convertir en PDF pour la lecture automatique). Chaque version est conservée dans l’espace privé H&S.</p>'+
 (state.files.length?'<div class="hsp-docs">'+state.files.map(f=>'<div class="hsp-doc '+(f.id===state.selectedDocument?'selected':'')+'"><div><strong>'+h(f.file_name)+'</strong><small>V'+h(f.version)+' · '+fmt(f.byte_size/1024)+' Ko · '+moment(f.uploaded_at)+'</small></div><div>'+
 '<button type="button" data-hsp-document="'+h(f.id)+'">Sélectionner</button>'+
 '<button type="button" data-hsp-view="'+h(f.id)+'">Lire l’original</button>'+
 '</div></div>').join('')+'</div>':'<div class="hsp-empty">Aucune pièce. Dépose le contrat PDF signé ou l’accord reçu du fournisseur.</div>')+
 '<label class="hsm-upload hsp-upload">+ Déposer une pièce PDF / DOCX (max. 5 Mo)<input type="file" id="hspUpload" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>'+
 '<div id="hspOriginal" class="hsp-original" hidden></div></section>';
}
function extractionPanel(){
 const document=state.files.find(x=>x.id===state.selectedDocument),latest=state.readings.find(r=>r.status!=='SUPERSEDED')||state.readings[0],findings=latest?.findings;
 return '<section class="bg-panel hsp-panel"><div class="hsm-heading"><h4>02 · Lecture et extraction des clauses</h4><span class="hsm-soft">'+(findings?'Lecture disponible':'À analyser')+'</span></div>'+
 (!state.files.length?'<div class="hsp-empty">Dépose une pièce pour lancer l’analyse.</div>':
 '<p class="hsm-note">Document sélectionné : '+h(document?.file_name||'—')+'. '+h(state.ai?.notice||'')+'</p>'+
 (state.ai?.enabled&&document?.content_type==='application/pdf'
 ?'<label class="hsp-consent"><input id="hspConsent" type="checkbox"> J’autorise expressément la transmission de ce PDF au prestataire IA pour lecture, après vérification de la politique H&S.</label>'+
 '<button class="hsm-primary" id="hspAnalyze" '+(state.busy?'disabled':'')+'>'+((state.readings.some(r=>r.document_id===document.id))?'Relire le PDF en profondeur (2 analyses)':'Analyser le PDF en profondeur (2 analyses)')+'</button>':
 '<div class="hsp-notice">Lecture automatique '+(state.ai?.enabled?'limitée aux PDF. Convertir le DOCX en PDF.':'non configurée côté serveur. La saisie et la revue manuelles restent disponibles.')+'</div>'))+
 (findings?'<div class="hsp-findings">'+
 '<div class="hsp-summary"><div><span class="bg-eyebrow">SYNTHÈSE PROPOSÉE · NON VALIDÉE</span><h4>'+h(findings.title||'Contrat analysé')+'</h4><p>'+h(findings.summary||'Aucune synthèse identifiée.')+'</p></div></div>'+
 '<div class="hsp-read-stats"><div><small>Fournisseur identifié</small><strong>'+h(findings.supplierName||'À confirmer')+'</strong></div>'+
 '<div><small>Validité détectée</small><strong>'+moment(findings.startDate)+' → '+moment(findings.endDate)+'</strong></div>'+
 '<div><small>Paliers RFA</small><strong>'+h(findings.rebateTiers?.length||0)+'</strong></div>'+
 '<div><small>Risques signalés</small><strong>'+h(findings.risks?.length||0)+'</strong></div></div>'+
 renderDetailedReading(findings,h)+'</div>':'')+
 '<p class="hsm-note">Aucune donnée extraite n’est appliquée sans validation humaine de la pièce source et des clauses pertinentes.</p></section>';
}
function evidenceCard(x,kind=''){
 return '<article class="hsp-evidence '+kind+'"><div><strong>'+h(x.title||x.severity||'Point extrait')+'</strong>'+
 (x.severity?'<span>'+h(x.severity)+'</span>':'')+'</div>'+
 '<p>'+h(x.details||'Non détaillé')+'</p>'+
 (x.quote?'<blockquote>« '+h(x.quote)+' »</blockquote>':'<small>Justificatif textuel non fourni — à vérifier</small>')+
 '<small>Page / section : '+h(x.page||'non identifiée')+'</small></article>';
}
function reviewPanel(contract){
 const stage=state.workflow?.stage||'DRAFT',latest=state.readings.find(r=>r.status==='TO_REVIEW')||state.readings[0],a=latest?.findings||{};
 const canEdit=['DRAFT','EXTRACTED','REVIEWED','REJECTED'].includes(stage)&&contract.status==='DRAFT';
 const tiers=(a.rebateTiers?.length?a.rebateTiers:contract.rebate_tiers)||[];
 const obligations=a.obligations||[];
 if(!canEdit)return '<section class="bg-panel hsp-panel"><div class="hsm-heading"><h4>03 · Revue des conditions</h4>'+statusBadge(stage)+'</div><p class="hsm-note">Le dossier est soumis ou approuvé. Les conditions ne peuvent plus être modifiées sans rouvrir le processus.</p></section>';
 return '<section class="bg-panel hsp-panel"><div class="hsm-heading"><h4>03 · Revue métier et correction</h4><span class="hsm-soft">Validation humaine obligatoire</span></div>'+
 '<p class="hsm-note">Vérifie le PDF original et corrige les dates, taux et échéances. Les valeurs proposées ne doivent pas être considérées comme contractuellement exactes.</p>'+
 '<form id="hspReviewForm" class="hsm-form">'+
 input('title','Titre du contrat','text',a.title||contract.title,'required maxlength="240"')+
 '<div class="hsm-form-grid">'+input('effectiveFrom','Date d’effet','date',a.startDate||moment(contract.effective_from),'required')+
 input('effectiveTo','Date d’échéance','date',a.endDate||moment(contract.effective_to),'required')+'</div>'+
 '<div class="hsm-form-grid"><label class="hsm-field"><span>Assiette RFA</span><select name="rebateBase">'+selectOptions([['NET_PURCHASES','Achats nets'],['NET_INVOICED','Factures nettes']],a.rebateBase||contract.rebate_base)+'</select></label>'+
 '<label class="hsm-field"><span>Mode RFA</span><select name="rebateMode">'+selectOptions([['RETROACTIVE','Rétroactive'],['MARGINAL','Marginale / tranches']],a.rebateMode||contract.rebate_mode)+'</select></label></div>'+
 '<div class="hsm-subsection">Paliers contractuels à confirmer</div><div id="hspTiers">'+
 (tiers.length?tiers.map(t=>tierRow(t)).join(''):tierRow({threshold:'0',rateBps:0}))+'</div>'+
 '<button id="hspAddTier" class="hsm-quiet" type="button">+ Ajouter un palier</button>'+
 '<div class="hsm-subsection">Obligations à retenir dans le suivi</div>'+
 (obligations.length?obligations.map((o,i)=>'<div class="hsp-obligation-edit"><label><input type="checkbox" data-hsp-obligation="'+i+'" checked> '+h(o.title)+'</label>'+
 '<div class="hsm-form-grid">'+input('taskDue-'+i,'Échéance','date',o.dueDate||'')+
 input('taskOwner-'+i,'Responsable (texte libre)','text',o.owner||'')+'</div>'+
 '<p class="hsm-note">Preuve : '+h(o.quote||'à vérifier')+' · page '+h(o.page||'—')+'</p></div>').join(''):
 '<p class="hsm-note">Aucune obligation identifiée automatiquement. Une vérification manuelle reste indispensable.</p>')+
 '<div class="hsp-manual-heading"><strong>Ajouter des obligations ou tâches non détectées</strong><button id="hspAddTask" class="hsm-quiet" type="button">+ Ajouter une action</button></div><div id="hspManualTasks"></div>'+ 
 '<label class="hsm-field"><span>Notes de revue et réserves</span><textarea name="reviewNotes" maxlength="2500" rows="3" placeholder="Clauses manquantes, exclusions, conditions de facturation…"></textarea></label>'+
 '<label class="hsp-consent"><input type="checkbox" name="confirmSourceRead" required> J’ai lu la pièce originale, contrôlé les champs et confirmé les clauses qui seront utilisées dans la Centrale d’achat.</label>'+
 '<button type="submit" class="hsm-primary">Valider la revue des conditions</button></form></section>';
}
function tierRow(t){
 return '<div class="hsp-tier"><label class="hsm-field"><span>Seuil MAD</span><input type="number" name="threshold" min="0" step="0.01" required value="'+h(t.threshold||'0')+'"></label>'+
 '<label class="hsm-field"><span>Taux %</span><input type="number" name="rate" min="0" max="100" step="0.01" required value="'+h((Number(t.rateBps)||0)/100)+'"></label>'+
 '<button type="button" class="hsp-remove-tier" aria-label="Supprimer palier">×</button></div>';
}
function approvalPanel(){
 const flow=state.workflow||{stage:'DRAFT'},stage=flow.stage||'DRAFT';
 const submittedBy=flow.submitted_by||null,selfApproval=flow.submitted_by&&String(flow.submitted_by)===String(app.user?.id);
 let next='<div class="hsp-notice">Complète la revue des conditions pour pouvoir soumettre le contrat à approbation.</div>';
 if(stage==='REVIEWED')next='<button id="hspSubmit" class="hsm-primary">Soumettre le dossier à approbation</button>';
 if(stage==='PENDING_APPROVAL')next=(selfApproval?'<div class="hsp-notice">Validation indépendante requise : une autre personne habilitée Direction/Admin doit approuver ce contrat.</div>':
 '<div class="hsp-actions"><button id="hspApprove" class="hsm-primary">Approuver le contrat</button><button id="hspReject" class="hsm-quiet">Rejeter / demander une correction</button></div>');
 if(stage==='APPROVED')next='<button id="hspActivate" class="hsm-primary">Activer le contrat approuvé</button>';
 if(stage==='ACTIVE')next='<div class="hsp-good"><strong>Contrat actif</strong><p>Le document est approuvé. Les obligations sont maintenant suivies dans le tableau de bord Processus & actions.</p></div>';
 if(stage==='REJECTED')next='<div class="hsp-notice">Contrat rejeté : '+h(flow.rejection_reason||'Corriger et soumettre à nouveau')+'. Reprends la revue métier.</div>';
 return '<section class="bg-panel hsp-panel"><div class="hsm-heading"><h4>04 · Approbation et mise en vigueur</h4>'+statusBadge(stage)+'</div>'+
 '<p class="hsm-note">Séparation des tâches : le responsable qui soumet le contrat ne peut pas l’approuver. Toute action est historisée.</p>'+
 (flow.submitted_by?'<div class="hsp-line">Soumis par : <strong>'+h(flow.submitted_by)+'</strong> · '+moment(flow.submitted_at)+'</div>':'')+
 (flow.approved_by?'<div class="hsp-line">Approuvé par : <strong>'+h(flow.approved_by)+'</strong> · '+moment(flow.approved_at)+'</div>':'')+
 next+'</section>';
}
function processView(){
 const p=state.process||{items:[],stages:[],overdue:0,next30:0},todo=p.items.filter(x=>x.status==='TODO');
 const counts=Object.fromEntries((p.stages||[]).map(s=>[s.stage,s.count]));
 return section('Processus & actions','Rendez les contrats réellement pilotables')+
 '<div class="hsp-stats"><div><span>Brouillons / en lecture</span><strong>'+h((counts.DRAFT||0)+(counts.EXTRACTED||0)+(counts.REVIEWED||0))+'</strong></div>'+
 '<div><span>À approuver</span><strong>'+h(counts.PENDING_APPROVAL||0)+'</strong></div>'+
 '<div><span>Contrats actifs</span><strong>'+h(counts.ACTIVE||0)+'</strong></div>'+
 '<div><span>Actions en retard</span><strong class="'+(p.overdue?'hsp-danger':'')+'">'+h(p.overdue)+'</strong></div>'+
 '<div><span>Échéances sous 30 jours</span><strong>'+h(p.next30)+'</strong></div></div>'+
 '<div class="hsp-process-grid"><section class="bg-panel"><div class="hsm-heading"><h4>File d’exécution</h4><span class="hsm-soft">Par contrat</span></div>'+
 (contracts().length?contracts().map(c=>'<div class="hsp-process-contract"><div><strong>'+h(c.title)+'</strong><small>'+h(c.supplier_name)+' · '+h(c.entity_code)+'</small></div>'+statusBadge(c.workflow_stage||c.status)+
 '<button data-hsp-select="'+h(c.id)+'">Ouvrir le dossier</button></div>').join(''):
 '<div class="hsp-empty">Aucun contrat. Crée un premier fournisseur et un accord pour commencer.</div>')+'</section>'+
 '<section class="bg-panel"><div class="hsm-heading"><h4>Obligations à exécuter</h4><span class="hsm-soft">'+h(todo.length)+' à faire</span></div>'+
 (p.items.length?p.items.map(item=>'<div class="hsp-action '+(item.status==='DONE'?'done':'')+'"><div><strong>'+h(item.title)+'</strong><small>'+h(item.contract_title)+' · '+h(item.kind)+' · '+(item.due_on?'Échéance : '+h(item.due_on):'Échéance à définir')+'</small>'+
 (item.evidence_quote?'<small>Source : « '+h(item.evidence_quote)+' »'+(item.evidence_page?' page '+h(item.evidence_page):'')+'</small>':'')+'</div>'+
 '<button data-hsp-task="'+h(item.id)+'" data-hsp-task-action="'+(item.status==='DONE'?'REOPEN':'DONE')+'">'+(item.status==='DONE'?'Rouvrir':'Marquer fait')+'</button></div>').join(''):
 '<div class="hsp-empty">Les obligations validées lors des revues apparaîtront ici, avec leurs échéances.</div>')+'</section></div>';
}
async function showOriginal(root,id){
 if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl=null}
 const doc=state.files.find(f=>f.id===id);if(!doc)return;
 const place=root.querySelector('#hspOriginal');if(!place)return;
 place.hidden=false;place.innerHTML='<div class="hsm-loading">Ouverture sécurisée du document…</div>';
 try{
  const blob=await apiPrivateFile('/api/buying-group/documents/'+encodeURIComponent(id)+'/download');
  const url=URL.createObjectURL(blob);state.previewUrl=url;
  if(doc.content_type==='application/pdf'){
    place.innerHTML='<div class="hsp-original-title"><strong>Document source : '+h(doc.file_name)+'</strong><button id="hspCloseOriginal">Fermer</button></div><iframe title="Contrat PDF original" class="hsp-document-frame"></iframe>';
    place.querySelector('iframe').src=url;
  }else{
    place.innerHTML='<div class="hsp-original-title"><strong>'+h(doc.file_name)+'</strong><p>Le navigateur ne peut pas afficher le DOCX directement.</p><a id="hspSaveDocument">Télécharger</a></div>';
    place.querySelector('#hspSaveDocument').href=url;place.querySelector('#hspSaveDocument').download=doc.file_name;
  }
  place.querySelector('#hspCloseOriginal')?.addEventListener('click',()=>{URL.revokeObjectURL(url);state.previewUrl=null;place.hidden=true;place.replaceChildren();});
 }catch(error){place.innerHTML='<div class="hsm-error">'+h(error.message)+'</div>'}
}
async function act(root,tab,navigate,action,url,body={}){
 if(state.busy)return;state.busy=true;root.querySelectorAll('button').forEach(b=>{if(b.id&&b.id.startsWith('hsp'))b.disabled=true});
 try{
  const result=await api(url,{method:'POST',body,noRetry:true});
  state.error='';
  state.alert=action==='analyze'?'Analyse créée. Contrôle humain obligatoire avant soumission.':
    action==='review'?'Revue validée. Le contrat peut être soumis à approbation.':
    action==='submit'?'Dossier envoyé à un autre approbateur habilité.':
    action==='approve'?'Approbation enregistrée. Le contrat peut être activé.':
    action==='reject'?'Dossier renvoyé pour correction.':
    action==='activate'?'Contrat activé et traçable.':'Action enregistrée.';
  await reload(tab,root,navigate);
  return result;
 }catch(error){
  state.error=error.message;await renderWorkflow(tab,root,navigate,{skipFetch:true});
 }finally{state.busy=false}
}
export async function renderWorkflow(tab,root,navigate,{skipFetch=false}={}){
 if(!root)return;
 if(!skipFetch){
  root.innerHTML='<div class="hsm-loading">Ouverture des processus achats…</div>';
  try{
   await loadBuyingManagement();
   const focused=sessionStorage.getItem('hs_buying_contract_focus');
   if(focused&&contracts().some(x=>x.id===focused)){state.contractId=focused;sessionStorage.removeItem('hs_buying_contract_focus')}
   if(!state.contractId&&contracts().length)state.contractId=contracts()[0].id;
   if(state.contractId&&selected())await loadContract(state.contractId);
   if(tab==='process')state.process=await api('/api/buying-group/process',{noRetry:true});
  }catch(error){root.innerHTML='<div id="hsiIntakeHost" aria-label="Importer un contrat directement"></div><div class="hsm-error">Les dossiers existants sont momentanément indisponibles : '+h(error.message)+' <button class="hsm-primary" id="hspRetry">Réessayer</button></div>';
   const inbox=root.querySelector('#hsiIntakeHost');
   if(inbox)void renderContractIntake(inbox,async id=>{state.contractId=id;await loadBuyingManagement({force:true});await renderWorkflow(tab,root,navigate)});
   root.querySelector('#hspRetry')?.addEventListener('click',()=>renderWorkflow(tab,root,navigate));return;}
 }
 if(!root.isConnected)return;
 state.error=state.error||'';
 if(tab==='process')root.innerHTML=processView();
 else{
  const contract=selected(),stage=state.workflow?.stage||contract?.workflow_stage||'DRAFT';
  root.innerHTML=section('Lecture et validation des contrats','Processus complet · de la pièce au suivi des obligations')+
    (state.alert?'<div class="hsp-banner">'+h(state.alert)+'</div>':'')+
    (state.error?'<div class="hsm-error">'+h(state.error)+'</div>':'')+
    '<div id="hsiIntakeHost" aria-label="Importer un contrat directement"></div>'+ 
    '<div class="hsp-selector"><label class="hsm-field"><span>Choisir le dossier à traiter</span><select id="hspContractSelect">'+selectOptions(contracts().map(c=>[c.id,c.supplier_name+' — '+c.title]),state.contractId)+'</select></label>'+
    '<button data-go-contracts class="hsm-quiet">+ Nouveau contrat</button></div>'+
    intro(contract)+(contract?checklist(stage)+'<div class="hsp-workflow-grid">'+filesPanel()+extractionPanel()+'</div>'+
    '<div class="hsp-workflow-grid">'+reviewPanel(contract)+approvalPanel()+'</div>':'');
 }
 const inbox=root.querySelector('#hsiIntakeHost');
 if(inbox)void renderContractIntake(inbox,async newContractId=>{
   state.contractId=newContractId;state.alert='Document importé et classé dans le nouveau contrat.';
   await reload(tab,root,navigate);
 });
 const nav=()=>navigate?.('contracts');
 root.querySelectorAll('[data-go-contracts]').forEach(b=>b.addEventListener('click',nav));
 root.querySelector('#hspContractSelect')?.addEventListener('change',async e=>{
  state.contractId=e.target.value;state.alert='';state.error='';state.readings=[];state.files=[];state.workflow=null;state.selectedDocument=null;
  await renderWorkflow(tab,root,navigate);
 });
 root.querySelector('#hspUpload')?.addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file||!state.contractId)return;
  if(file.size>5*1024*1024){state.error='Fichier supérieur à 5 Mo.';await renderWorkflow(tab,root,navigate,{skipFetch:true});return}
  try{
   await apiPrivateFile('/api/buying-group/contracts/'+encodeURIComponent(state.contractId)+'/files',{method:'POST',file});
   state.alert='Nouvelle version de document enregistrée.';
   await reload(tab,root,navigate);
  }catch(error){state.error=error.message;await renderWorkflow(tab,root,navigate,{skipFetch:true})}
 });
 root.querySelectorAll('[data-hsp-document]').forEach(b=>b.addEventListener('click',async()=>{state.selectedDocument=b.dataset.hspDocument;await renderWorkflow(tab,root,navigate,{skipFetch:true})}));
 root.querySelectorAll('[data-hsp-view]').forEach(b=>b.addEventListener('click',()=>showOriginal(root,b.dataset.hspView)));
 root.querySelector('#hspAnalyze')?.addEventListener('click',async()=>{
  if(!root.querySelector('#hspConsent')?.checked){state.error='Autorisation explicite requise avant l’envoi du document PDF à l’IA.';await renderWorkflow(tab,root,navigate,{skipFetch:true});return}
  state.error='';await act(root,tab,navigate,'analyze','/api/buying-group/contracts/'+state.contractId+'/analyze',
    {documentId:state.selectedDocument,consent:true,
     reanalyze:state.readings.some(x=>x.document_id===state.selectedDocument)});
 });
 root.querySelector('#hspAddTask')?.addEventListener('click',()=>{
  const host=root.querySelector('#hspManualTasks');if(!host||host.children.length>=24)return;
  const node=document.createElement('div');node.className='hsp-manual-task';
  node.innerHTML=input('manualTitle','Action / obligation','text','','required maxlength="240" placeholder="Ex : Réclamer l’avoir RFA du T4"')+
   '<div class="hsm-form-grid"><label class="hsm-field"><span>Catégorie</span><select name="manualKind">'+
   selectOptions([['RECONCILIATION','RFA / rapprochement'],['RENEWAL','Renouvellement'],['NEGOTIATION','Négociation'],['PAYMENT','Paiement'],['DOCUMENT','Justificatif'],['REVIEW','Revue'],['OTHER','Autre']],'RECONCILIATION')+'</select></label>'+input('manualDue','Date limite','date')+'</div>'+input('manualOwner','Responsable','text','','maxlength="120"')+
   '<button type="button" class="hsm-quiet" data-hsp-remove-task>Supprimer cette action</button>';
  host.appendChild(node);node.querySelector('[data-hsp-remove-task]')?.addEventListener('click',()=>node.remove());
 });
 root.querySelector('#hspAddTier')?.addEventListener('click',()=>{
  const host=root.querySelector('#hspTiers');if(!host||host.children.length>=12)return;
  const node=document.createElement('div');node.innerHTML=tierRow({threshold:0,rateBps:0});
  host.appendChild(node.firstElementChild);bindTierRemoval(root);
 });
 bindTierRemoval(root);
 root.querySelector('#hspReviewForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,fields=new FormData(form);
  const tiers=[...form.querySelectorAll('.hsp-tier')].map(row=>({
    threshold:row.querySelector('[name="threshold"]').value,
    rateBps:Math.round(Number(row.querySelector('[name="rate"]').value)*100)
  }));
  const source=state.readings.find(x=>x.status==='TO_REVIEW')||null;
  const obligationTemplates=source?.findings?.obligations||[];
  const obligations=obligationTemplates.flatMap((item,i)=>{
    if(!form.querySelector('[data-hsp-obligation="'+i+'"]')?.checked)return[];
    return [{...item,dueDate:fields.get('taskDue-'+i)||null,owner:fields.get('taskOwner-'+i)||''}];
  });
  for(const node of form.querySelectorAll('.hsp-manual-task')){
    const title=node.querySelector('[name="manualTitle"]')?.value?.trim();if(!title)continue;
    obligations.push({title,kind:node.querySelector('[name="manualKind"]')?.value||'OTHER',
      dueDate:node.querySelector('[name="manualDue"]')?.value||null,
      owner:node.querySelector('[name="manualOwner"]')?.value||'',quote:'Saisie par l’utilisateur — vérifier la source originale',page:''});
  }
  const payload={title:fields.get('title'),effectiveFrom:fields.get('effectiveFrom'),effectiveTo:fields.get('effectiveTo'),
   rebateBase:fields.get('rebateBase'),rebateMode:fields.get('rebateMode'),rebateTiers:tiers,
   obligations,analysisId:source?.id||null,reviewNotes:fields.get('reviewNotes')||'',confirmSourceRead:fields.get('confirmSourceRead')==='on'};
  await act(root,tab,navigate,'review','/api/buying-group/contracts/'+state.contractId+'/review',payload);
 });
 root.querySelector('#hspSubmit')?.addEventListener('click',()=>act(root,tab,navigate,'submit','/api/buying-group/contracts/'+state.contractId+'/submit'));
 root.querySelector('#hspApprove')?.addEventListener('click',()=>{
  if(confirm('Vous confirmez avoir vérifié les conditions, les pièces et les réserves ?'))void act(root,tab,navigate,'approve','/api/buying-group/contracts/'+state.contractId+'/approve')
 });
 root.querySelector('#hspReject')?.addEventListener('click',()=>{
  const reason=prompt('Motif documenté du refus (obligatoire) :');if(reason?.trim())void act(root,tab,navigate,'reject','/api/buying-group/contracts/'+state.contractId+'/reject',{reason});
 });
 root.querySelector('#hspActivate')?.addEventListener('click',()=>{
  if(confirm('Activer le contrat approuvé ?'))void act(root,tab,navigate,'activate','/api/buying-group/contracts/'+state.contractId+'/activate')
 });
 root.querySelectorAll('[data-hsp-select]').forEach(b=>b.addEventListener('click',()=>{state.contractId=b.dataset.hspSelect;chooseWorkflowContract(state.contractId);navigate?.('workflow')}));
 root.querySelectorAll('[data-hsp-task]').forEach(b=>b.addEventListener('click',async()=>{
  b.disabled=true;
  try{await api('/api/buying-group/obligations/'+encodeURIComponent(b.dataset.hspTask)+'/status',{method:'POST',body:{action:b.dataset.hspTaskAction},noRetry:true});
    await reload(tab,root,navigate);}
  catch(error){state.error=error.message;await renderWorkflow(tab,root,navigate,{skipFetch:true})}
 }));
}
function bindTierRemoval(root){root.querySelectorAll('.hsp-remove-tier').forEach(b=>b.onclick=()=>{const host=root.querySelector('#hspTiers');if(host?.children.length>1)b.closest('.hsp-tier')?.remove()})}
