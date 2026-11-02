import {api,apiPrivateFile} from '../api.js';

const q=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(Number(v)||0);
const entities=[['GROUP','Groupe H&S'],['FRANPRIX','Franprix'],['VENEZIA','Venezia Ice'],['FLORMAR','Flormar'],['DAHAB','Dahab'],['INTERSPORT','Intersport'],['PRIMOR','Primor'],['BEAUTY_FOR_YOU','Beauty For You']];
const data={overview:null,suppliers:[],contracts:[],audit:[],loaded:false,error:'',busy:false,lastUpdated:null,sim:null};
let loadPromise=null;
export function buyingSnapshot(){return data.loaded?data.overview:null;}
export async function loadBuyingManagement({force=false}={}){
  if(loadPromise)return loadPromise;
  if(data.loaded&&!force)return;
  loadPromise=(async()=>{
    const [overview,suppliers,contracts,audit]=await Promise.all([
      api('/api/buying-group/overview',{noRetry:true}),
      api('/api/buying-group/suppliers',{noRetry:true}),
      api('/api/buying-group/contracts',{noRetry:true}),
      api('/api/buying-group/audit',{noRetry:true})
    ]);
    data.overview=overview;data.suppliers=suppliers.items||[];
    data.contracts=contracts.items||[];data.audit=audit.items||[];
    data.loaded=true;data.error='';data.lastUpdated=new Date().toISOString();
  })().catch(error=>{data.error=error?.message||'API Centrale d’achat indisponible.';throw error})
    .finally(()=>{loadPromise=null});
  return loadPromise;
}
function sel(options,selected){
 return options.map(([value,label])=>'<option value="'+q(value)+'" '+(value===selected?'selected':'')+'>'+q(label)+'</option>').join('');
}
function field(name,label,type='text',extra=''){
 return '<label class="hsm-field"><span>'+q(label)+'</span><input name="'+q(name)+'" type="'+type+'" '+extra+'></label>';
}
function section(title,subtitle){return '<div class="bg-section-title"><div><span class="bg-eyebrow">H&S · CENTRALE D’ACHAT</span><h3>'+title+'</h3></div><span class="bg-subnote">'+subtitle+'</span></div>';}
function supplierList(){
  const rows=data.suppliers;
  return section('Fournisseurs Groupe',rows.length+' fournisseur(s) enregistrés')+
    '<div class="hsm-grid hsm-grid-2"><section class="bg-panel"><div class="hsm-heading"><h4>Référentiel fournisseur</h4><span class="hsm-soft">Données persistantes</span></div>'+
    (rows.length?'<div class="hsm-table-wrap"><table class="hsm-table"><thead><tr><th>Fournisseur</th><th>Catégorie</th><th>Contrats</th><th>État</th></tr></thead><tbody>'+
      rows.map(v=>'<tr><td><strong>'+q(v.name)+'</strong><small>'+q(v.tax_identifier||'Identifiant fiscal non renseigné')+'</small></td><td>'+q(v.category||'—')+'</td><td>'+fmt(v.contracts_count)+'</td><td><span class="hsm-status">'+q(v.status)+'</span></td></tr>').join('')+
      '</tbody></table></div>':'<div class="hsm-empty">Aucun fournisseur pour le moment. Crée le premier référentiel ci-contre.</div>')+
    '</section><section class="bg-panel"><div class="hsm-heading"><h4>Ajouter un fournisseur</h4><span class="hsm-soft">Groupe H&S</span></div>'+
    '<form data-hsm-form="supplier" class="hsm-form">'+field('name','Raison sociale / nom fournisseur','text','required minlength="3" maxlength="200" placeholder="Ex. Lesieur"')+
    '<div class="hsm-form-grid">'+field('category','Catégorie d’achats','text','maxlength="100" placeholder="Ex. Épicerie"')+
    field('taxIdentifier','Identifiant fiscal (facultatif)','text','maxlength="80"')+'</div>'+
    '<div class="hsm-subsection">Références D365 par enseigne</div>'+
    '<div class="hsm-form-grid"><label class="hsm-field"><span>Enseigne</span><select name="mappingEntity">'+sel(entities.filter(x=>x[0]!=='GROUP'),'FRANPRIX')+'</select></label>'+
    field('mappingAccount','Compte fournisseur ERP','text','placeholder="Code fournisseur D365"')+'</div>'+
    '<p class="hsm-note">Le compte ERP sera enregistré comme correspondance déclarative, sans synchronisation automatique.</p>'+
    '<button class="hsm-primary" type="submit">+ Enregistrer le fournisseur</button></form></section></div>';
}
function rowContract(c){
  const exp=c.effective_to?String(c.effective_to).slice(0,10):'';
  return '<article class="hsm-contract"><div class="hsm-contract-main"><div class="hsm-contract-eyebrow">'+q(c.scope)+' · '+q(c.entity_code)+' · '+q(c.status)+'</div>'+
  '<strong>'+q(c.title)+'</strong><small>'+q(c.supplier_name||'—')+' · '+q(String(c.effective_from||'').slice(0,10))+' — '+q(exp)+'</small>'+
  '<div class="hsm-contract-fine">'+q(c.rebate_mode)+' · '+(c.rebate_tiers?.length||0)+' palier(s) · '+q(c.documents_count||0)+' document(s)</div></div>'+
  '<div class="hsm-contract-actions"><button type="button" data-hsm-files="'+q(c.id)+'">Pièces</button>'+
  (c.status==='DRAFT'?'<button type="button" data-hsm-approve="'+q(c.id)+'">Activer</button>':'')+
  '</div></article>';
}
function contractForm(){
  const suppliers=data.suppliers.map(x=>[x.id,x.name]);
  return '<section class="bg-panel"><div class="hsm-heading"><h4>Nouvel accord commercial</h4><span class="hsm-soft">Brouillon et validation</span></div>'+
  (suppliers.length?'':'<div class="hsm-empty">Il faut créer au moins un fournisseur avant un contrat.</div>')+
  '<form data-hsm-form="contract" class="hsm-form">'+
  '<label class="hsm-field"><span>Fournisseur</span><select name="supplierId" required '+(!suppliers.length?'disabled':'')+'>'+sel(suppliers)+'</select></label>'+
  field('title','Titre du contrat / accord','text','required maxlength="240" placeholder="Ex. Accord cadre 2027 - Lesieur"')+
  '<div class="hsm-form-grid"><label class="hsm-field"><span>Périmètre</span><select name="scope"><option value="GROUP">Contrat Groupe</option><option value="LOCAL">Annexe / contrat local</option></select></label>'+
  '<label class="hsm-field"><span>Enseigne juridique</span><select name="entityCode">'+sel(entities,'GROUP')+'</select></label></div>'+
  '<div class="hsm-form-grid">'+field('effectiveFrom','Début de validité','date','required')+
  field('effectiveTo','Fin de validité','date','required')+'</div>'+
  '<div class="hsm-form-grid"><label class="hsm-field"><span>Assiette RFA</span><select name="rebateBase"><option value="NET_PURCHASES">Achats nets</option><option value="NET_INVOICED">Factures nettes</option></select></label>'+
  '<label class="hsm-field"><span>Mode RFA</span><select name="rebateMode"><option value="RETROACTIVE">Rétroactive</option><option value="MARGINAL">Marginale / progressive</option></select></label></div>'+
  '<div class="hsm-subsection">Paliers de marge arrière</div><div id="hsmTiers"><div class="hsm-tier-row">'+
  field('threshold','Seuil MAD','number','min="0" step="0.01" value="0" required')+
  field('rate','Taux %','number','min="0" max="100" step="0.01" value="3" required')+'</div></div>'+
  '<button type="button" class="hsm-quiet" id="hsmAddTier">+ Ajouter un palier</button>'+
  '<div class="hsm-form-grid">'+field('paymentTermsDays','Paiement (jours)','number','min="0" max="365"')+
  field('parentContractId','ID accord parent (annexe)','text','placeholder="Facultatif"')+'</div>'+
  '<label class="hsm-field"><span>Observations / exclusions</span><textarea name="notes" rows="3" maxlength="4000" placeholder="Clauses à confirmer, exclusions, transport…"></textarea></label>'+
  '<p class="hsm-note">Enregistré en brouillon. Une pièce contractuelle et une validation Direction sont obligatoires avant activation. Aucun posting D365.</p>'+
  '<button class="hsm-primary" type="submit" '+(!suppliers.length?'disabled':'')+'>+ Créer le contrat</button></form></section>';
}
function contractList(){
  return section('Contrats & conditions commerciales',data.contracts.length+' accord(s) enregistrés')+
  '<div class="hsm-grid hsm-grid-2"><div><section class="bg-panel">'+
  '<div class="hsm-heading"><h4>Contrathèque H&S</h4><span class="hsm-soft">PDF / Word sécurisés</span></div>'+
  (data.contracts.length?data.contracts.map(rowContract).join(''):'<div class="hsm-empty">Aucun contrat. Crée le premier accord Groupe ou local.</div>')+
  '</section><div class="bg-panel hsm-highlight" id="hsmFilesPanel"><h4>Documents contractuels</h4><p>Sélectionne « Pièces » sur un contrat pour charger ou télécharger ses versions.</p></div></div>'+
  contractForm()+'</div>';
}
function rebateView(){
  return section('Moteur de marges arrière','Calcul contractuel · sans écriture comptable')+
  '<div class="hsm-grid hsm-grid-2"><section class="bg-panel"><div class="hsm-heading"><h4>Simuler un accord</h4><span class="hsm-soft">RFA rétroactive ou progressive</span></div>'+
  '<form data-hsm-form="simulate" class="hsm-form">'+
  '<label class="hsm-field"><span>Contrat</span><select name="contractId" required>'+sel(data.contracts.map(c=>[c.id,c.supplier_name+' — '+c.title+' ['+c.status+']']))+'</select></label>'+
  field('spend','Assiette de dépenses MAD','number','required min="0" step="0.01" placeholder="Ex. 1200000"')+
  '<p class="hsm-note">La simulation utilise les paliers du contrat saisi. Elle n’applique pas encore les remises croisées, exclusions ou retours issus des factures Dynamics.</p>'+
  '<button class="hsm-primary" type="submit" '+(!data.contracts.length?'disabled':'')+'>Calculer la RFA</button></form></section>'+
  '<section class="hsm-simulation"><span class="bg-eyebrow">RÉSULTAT CALCULÉ</span>'+
  (data.sim?'<p>'+q(data.sim.contract.title)+'</p><strong>'+fmt(data.sim.result.rebate)+' MAD</strong>'+
  '<div class="hsm-simulation-line">Assiette : '+fmt(data.sim.result.spend)+' MAD</div>'+
  '<div class="hsm-simulation-line">Taux effectif : '+q(data.sim.result.ratePct?.toFixed(2))+' %</div>'+
  '<div class="hsm-simulation-line">Méthode : '+q(data.sim.result.mode)+'</div>':
  '<strong>—</strong><p>Choisis un accord et sa base de calcul pour obtenir une simulation.</p>')+
  '<div class="hsm-simulation-caveat">Simulation indicative, aucune facture ni créance comptabilisée.</div></section></div>';
}
function auditView(){
  return section('Journal de traçabilité','Historique des modifications enregistré en base')+
    '<section class="bg-panel"><div class="hsm-heading"><h4>Dernières actions</h4><span class="hsm-soft">Serveur</span></div>'+
    (data.audit.length?'<div class="hsm-table-wrap"><table class="hsm-table"><thead><tr><th>Date</th><th>Événement</th><th>Opérateur</th><th>Type</th></tr></thead><tbody>'+
    data.audit.map(e=>'<tr><td>'+q(new Date(e.created_at).toLocaleString('fr-FR'))+'</td><td><strong>'+q(e.action)+'</strong></td><td>'+q(e.actor_id)+'</td><td>'+q(e.object_type)+'</td></tr>').join('')+
    '</tbody></table></div>':'<div class="hsm-empty">Aucune action enregistrée.</div>')+'</section>';
}
function filePanel(contract,files=[]){
  return '<div class="hsm-heading"><h4>Pièces : '+q(contract.title)+'</h4><span class="hsm-soft">'+files.length+' version(s)</span></div>'+
  '<div class="hsm-file-list">'+(files.length?files.map(f=>'<div class="hsm-file"><span><strong>'+q(f.file_name)+'</strong><small>Version '+q(f.version)+' · '+fmt(f.byte_size/1024)+' Ko · '+q(new Date(f.uploaded_at).toLocaleDateString('fr-FR'))+'</small></span>'+
  '<button data-hsm-download="'+q(f.id)+'" data-file-name="'+q(f.file_name)+'">Télécharger</button></div>').join(''):
  '<p class="hsm-note">Pas encore de document contractuel.</p>')+'</div>'+
  '<label class="hsm-upload">+ Ajouter un PDF / DOCX (5 Mo maximum)<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-hsm-upload="'+q(contract.id)+'"></label>'+
  '<p class="hsm-note">Accès privé côté serveur et versions immuables. Le stockage actuel est dans PostgreSQL ; l’extraction IA n’est pas encore activée.</p>';
}
async function fileOperations(root,contractId,refresh){
  const panel=root.querySelector('#hsmFilesPanel'),contract=data.contracts.find(c=>c.id===contractId);
  if(!panel||!contract)return;
  panel.innerHTML='<div class="hsm-loading">Lecture des pièces sécurisées…</div>';
  try{
    const result=await api('/api/buying-group/contracts/'+contractId+'/files',{noRetry:true});
    panel.innerHTML=filePanel(contract,result.items||[]);
    panel.querySelector('[data-hsm-upload]')?.addEventListener('change',async ev=>{
      const file=ev.target.files?.[0];if(!file)return;
      if(file.size>5*1024*1024){alert('Le fichier dépasse 5 Mo.');return}
      try{
        await apiPrivateFile('/api/buying-group/contracts/'+contractId+'/files',{method:'POST',file});
        await loadBuyingManagement({force:true});await refresh();await fileOperations(root,contractId,refresh);
      }catch(error){alert(error.message)}
    });
    panel.querySelectorAll('[data-hsm-download]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        const blob=await apiPrivateFile('/api/buying-group/documents/'+button.dataset.hsmDownload+'/download');
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
        a.download=button.dataset.fileName||'contrat.pdf';document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),3000);
      }catch(error){alert(error.message)}finally{button.disabled=false}
    }));
  }catch(error){panel.innerHTML='<div class="hsm-error">'+q(error.message)+'</div>'}
}
function collectTiers(form){
  const rows=[...form.querySelectorAll('.hsm-tier-row')];
  return rows.map(row=>{
    const threshold=row.querySelector('[name="threshold"]').value;
    const rate=Number(row.querySelector('[name="rate"]').value);
    if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('Taux RFA invalide.');
    return {threshold,rateBps:Math.round(rate*100)};
  }).sort((a,b)=>Number(a.threshold)-Number(b.threshold));
}
async function onSubmit(e,root,refresh){
  e.preventDefault();const form=e.currentTarget,kind=form.dataset.hsmForm;
  if(data.busy)return;
  data.busy=true;const btn=form.querySelector('[type="submit"]');if(btn)btn.disabled=true;
  try{
    const payload=Object.fromEntries(new FormData(form).entries());
    if(kind==='supplier'){
      payload.accountMappings=payload.mappingAccount?{[payload.mappingEntity]:payload.mappingAccount}:{};
      delete payload.mappingAccount;delete payload.mappingEntity;
      await api('/api/buying-group/suppliers',{method:'POST',body:payload,noRetry:true});
    }else if(kind==='contract'){
      payload.rebateTiers=collectTiers(form);
      delete payload.threshold;delete payload.rate;
      if(payload.scope==='GROUP')payload.entityCode='GROUP';
      else if(payload.entityCode==='GROUP')throw Error('Choisir une enseigne pour un contrat local.');
      await api('/api/buying-group/contracts',{method:'POST',body:payload,noRetry:true});
    }else if(kind==='simulate'){
      data.sim=await api('/api/buying-group/simulate',{method:'POST',body:payload,noRetry:true});
    }
    if(kind!=='simulate')await loadBuyingManagement({force:true});
    await refresh();
    if(kind!=='simulate')alert('Enregistrement réussi. Les données sont conservées en base.');
  }catch(error){alert(error?.message||'Enregistrement indisponible.')}finally{data.busy=false;if(btn)btn.disabled=false}
}
export async function renderBuyingManagement(tab,root,rerender){
  if(!root)return;
  root.innerHTML='<div class="hsm-loading">Chargement du référentiel achats sécurisé…</div>';
  try{await loadBuyingManagement()}catch(error){
    root.innerHTML='<div class="hsm-error"><strong>Connexion aux données achats indisponible</strong><p>'+q(error.message)+'</p><button id="hsmRetry" class="hsm-primary">Réessayer</button></div>';
    root.querySelector('#hsmRetry')?.addEventListener('click',async()=>{data.loaded=false;await renderBuyingManagement(tab,root,rerender)});
    return;
  }
  if(!root.isConnected)return;
  root.innerHTML=tab==='suppliers'?supplierList():tab==='contracts'?contractList():tab==='rebates'?rebateView():auditView();
  const refresh=async()=>{await renderBuyingManagement(tab,root,rerender);};
  root.querySelectorAll('[data-hsm-form]').forEach(f=>f.addEventListener('submit',e=>onSubmit(e,root,refresh)));
  root.querySelector('[name="scope"]')?.addEventListener('change',e=>{
    const selector=root.querySelector('[name="entityCode"]');if(selector){selector.value=e.target.value==='GROUP'?'GROUP':'FRANPRIX';}
  });
  root.querySelector('#hsmAddTier')?.addEventListener('click',()=>{
    const host=root.querySelector('#hsmTiers');
    if(host.querySelectorAll('.hsm-tier-row').length>=12)return;
    const row=document.createElement('div');row.className='hsm-tier-row';
    row.innerHTML=field('threshold','Seuil MAD','number','min="0" step="0.01" required')+
      field('rate','Taux %','number','min="0" max="100" step="0.01" required')+
      '<button type="button" class="hsm-tier-remove" aria-label="Supprimer le palier">×</button>';
    host.appendChild(row);row.querySelector('button').onclick=()=>row.remove();
  });
  root.querySelectorAll('[data-hsm-files]').forEach(btn=>btn.addEventListener('click',()=>fileOperations(root,btn.dataset.hsmFiles,refresh)));
  root.querySelectorAll('[data-hsm-approve]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Activer cet accord après vérification des conditions et de la pièce signée ?'))return;
    btn.disabled=true;
    try{await api('/api/buying-group/contracts/'+btn.dataset.hsmApprove+'/activate',{method:'POST',body:{},noRetry:true});
      await loadBuyingManagement({force:true});await refresh();
    }catch(error){alert(error.message)}finally{btn.disabled=false}
  }));
}
