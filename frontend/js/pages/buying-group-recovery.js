import {api} from '../api.js';
import {buyingManagementContext,loadBuyingManagement} from './buying-group-management.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>new Intl.NumberFormat('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x)||0)+' MAD';
const date=x=>String(x||'').slice(0,10);
const entities=[['GROUP','H&S Groupe'],['FRANPRIX','Franprix'],['VENEZIA','Venezia Ice'],['FLORMAR','Flormar'],['DAHAB','Dahab'],['INTERSPORT','Intersport'],['PRIMOR','Primor'],['BEAUTY_FOR_YOU','Beauty For You']];
const states={DRAFT:'Brouillon',SUBMITTED:'Réclamée au fournisseur',ACKNOWLEDGED:'Accord fournisseur déclaré',DISPUTED:'Contestée',CLOSED:'Soldée selon justificatifs'};
const kinds={CREDIT_NOTE:'Avoir fournisseur',BANK_TRANSFER:'Virement déclaré',DEDUCTION:'Compensation fournisseur'};
const transitions={DRAFT:['SUBMITTED'],SUBMITTED:['ACKNOWLEDGED','DISPUTED'],ACKNOWLEDGED:['DISPUTED','CLOSED'],DISPUTED:['SUBMITTED'],CLOSED:[]};
const state={data:null,selectedId:null,loading:false,busy:false,error:'',message:'',filter:'ALL'};
const opts=(pairs,selected)=>pairs.map(([v,label])=>'<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(label)+'</option>').join('');
const claimChoice=()=>((buyingManagementContext().contracts)||[]).filter(x=>x.status==='ACTIVE');
function summary(){
 const s=state.data?.summary||{};
 return '<div class="hrr-ledger-kpis"><div><small>Réclamations envoyées</small><strong>'+esc(s.claimCount||0)+'</strong><span>Hors brouillons</span></div>'+
 '<div><small>Montants réclamés</small><strong>'+fmt(s.submittedMad)+'</strong><span>Déclaration interne</span></div>'+
 '<div><small>Justificatifs de règlement</small><strong>'+fmt(s.receivedDocumentedMad)+'</strong><span>Non vérifiés en banque</span></div>'+
 '<div><small>Reste à documenter</small><strong>'+fmt(s.outstandingMad)+'</strong><span>Sans écriture comptable</span></div></div>';
}
function createForm(){
 const active=claimChoice(),today=new Date().toISOString().slice(0,10);
 return '<section class="bg-panel hrr-panel"><div class="hrr-panel-title"><div><h4>Nouvelle réclamation RFA</h4><p>Créer un dossier documenté à partir d’un contrat approuvé.</p></div></div>'+
 (!active.length?'<p class="hrr-warning">Aucun contrat actif. Vérifie puis fais approuver au moins un contrat avant de créer une réclamation.</p>':'')+
 '<form id="hrrCreate" class="hrr-form"><label><span>Contrat actif</span><select name="contractId" required '+(!active.length?'disabled':'')+'>'+
 opts(active.map(c=>[c.id,c.supplier_name+' — '+c.title+' ['+c.entity_code+']']))+'</select></label>'+
 '<label><span>Enseigne bénéficiaire</span><select name="entityCode" required>'+opts(entities,'GROUP')+'</select></label>'+
 '<div class="hrr-form-grid"><label><span>Du</span><input name="periodFrom" type="date" required></label>'+
 '<label><span>Au</span><input name="periodTo" type="date" required></label></div>'+
 '<label><span>Montant réclamé (MAD)</span><input name="claimedMad" type="number" min="0.01" step="0.01" required placeholder="Ex. 12500.00"></label>'+
 '<label><span>Référence de réclamation</span><input name="claimReference" required maxlength="140" placeholder="Ex. RFA-2026-T4-LESIEUR"></label>'+
 '<label><span>Source de calcul / document de preuve</span><input name="sourceReference" required maxlength="220" placeholder="Ex. Export achats FRP / lot import 2026-11"></label>'+
 '<label><span>Commentaires métier</span><textarea name="note" rows="2" maxlength="1000" placeholder="Éligibilité, exclusions, retraitements, réserve financière…"></textarea></label>'+
 '<button type="submit" class="hrr-primary" '+(!active.length||state.busy?'disabled':'')+'>Créer le dossier de réclamation</button>'+
 '<p class="hrr-fine">Ce registre suit des déclarations métier. Il ne valide ni le calcul RFA, ni un avoir D365, ni un virement bancaire.</p></form></section>';
}
function proofRows(id){
 const lines=(state.data?.settlements||[]).filter(x=>x.claim_id===id);
 return '<div class="hrr-proof-list"><strong>Pièces de règlement déclarées</strong>'+
 (lines.length?lines.map(x=>'<div class="hrr-proof"><span>'+esc(kinds[x.kind]||x.kind)+' · '+esc(x.evidence_reference)+
 ' · '+esc(date(x.evidence_date))+'</span><strong>'+fmt(x.amount_mad)+'</strong></div>').join(''):
 '<p>Aucun avoir, virement ou justificatif de compensation enregistré.</p>')+'</div>';
}
function actions(item){
 if(item.status==='CLOSED')
  return '<span class="hrr-fine">Dossier clôturé sur justificatifs déclarés. Vérifier le lettrage comptable dans le SI financier.</span>';
 const options=(transitions[item.status]||[]).map(status=>[status,{
   SUBMITTED:'Réclamation envoyée',ACKNOWLEDGED:'Accord fournisseur reçu',
   DISPUTED:'Signaler une contestation',CLOSED:'Clôturer sur justificatifs'
 }[status]||status]);
 return '<form data-hrr-status-form="'+esc(item.id)+'" class="hrr-status-form">'+
 '<label><span>Prochaine étape du dossier</span><select name="status" required>'+opts(options)+'</select></label>'+
 '<label><span>Référence de preuve de cette étape</span>'+
 '<input name="evidenceReference" minlength="4" maxlength="220" required '+
 'placeholder="Email fournisseur, accusé de réception, référence de litige…"></label>'+
 '<button type="submit" class="hrr-primary">Enregistrer le changement de statut</button>'+
 '<p class="hrr-fine">La validation interne n’atteste ni une acceptation réelle du fournisseur ni un règlement bancaire.</p></form>';
}
function detail(item){
 return '<section class="hrr-detail"><div class="hrr-detail-grid"><div><small>Montant réclamé</small><strong>'+fmt(item.claimed_mad)+'</strong></div>'+
 '<div><small>Pièces déclarées</small><strong>'+fmt(item.received_mad)+'</strong></div>'+
 '<div><small>Reste à justifier</small><strong>'+fmt(item.outstanding_mad)+'</strong></div></div>'+
 '<p class="hrr-evidence">Source : '+esc(item.source_reference)+' · Réclamation : '+esc(item.claim_reference)+'</p>'+
 (item.note?'<p class="hrr-note">'+esc(item.note)+'</p>':'')+
 proofRows(item.id)+
 (item.status!=='DRAFT'&&item.status!=='CLOSED'?'<form class="hrr-form hrr-proof-form" data-hrr-proof="'+esc(item.id)+'">'+
 '<h4>Enregistrer un justificatif de règlement</h4><p>Ne saisir que les pièces réellement reçues. Une preuve textuelle ne remplace pas la vérification bancaire.</p>'+
 '<div class="hrr-form-grid"><label><span>Type de pièce</span><select name="kind">'+opts(Object.entries(kinds))+'</select></label>'+
 '<label><span>Date de la pièce</span><input name="evidenceDate" type="date" required></label></div>'+
 '<label><span>Montant attesté par la pièce (MAD)</span><input name="amountMad" type="number" min="0.01" step="0.01" required></label>'+
 '<label><span>N° avoir / référence virement / pièce</span><input name="evidenceReference" required minlength="4" maxlength="220" placeholder="Référence vérifiable en comptabilité"></label>'+
 '<button type="submit" class="hrr-primary">Enregistrer la preuve de règlement</button></form>':'')+
 '<div class="hrr-transition">'+actions(item)+'</div></section>';
}
function list(){
 const filtered=(state.data?.items||[]).filter(x=>state.filter==='ALL'||x.status===state.filter);
 return '<section class="bg-panel hrr-panel"><div class="hrr-panel-title"><div><h4>Registre de recouvrement</h4><p>Une réclamation, sa pièce source, son statut et le solde restant à documenter.</p></div>'+
 '<label class="hrr-filter">Filtrer <select id="hrrFilter">'+opts([['ALL','Tous les dossiers'],...Object.entries(states)],state.filter)+'</select></label></div>'+
 (filtered.length?'<div class="hrr-claims">'+filtered.map(item=>
 '<article class="hrr-claim"><button class="hrr-claim-trigger" type="button" data-hrr-open="'+esc(item.id)+'" aria-expanded="'+(state.selectedId===item.id)+'">'+
 '<span><strong>'+esc(item.supplier_name)+' · '+esc(item.contract_title)+'</strong>'+
 '<small>'+esc(item.entity_code)+' · '+esc(date(item.period_from))+' → '+esc(date(item.period_to))+'</small></span>'+
 '<span class="hrr-claim-money"><strong>'+fmt(item.claimed_mad)+'</strong>'+
 '<small class="hrr-status hrr-status-'+esc(item.status)+'">'+esc(states[item.status]||item.status)+'</small></span></button>'+
 (state.selectedId===item.id?detail(item):'')+'</article>').join('')+'</div>':
 '<div class="hrr-empty"><strong>Aucune réclamation à afficher.</strong><p>Commence par créer un dossier à partir d’un accord fournisseur actif. Les chiffres ne seront jamais simulés ici.</p></div>')+
 '</section>';
}
async function reload(root){
 state.busy=false;
 await renderRebateRecovery(root,{force:true});
}
async function mutate(root,url,body){
 if(state.busy)return;
 state.busy=true;state.error='';state.message='';
 try{
  await api(url,{method:'POST',body,noRetry:true});
  state.message='Action enregistrée dans le registre privé. Aucune écriture ERP effectuée.';
  await reload(root);
 }catch(error){
  state.error=error.message;state.busy=false;
  await renderRebateRecovery(root,{force:false});
 }
}
export async function renderRebateRecovery(root,{force=false}={}){
 if(!root)return;
 root.innerHTML='<div class="hsm-loading">Ouverture du registre RFA…</div>';
 try{
  await loadBuyingManagement();
  if(force||!state.data){
   state.data=await api('/api/buying-group/recovery/claims',{noRetry:true});
  }
 }catch(error){
  root.innerHTML='<div class="hsm-error"><strong>Registre RFA indisponible</strong><p>'+esc(error.message)+'</p><button id="hrrRetry">Réessayer</button></div>';
  root.querySelector('#hrrRetry')?.addEventListener('click',()=>renderRebateRecovery(root,{force:true}));
  return;
 }
 if(!root.isConnected)return;
 root.innerHTML='<div class="hrr"><div class="hrr-intro"><div><span class="hrr-kicker">FINANCE ACHATS · CONTRÔLE DES REMISES</span>'+
 '<h3>Des RFA négociées aux preuves de règlement.</h3><p>Réclamer, faire confirmer, documenter les avoirs et suivre les soldes par fournisseur et par enseigne.</p></div>'+
 '<span class="hrr-readonly">Saisie métier · Non comptabilisé</span></div>'+
 (state.error?'<div class="hrr-error" role="alert">'+esc(state.error)+'</div>':'')+
 (state.message?'<div class="hrr-success" role="status">'+esc(state.message)+'</div>':'')+
 summary()+'<div class="hrr-layout">'+createForm()+list()+'</div></div>';
 root.querySelector('#hrrFilter')?.addEventListener('change',e=>{state.filter=e.target.value;renderRebateRecovery(root)});
 root.querySelector('[name="contractId"]')?.addEventListener('change',e=>{
  const c=claimChoice().find(x=>x.id===e.target.value),select=root.querySelector('[name="entityCode"]');
  if(select)select.value=c?.scope==='LOCAL'?c.entity_code:'GROUP';
 });
 root.querySelector('#hrrCreate')?.addEventListener('submit',async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());
  await mutate(root,'/api/buying-group/recovery/claims',data);
 });
 root.querySelectorAll('[data-hrr-open]').forEach(button=>button.addEventListener('click',()=>{
  state.selectedId=state.selectedId===button.dataset.hrrOpen?null:button.dataset.hrrOpen;
  renderRebateRecovery(root);
 }));
 root.querySelectorAll('[data-hrr-status-form]').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault();
  const input=Object.fromEntries(new FormData(form).entries());
  if(input.status==='CLOSED'&&!confirm('Clôturer ce dossier sur les seules preuves déclarées ? Cela ne constitue pas un rapprochement bancaire.'))return;
  state.selectedId=form.dataset.hrrStatusForm;
  await mutate(root,'/api/buying-group/recovery/claims/'+encodeURIComponent(form.dataset.hrrStatusForm)+'/status',input);
 }));
 root.querySelectorAll('[data-hrr-proof]').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault();
  state.selectedId=form.dataset.hrrProof;
  await mutate(root,'/api/buying-group/recovery/claims/'+encodeURIComponent(form.dataset.hrrProof)+'/settlements',
    Object.fromEntries(new FormData(form).entries()));
 }));
}
