import {api} from '../api.js';
import {parsePurchaseCSV} from './buying-group-csv.js';
import {buyingManagementContext,loadBuyingManagement} from './buying-group-management.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=n=>new Intl.NumberFormat('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)+' MAD';
const cents=n=>currency(Number(n||0)/100);
const entities=[['FRANPRIX','Franprix'],['VENEZIA','Venezia Ice'],['FLORMAR','Flormar'],['DAHAB','Dahab'],['INTERSPORT','Intersport'],['PRIMOR','Primor'],['BEAUTY_FOR_YOU','Beauty For You']];
const state={loaded:false,items:[],batches:[],summary:null,error:'',preview:null,feedback:'',reconciliation:null,contractId:'',busy:false,sourceKind:'MANUAL_CSV',entityCode:'FRANPRIX',supplierId:''};
let inFlight=null;
const opts=(pairs,selected)=>pairs.map(([v,t])=>'<option value="'+escape(v)+'" '+(v===selected?'selected':'')+'>'+escape(t)+'</option>').join('');
function title(hint,heading,side=''){return '<div class="bg-section-title"><div><span class="bg-eyebrow">'+hint+'</span><h3>'+heading+'</h3></div><span class="bg-subnote">'+escape(side)+'</span></div>';}
function numberInput(name,label,kind='text',more=''){return '<label class="hsm-field"><span>'+label+'</span><input name="'+name+'" type="'+kind+'" '+more+'></label>';}
export function purchaseSnapshot(){return state.loaded?state.summary:null;}
export async function loadPurchaseEvidence(force=false){
  if(inFlight)return inFlight;
  if(state.loaded&&!force)return;
  inFlight=(async()=>{
    const [records,stats]=await Promise.all([
      api('/api/buying-group/purchases',{noRetry:true}),
      api('/api/buying-group/purchases/summary',{noRetry:true})
    ]);
    state.items=records.items||[];state.batches=records.batches||[];
    state.summary=stats;state.error='';state.loaded=true;
  })().catch(e=>{state.error=e.message;throw e}).finally(()=>{inFlight=null});
  return inFlight;
}
function template(){
  const content='\uFEFFreference;ligne;date;montant_ht;compte_fournisseur;description\nFAC-TEST-001;0;2026-10-01;1500.00;;Montant net HT facture (exemple fictif)\nAV-TEST-001;0;2026-10-02;-150.00;;Avoir HT (exemple fictif)\n';
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='modele_journal_achats_hs.csv';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function importPanel(){
  const management=buyingManagementContext(),suppliers=management.suppliers||[];
  if(!state.supplierId&&suppliers.length)state.supplierId=suppliers[0].id;
  const amount=state.preview?.reduce((s,r)=>s+Number(r.netAmount),0)||0;
  return '<section class="bg-panel"><div class="hsm-heading"><h4>Importer un journal d’achats</h4><span class="hsm-soft">Preuve comptable à contrôler</span></div>'+
  '<form id="hsImportForm" class="hsm-form">'+
  '<div class="hsm-form-grid"><label class="hsm-field"><span>Enseigne</span><select name="entityCode">'+opts(entities,state.entityCode)+'</select></label>'+
  '<label class="hsm-field"><span>Fournisseur</span><select name="supplierId">'+opts(suppliers.map(s=>[s.id,s.name]),state.supplierId)+'</select></label></div>'+
  '<div class="hsm-form-grid"><label class="hsm-field"><span>Type de source</span><select name="sourceKind">'+opts([['MANUAL_CSV','CSV / données non vérifiées'],['D365_EXPORT','Export Dynamics 365 (déclaratif)']],state.sourceKind)+'</select></label>'+
  numberInput('dataAreaId','Société D365 (dataAreaId)','text','maxlength="20" placeholder="Obligatoire pour export D365"')+'</div>'+
  '<div class="hsm-upload hsm-purchase-upload"><label>Choisir le fichier CSV (200 lignes maximum)<input type="file" name="file" accept=".csv,text/csv" required></label></div>'+
  '<button class="hsm-quiet" id="hsTemplate" type="button">Télécharger un modèle CSV</button>'+
  '<p class="hsm-note">Une ligne par facture ou par ligne identifiée. Champs requis : reference, date AAAA-MM-JJ, montant_ht. Les avoirs sont négatifs. Pour un export Dynamics, le compte fournisseur doit être préalablement associé à l’enseigne et la société dataAreaId renseignée.</p>'+
  (state.preview?'<div class="hsm-preview"><strong>'+state.preview.length+' lignes prêtes à importer</strong><small>Total net déclaré : '+currency(amount)+' · Vérifier références, unités et avoirs avant validation.</small>'+
  '<div class="hsm-table-wrap"><table class="hsm-table"><thead><tr><th>Référence</th><th>Date</th><th>Montant HT</th></tr></thead><tbody>'+
  state.preview.slice(0,7).map(r=>'<tr><td>'+escape(r.reference)+'</td><td>'+escape(r.date)+'</td><td>'+currency(r.netAmount)+'</td></tr>').join('')+'</tbody></table></div>'+
  '<button class="hsm-primary" type="submit" '+(state.busy?'disabled':'')+'>Valider l’import en base</button></div>':
  '<div class="hsm-empty">Sélectionne ton fichier. Un aperçu apparaîtra avant tout enregistrement.</div>')+
  '</form></section>';
}
function historyPanel(){
  const total=state.summary?.total||{},byEntity=state.summary?.entities||[];
  return '<section class="bg-panel"><div class="hsm-heading"><h4>Volume importé — non certifié</h4><span class="hsm-soft">Données H&S persistantes</span></div>'+
  '<div class="hsm-purchase-stats"><div><small>Documents / lignes</small><strong>'+escape(total.line_count??'0')+'</strong></div><div><small>Achats nets déclarés</small><strong>'+cents(total.amount_cents||'0')+'</strong></div></div>'+
  (byEntity.length?'<div class="hsm-table-wrap"><table class="hsm-table"><thead><tr><th>Enseigne</th><th>Lignes</th><th>Net importé</th></tr></thead><tbody>'+
  byEntity.map(x=>'<tr><td>'+escape(x.entity_code)+'</td><td>'+escape(x.line_count)+'</td><td>'+cents(x.amount_cents)+'</td></tr>').join('')+
  '</tbody></table></div>':'<div class="hsm-empty">Aucun achat importé.</div>')+
  '<div class="hsm-subsection">Derniers lots d’import</div>'+
  (state.batches.length?state.batches.slice(0,12).map(x=>'<div class="hsm-purchase-batch"><span><strong>'+escape(x.supplier_name)+'</strong><small>'+escape(x.entity_code)+' · '+escape(x.source_kind)+' · '+escape(new Date(x.created_at).toLocaleDateString('fr-FR'))+'</small></span>'+
  '<span>'+escape(x.inserted_count)+' nouvelles · '+escape(x.skipped_count)+' ignorées</span></div>').join(''):'<p class="hsm-note">Aucun import historique.</p>')+'</section>';
}
function recordsPanel(){
  return '<section class="bg-panel"><div class="hsm-heading"><h4>Écritures importées</h4><span class="hsm-soft">'+state.items.length+' dernières lignes</span></div>'+
  (state.items.length?'<div class="hsm-table-wrap"><table class="hsm-table"><thead><tr><th>Enseigne</th><th>Fournisseur</th><th>Référence</th><th>Date</th><th>Net HT MAD</th></tr></thead><tbody>'+
  state.items.map(x=>'<tr><td>'+escape(x.entity_code)+'</td><td>'+escape(x.supplier_name)+'</td><td>'+escape(x.external_reference)+' <small>ligne '+escape(x.line_key)+' · '+escape(x.source_kind)+'</small></td><td>'+escape(x.document_date)+'</td><td>'+cents(x.amount_cents)+'</td></tr>').join('')+'</tbody></table></div>':
  '<div class="hsm-empty">Aucune écriture importée.</div>')+'</section>';
}
function reconcilePanel(){
  const agreements=buyingManagementContext().contracts||[];
  if(!state.contractId&&agreements.length)state.contractId=agreements[0].id;
  const r=state.reconciliation;
  return '<section class="bg-panel"><div class="hsm-heading"><h4>Rapprocher un contrat avec les achats importés</h4><span class="hsm-soft">Calcul théorique, non comptabilisé</span></div>'+
  '<form id="hsReconcileForm" class="hsm-form"><label class="hsm-field"><span>Contrat à analyser</span><select name="contractId">'+opts(agreements.map(x=>[x.id,x.supplier_name+' · '+x.title+' ['+x.entity_code+']']),state.contractId)+'</select></label>'+
  '<p class="hsm-note">Le calcul prend les écritures importées dont la date appartient à la validité du contrat. Chaque contrat est calculé indépendamment : ne pas cumuler un contrat Groupe et ses annexes locales.</p>'+
  '<button class="hsm-primary" type="submit" '+(!agreements.length?'disabled':'')+'>Calculer sur les écritures importées</button></form>'+
  (r?'<div class="hsm-reconciliation"><div class="hsm-heading"><h4>Résultat : '+escape(r.contract.title)+'</h4><span class="hsm-soft">'+escape(r.contract.scope)+' / '+escape(r.contract.entity)+'</span></div>'+
    '<div class="hsm-purchase-stats"><div><small>Assiette nette déclarée</small><strong>'+currency(r.importedNetMAD)+'</strong></div><div><small>RFA théorique</small><strong>'+currency(r.estimatedRfaMAD)+'</strong></div></div>'+
    '<p class="hsm-note">'+escape(r.lines)+' ligne(s), '+escape(r.entities.join(', ')||'aucune enseigne')+' · période '+escape(r.from)+' → '+escape(r.to)+' · '+escape(r.mode)+'</p>'+
    (r.overlapRisk?'<p class="hsm-warning">Risque de double comptage : une annexe locale active couvre aussi cette période. Ne pas additionner ces RFA.</p>':'')+
    '<p class="hsm-warning">'+escape(r.warning)+'</p></div>':
  '<div class="hsm-empty">Sélectionne un contrat et lance un rapprochement sur les factures importées.</div>')+
  '</section>';
}
export async function renderPurchaseEvidence(tab,root){
  if(!root)return;
  root.innerHTML='<div class="hsm-loading">Chargement du journal d’achats…</div>';
  try{await Promise.all([loadPurchaseEvidence(),loadBuyingManagement()])}
  catch(e){root.innerHTML='<div class="hsm-error"><strong>Journal d’achats indisponible</strong><p>'+escape(e.message)+'</p><button class="hsm-primary" id="hsRetry">Réessayer</button></div>';
    root.querySelector('#hsRetry')?.addEventListener('click',()=>{state.loaded=false;renderPurchaseEvidence(tab,root)});
    return;
  }
  if(!root.isConnected)return;
  if(tab==='purchases')root.innerHTML=title('JOURNAL D’ACHATS','Imports & preuves d’achat','D365 Export / CSV · sans modification ERP')+
    (state.feedback?'<div class="hsm-success">'+escape(state.feedback)+'</div>':'')+
    '<div class="hsm-grid hsm-grid-2">'+importPanel()+historyPanel()+'</div><div style="margin-top:16px">'+recordsPanel()+'</div>';
  else root.innerHTML=title('RFA · RAPPROCHEMENT','Du contrat aux achats','Preuves importées · assiette non certifiée')+reconcilePanel();
  const form=root.querySelector('#hsImportForm');
  root.querySelector('#hsTemplate')?.addEventListener('click',template);
  form?.querySelector('[name="file"]')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{state.preview=parsePurchaseCSV(await file.text());state.feedback='';await renderPurchaseEvidence(tab,root)}
    catch(error){state.preview=null;alert(error.message)}
  });
  // Retain business selection between preview and submission.
  form?.querySelector('[name="entityCode"]')?.addEventListener('change',e=>{state.entityCode=e.target.value});
  form?.querySelector('[name="sourceKind"]')?.addEventListener('change',e=>{state.sourceKind=e.target.value});
  form?.querySelector('[name="supplierId"]')?.addEventListener('change',e=>{state.supplierId=e.target.value});
  form?.addEventListener('submit',async event=>{
    event.preventDefault();if(!state.preview?.length||state.busy)return;
    const fields=new FormData(form);
    if(!confirm('Importer ces écritures non certifiées, sans modification de Dynamics 365 ?'))return;
    state.busy=true;
    try{
      const payload={sourceKind:fields.get('sourceKind'),entityCode:fields.get('entityCode'),supplierId:fields.get('supplierId'),dataAreaId:fields.get('dataAreaId'),rows:state.preview};
      const result=await api('/api/buying-group/purchases/import',{method:'POST',body:payload,noRetry:true});
      state.feedback='Import terminé : '+result.inserted+' nouvelles lignes, '+result.skipped+' doublons identiques ignorés.';
      state.preview=null;state.loaded=false;
      await renderPurchaseEvidence('purchases',root);
    }catch(error){alert(error.message)}finally{state.busy=false}
  });
  const reconcile=root.querySelector('#hsReconcileForm');
  reconcile?.querySelector('[name="contractId"]')?.addEventListener('change',e=>{state.contractId=e.target.value;state.reconciliation=null});
  reconcile?.addEventListener('submit',async event=>{
    event.preventDefault();
    const id=new FormData(reconcile).get('contractId');if(!id)return;
    try{state.contractId=String(id);state.reconciliation=await api('/api/buying-group/contracts/'+encodeURIComponent(id)+'/reconcile',{noRetry:true});
      await renderPurchaseEvidence('reconcile',root);
    }catch(error){alert(error.message)}
  });
}
