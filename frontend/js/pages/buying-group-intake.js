import {api,apiPrivateFile} from '../api.js';
import {buyingManagementContext} from './buying-group-management.js';
import {mountContractReadingProgress} from './buying-group-reading-queue.js';
import {renderDetailedReading} from './buying-group-reading-view.js';

// Upload comes first. Registration is independent and optional until the operator
// has reviewed the supplier, legal entity and effective dates.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s):'';
const money=n=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(Number(n)||0);
const entities=[['FRANPRIX','Franprix'],['VENEZIA','Venezia Ice'],['FLORMAR','Flormar'],['DAHAB','Dahab'],['INTERSPORT','Intersport'],['PRIMOR','Primor'],['BEAUTY_FOR_YOU','Beauty For You']];
const state={loaded:false,items:[],ai:{enabled:false},selectedId:null,busy:false,error:'',message:'',previewUrl:null,readJobId:null};
let fetchInProgress=null;
const active=()=>state.items.find(x=>x.id===state.selectedId)||null;
const choices=(rows,current)=>rows.map(([v,label])=>'<option value="'+esc(v)+'" '+(String(v)===String(current)?'selected':'')+'>'+esc(label)+'</option>').join('');
const dateFormat=s=>s?new Date(s).toLocaleDateString('fr-FR'):'';
async function load(force=false){
  if(fetchInProgress)return fetchInProgress;
  if(state.loaded&&!force)return;
  fetchInProgress=Promise.all([
    api('/api/buying-group/intakes',{noRetry:true}),
    api('/api/buying-group/ai/status',{noRetry:true}).catch(()=>({enabled:false}))
  ]).then(([incoming,ai])=>{
    state.items=incoming.items||[];state.ai=ai||{enabled:false};
    state.loaded=true;state.error='';
    if(!state.selectedId||!state.items.some(x=>x.id===state.selectedId))
      state.selectedId=state.items.find(x=>x.status!=='REGISTERED')?.id||null;
  }).finally(()=>{fetchInProgress=null});
  return fetchInProgress;
}
function uploadBox(){
  return '<section class="hsi-import"><div class="hsi-import-head"><div><span class="bg-eyebrow">NOUVEAU · IMPORT DIRECT</span>'+
    '<h3>Dépose un contrat. Le reste vient après.</h3>'+
    '<p>Pas besoin de créer un fournisseur ni de remplir les dates avant l’import. Nous enregistrons le document dans une boîte de réception privée.</p></div>'+
    '<span class="hsi-import-mark">01</span></div>'+
    '<label class="hsi-drop"><span class="hsi-drop-icon">↑</span><strong>Importer un PDF ou un DOCX</strong>'+
    '<small>Cliquer pour choisir un fichier ou le déposer ici · Maximum 5 Mo</small>'+
    '<input type="file" id="hsiUpload" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" '+(state.busy?'disabled':'')+'></label>'+
    '<div class="hsi-import-details"><span>1. Document enregistré</span><span>2. Lecture facultative</span><span>3. Validation des champs</span><span>4. Dossier fournisseur créé</span></div>'+
    (state.message?'<div class="hsi-success">'+esc(state.message)+'</div>':'')+
    (state.error?'<div class="hsm-error">'+esc(state.error)+'</div>':'')+'</section>';
}
function intakeList(){
  const pending=state.items.filter(x=>x.status!=='REGISTERED');
  return '<section class="bg-panel hsi-list"><div class="hsm-heading"><h4>Documents en attente</h4><span class="hsm-soft">'+pending.length+' à traiter</span></div>'+
    (pending.length?pending.map(x=>
      '<button class="hsi-document-row '+(state.selectedId===x.id?'selected':'')+'" type="button" data-hsi-select="'+esc(x.id)+'">'+
      '<span class="hsi-document-icon">'+(x.content_type==='application/pdf'?'PDF':'DOCX')+'</span><span><strong>'+esc(x.file_name)+'</strong>'+
      '<small>'+money(x.byte_size/1024)+' Ko · '+dateFormat(x.created_at)+' · '+(x.status==='ANALYZED'?'Lecture IA prête':'Document reçu')+'</small></span>'+
      '<span class="hsi-arrow">→</span></button>').join(''):
      '<div class="hsi-empty">Aucun contrat en attente. Utilise « Importer un PDF ou un DOCX » pour commencer.</div>')+
    '</section>';
}
function findingsPanel(row){
  const analysis=row.ai_analysis;
  if(!analysis)return '';
  return '<section class="hsi-findings"><div class="hsm-heading"><h4>Lecture contractuelle détaillée</h4><span class="hsm-soft">Proposition IA non certifiée</span></div>'+
    '<p>'+esc(analysis.summary||'Pas de synthèse disponible.')+'</p>'+
    '<div class="hsi-kpis"><div><small>Fournisseur</small><strong>'+esc(analysis.supplierName||'À confirmer')+'</strong></div>'+
    '<div><small>Fin du contrat</small><strong>'+esc(analysis.endDate||'À confirmer')+'</strong></div>'+
    '<div><small>Clauses relevées</small><strong>'+esc((analysis.clauses||[]).length)+'</strong></div></div>'+
    renderDetailedReading(analysis,esc)+'</section>';
}
function currentPanel(){
  const item=active();if(!item)return '';
  const analysis=item.ai_analysis||{};
  const suppliers=buyingManagementContext().suppliers||[];
  const title=analysis.title||item.file_name.replace(/\.(pdf|docx)$/i,'');
  const supplierName=analysis.supplierName||'';
  return '<section class="bg-panel hsi-current"><div class="hsm-heading"><h4>Traiter le document</h4><span class="hsm-soft">'+(item.status==='ANALYZED'?'Lu par l’IA':'Non analysé')+'</span></div>'+
  '<div class="hsi-current-file"><strong>'+esc(item.file_name)+'</strong>'+
  '<button id="hsiView" class="hsm-quiet">Ouvrir l’original</button></div>'+
  '<div id="hsiViewer" hidden class="hsi-viewer"></div>'+
  '<div id="hsiReadingProgress" aria-live="polite"></div>'+ 
  (item.content_type==='application/pdf'&&['UPLOADED','ANALYZED'].includes(item.status)?
   (state.ai?.enabled?'<div class="hsi-ai"><p>La lecture se fait sans quitter H&S. Le serveur transmet le PDF au prestataire IA externe seulement après ton accord explicite.</p>'+
    '<label class="hsp-consent"><input type="checkbox" id="hsiConsent"> J’autorise la transmission de ce document à Anthropic via le service IA autorisé par H&S.</label>'+
    '<button type="button" id="hsiAnalyze" class="hsm-quiet">'+(item.status==='ANALYZED'?'Relire en profondeur (2 analyses)':'Analyser en profondeur (2 analyses)')+'</button></div>':
    '<p class="hsi-warning">La lecture IA n’est pas configurée sur ce service. Tu peux tout de même enregistrer le contrat et examiner ses clauses manuellement.</p>')
   :item.content_type!=='application/pdf'?'<p class="hsi-warning">DOCX importé. La lecture IA nécessite un PDF ; le document peut être enregistré sans IA.</p>':'')+
  findingsPanel(item)+
  '<div class="hsi-separator"></div>'+
  '<div class="hsi-registration-head"><h4>Créer le dossier contractuel après vérification</h4><p>Le PDF est déjà importé. Tu peux revenir à cette étape plus tard. Renseigne uniquement les informations que tu as vérifiées dans le document.</p></div>'+
  '<form id="hsiRegister" class="hsm-form">'+
  '<label class="hsm-field"><span>Fournisseur déjà existant (optionnel)</span><select name="supplierId">'+choices([['','Créer ou retrouver par nom'],...suppliers.map(x=>[x.id,x.name])],'')+'</select></label>'+
  '<label class="hsm-field"><span>Nom du fournisseur</span><input name="supplierName" type="text" maxlength="200" value="'+esc(supplierName)+'" placeholder="Ex. Lesieur"></label>'+
  '<label class="hsm-field"><span>Titre du contrat</span><input name="title" type="text" maxlength="240" required minlength="3" value="'+esc(title)+'"></label>'+
  '<div class="hsm-form-grid">'+
  '<label class="hsm-field"><span>Périmètre</span><select name="scope">'+choices([['GROUP','Accord Groupe H&S'],['LOCAL','Accord d’une enseigne']],'GROUP')+'</select></label>'+
  '<label class="hsm-field"><span>Enseigne</span><select name="entityCode">'+choices([['GROUP','H&S Groupe'],...entities],'GROUP')+'</select></label></div>'+
  '<div class="hsm-form-grid">'+
  '<label class="hsm-field"><span>Date de début (à vérifier)</span><input name="effectiveFrom" type="date" required value="'+esc(safeDate(analysis.startDate))+'"></label>'+
  '<label class="hsm-field"><span>Date de fin (à vérifier)</span><input name="effectiveTo" type="date" required value="'+esc(safeDate(analysis.endDate))+'"></label></div>'+
  '<div class="hsm-form-grid"><label class="hsm-field"><span>Assiette RFA (modifiable ensuite)</span><select name="rebateBase">'+
   choices([['NET_PURCHASES','Achats nets'],['NET_INVOICED','Factures nettes']],analysis.rebateBase||'NET_PURCHASES')+'</select></label>'+
  '<label class="hsm-field"><span>Calcul RFA (modifiable ensuite)</span><select name="rebateMode">'+
   choices([['RETROACTIVE','Rétroactif'],['MARGINAL','Progressif']],analysis.rebateMode||'RETROACTIVE')+'</select></label></div>'+
  '<p class="hsm-note">Les paliers, clauses détaillées et obligations seront revus après la création du dossier. Aucun taux proposé par l’IA n’est validé ici.</p>'+
  '<label class="hsp-consent"><input type="checkbox" name="confirmReview" required> J’ai vérifié le fournisseur, l’entité, les dates et le document original. Je crée un brouillon, sans approbation ni écriture D365.</label>'+
  '<button type="submit" class="hsm-primary" '+(state.busy?'disabled':'')+'>Créer le dossier à partir du document importé</button></form></section>';
}
async function viewer(root,item){
  const host=root.querySelector('#hsiViewer');if(!host)return;
  if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl=null}
  host.hidden=false;host.innerHTML='<div class="hsm-loading">Lecture sécurisée du fichier…</div>';
  try{
    const blob=await apiPrivateFile('/api/buying-group/intakes/'+encodeURIComponent(item.id)+'/download');
    const url=URL.createObjectURL(blob);state.previewUrl=url;
    if(item.content_type==='application/pdf'){
      host.innerHTML='<div class="hsi-viewer-head"><strong>'+esc(item.file_name)+'</strong><button id="hsiCloseViewer" class="hsm-quiet">Fermer</button></div><iframe title="Original du contrat" class="hsi-viewer-frame"></iframe>';
      host.querySelector('iframe').src=url;
    }else{
      host.innerHTML='<p>DOCX : le navigateur ne peut pas afficher directement ce format. <a id="hsiSaveOriginal">Télécharger le fichier original</a></p>';
      host.querySelector('a').href=url;host.querySelector('a').download=item.file_name;
    }
    host.querySelector('#hsiCloseViewer')?.addEventListener('click',()=>{
      if(state.previewUrl){URL.revokeObjectURL(state.previewUrl);state.previewUrl=null}
      host.hidden=true;host.replaceChildren();
    });
  }catch(error){host.innerHTML='<p class="hsi-warning">'+esc(error.message)+'</p>'}
}
export async function renderContractIntake(root,onRegistered,{force=false}={}){
  if(!root)return;
  root.innerHTML='<div class="hsm-loading">Chargement des documents privés…</div>';
  try{await load(force)}catch(error){
    state.error=error.message;
    root.innerHTML='<section class="hsi-import"><h3>Import indisponible</h3><p>'+esc(error.message)+'</p>'+
      '<button id="hsiRetry" class="hsm-quiet">Réessayer</button></section>';
    root.querySelector('#hsiRetry')?.addEventListener('click',()=>renderContractIntake(root,onRegistered,{force:true}));return;
  }
  if(!root.isConnected)return;
  root.innerHTML=uploadBox()+'<div class="hsi-inbox-layout">'+intakeList()+currentPanel()+'</div>';
  const upload=async file=>{
    if(!file)return;
    if(file.size>5*1024*1024){state.error='Fichier supérieur à 5 Mo : compresse le PDF pour le moment.';await renderContractIntake(root,onRegistered);return}
    if(!/\.(pdf|docx)$/i.test(file.name)){state.error='Seuls les formats PDF et DOCX sont acceptés.';await renderContractIntake(root,onRegistered);return}
    if(state.busy)return;state.busy=true;state.error='';state.message='';
    try{
      const uploaded=await apiPrivateFile('/api/buying-group/intakes',{method:'POST',file});
      state.selectedId=uploaded.item.id;
      state.message=uploaded.item.reused?'Ce document figurait déjà dans la boîte de réception.':'Contrat importé avec succès. Tu peux désormais le lire ou compléter sa fiche.';
      state.busy=false;await renderContractIntake(root,onRegistered,{force:true});
    }catch(error){state.busy=false;state.error=error.message;await renderContractIntake(root,onRegistered)}
    finally{state.busy=false}
  };
  root.querySelector('#hsiUpload')?.addEventListener('change',e=>upload(e.target.files?.[0]));
  const drop=root.querySelector('.hsi-drop');
  for(const event of ['dragenter','dragover'])drop?.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging')});
  drop?.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
  drop?.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');upload(e.dataTransfer?.files?.[0])});
  root.querySelectorAll('[data-hsi-select]').forEach(btn=>btn.addEventListener('click',()=>{
    state.selectedId=btn.dataset.hsiSelect;state.error='';state.message='';
    renderContractIntake(root,onRegistered);
  }));
  const item=active();
  if(item){
    mountContractReadingProgress(root.querySelector('#hsiReadingProgress'),{
      targetType:'INTAKE',targetId:item.id,expectedJobId:state.readJobId,
      onComplete:async()=>{
        state.readJobId=null;
        state.message='Lecture approfondie terminée : vérifie les preuves et les conditions avant de valider.';
        await renderContractIntake(root,onRegistered,{force:true});
      }
    });
  }
  root.querySelector('#hsiView')?.addEventListener('click',()=>viewer(root,item));
  root.querySelector('[name="scope"]')?.addEventListener('change',e=>{
    const sel=root.querySelector('[name="entityCode"]');
    if(sel)sel.value=e.target.value==='GROUP'?'GROUP':'FRANPRIX';
  });
  root.querySelector('#hsiAnalyze')?.addEventListener('click',async()=>{
    if(!root.querySelector('#hsiConsent')?.checked){state.error='Coche le consentement explicite avant la lecture IA.';await renderContractIntake(root,onRegistered);return}
    if(state.busy)return;state.busy=true;state.error='';state.message='';
    try{
      const queued=await api('/api/buying-group/intakes/'+encodeURIComponent(item.id)+'/analyze',
        {method:'POST',body:{consent:true,reanalyze:item.status==='ANALYZED'},noRetry:true});
      state.readJobId=queued.jobId;
      state.message='Analyse démarrée sur le serveur. Tu peux suivre son avancement ici sans quitter H&S.';
      state.busy=false;await renderContractIntake(root,onRegistered,{force:true});
    }catch(error){state.busy=false;state.error=error.message;await renderContractIntake(root,onRegistered)}
    finally{state.busy=false}
  });
  root.querySelector('#hsiRegister')?.addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy)return;
    const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    const payload={
      supplierId:values.supplierId||null,supplierName:values.supplierName||'',
      title:values.title,scope:values.scope,entityCode:values.scope==='GROUP'?'GROUP':values.entityCode,
      effectiveFrom:values.effectiveFrom,effectiveTo:values.effectiveTo,
      rebateBase:values.rebateBase,rebateMode:values.rebateMode,rebateTiers:[],
      confirmReview:values.confirmReview==='on'
    };
    state.busy=true;state.error='';
    try{
      const created=await api('/api/buying-group/intakes/'+encodeURIComponent(item.id)+'/register',
        {method:'POST',body:payload,noRetry:true});
      state.message='Dossier contractuel créé et document classé. Vérifie maintenant les clauses et les actions.';
      state.selectedId=null;state.loaded=false;state.busy=false;
      await onRegistered?.(created.item.contractId);
    }catch(error){state.error=error.message;await renderContractIntake(root,onRegistered)}
    finally{state.busy=false}
  });
}
