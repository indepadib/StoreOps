import { api, isShowcase } from '../api.js';
import { app, currentStore, isDirector } from '../state.js';

const PLATFORM_URL='https://hs-buying-group-os.vercel.app';
const tabs=[
  {id:'overview',label:'Vue Groupe'},
  {id:'opportunities',label:'Opportunités'},
  {id:'simulation',label:'Simulateur'},
  {id:'contracts',label:'Contrats'},
  {id:'dynamics',label:'Dynamics 365'}
];
const state={
  tab:'overview',
  diagnostics:null,diagnosticsError:null,diagnosticsLoading:false,
  purchaseOrders:null,purchaseOrdersError:null,purchaseOrdersLoading:false,
  purchaseOrdersStore:null,
  inputs:{franprixQty:12000,veneziaQty:3500,franprixPrice:22.5,veneziaPrice:24,groupPrice:21}
};
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const n=value=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(Number(value)||0);
const money=value=>n(value)+' MAD';
const el=()=>document.querySelector('#buyingGroupContent');
const badge=(name,kind='neutral')=>'<span class="bg-badge '+kind+'">'+e(name)+'</span>';
function header(){
  const store=currentStore();
  return '<div class="bg-hero"><div class="bg-hero-glow"></div><div class="bg-overline">H&S · BUYING GROUP OS <span> / </span> PROCUREMENT INTELLIGENCE</div>'+
  '<div class="bg-hero-layout"><div><h2>Un Groupe.<br><em>Une force d’achat.</em></h2><p>Contrats, fournisseurs, synergies et intelligence financière. Le futur système de pilotage de la centrale d’achat H&S.</p>'+
  '<div class="bg-hero-chips">'+badge('Pilote StoreOps','light')+badge('Accès Direction','light')+badge('Lecture seule D365','light')+'</div></div>'+
  '<div class="bg-hero-side"><span>CONTEXTE DE CONNEXION</span><strong>'+e(app.user?.name||'Direction')+'</strong>'+
  '<small>'+e(store?.name||'Magasin non sélectionné')+' · '+e(app.authMode||'—')+'</small><div class="bg-hero-side-line"></div>'+
  '<small>Données Groupe consolidées : non connectées</small></div></div></div>';
}
function overview(){
  return '<div class="bg-section-title"><div><span class="bg-eyebrow">PILOTER</span><h3>La centrale en un regard</h3></div><span class="bg-subnote">Structure prête · indicateurs consolidés à connecter</span></div>'+
  '<div class="bg-kpi-grid">'+
  metric('Fournisseurs Groupe','—','Référentiel à connecter','↗')+
  metric('Contrats actifs','—','Extraction IA à intégrer','◇')+
  metric('Marges arrière','—','Acquis / facturé / encaissé','↗')+
  metric('Économies réalisées','—','À rapprocher des factures','✓')+
  '</div><div class="bg-workspace">'+
  '<div class="bg-panel bg-priority"><span class="bg-eyebrow">LES PROCHAINES DÉCISIONS</span><h3>De la donnée à l’action</h3>'+
  '<button class="bg-action-row" data-bg-tab="contracts"><span class="bg-action-icon">01</span><span><strong>Structurer les accords fournisseurs</strong><small>Contrats Groupe, annexes enseignes, RFA et échéances</small></span><span>↗</span></button>'+
  '<button class="bg-action-row" data-bg-tab="opportunities"><span class="bg-action-icon">02</span><span><strong>Identifier les fournisseurs communs</strong><small>Préparer la mutualisation Franprix / Venezia et les autres enseignes</small></span><span>↗</span></button>'+
  '<button class="bg-action-row" data-bg-tab="dynamics"><span class="bg-action-icon">03</span><span><strong>Qualifier les flux Dynamics existants</strong><small>Tester les diagnostics et PO disponibles dans StoreOps</small></span><span>↗</span></button>'+
  '</div><div class="bg-panel bg-strategy"><span class="bg-eyebrow">ARCHITECTURE</span><h3>Autonome dès sa conception.</h3>'+
  '<p>Nous réutilisons la session et les API StoreOps, mais conservons le futur référentiel contrats et les règles financières dans un domaine métier séparé.</p>'+
  '<div class="bg-progress-step"><i>01</i><span>Connexion et navigation StoreOps</span>'+badge('Pilote','success')+'</div>'+
  '<div class="bg-progress-step"><i>02</i><span>Lecture D365 par entité juridique</span>'+badge('À qualifier')+'</div>'+
  '<div class="bg-progress-step"><i>03</i><span>Base contrats et stockage privé</span>'+badge('À connecter')+'</div>'+
  '<div class="bg-progress-step"><i>04</i><span>Migration vers domaine dédié</span>'+badge('Prévue')+'</div>'+
  '</div></div>';
}
function metric(label,value,detail,mark){
 return '<article class="bg-metric"><div class="bg-metric-top"><span>'+e(label)+'</span><i>'+e(mark)+'</i></div><strong>'+e(value)+'</strong><small>'+e(detail)+'</small></article>';
}
function opportunities(){
 return '<div class="bg-section-title"><div><span class="bg-eyebrow">STRATÉGIE ACHATS</span><h3>Détecter les leviers Groupe</h3></div></div>'+
 '<div class="bg-callout"><span>✳</span><div><strong>Pas de faux chiffres.</strong><p>Le référentiel article, les fournisseurs et les contrats des autres enseignes ne sont pas encore synchronisés. Les opportunités ci-dessous sont des capacités cibles, pas des gains détectés.</p></div></div>'+
 '<div class="bg-cards">'+
 idea('01','Fournisseurs communs','Rapprocher les identités et comptes fournisseurs entre sociétés, en tenant compte des doublons, des enseignes et des entités juridiques.')+
 idea('02','Volumes mutualisables','Consolider article, EAN, unité d’achat, colisage, fréquence et site de livraison avant toute simulation de prix.')+
 idea('03','Écarts contractuels','Comparer les prix nets, RFA, budgets promotionnels, conditions de paiement et de transport à périmètre équivalent.')+
 idea('04','Plan de négociation','Calculer le gain potentiel, identifier les responsables et suivre l’écart entre négocié, obtenu et encaissé.')+
 '</div><div class="bg-end-action"><div><strong>Tester une négociation Groupe</strong><small>Simulation locale, sans sauvegarde ni écriture D365.</small></div><button class="bg-btn bg-btn-primary" data-bg-tab="simulation">Ouvrir le simulateur →</button></div>';
}
function idea(index,title,copy){
 return '<article class="bg-idea"><span class="bg-idea-index">'+index+'</span><h4>'+e(title)+'</h4><p>'+e(copy)+'</p></article>';
}
function simulateValues(){
 const i=state.inputs;
 const current=i.franprixQty*i.franprixPrice+i.veneziaQty*i.veneziaPrice;
 const target=(i.franprixQty+i.veneziaQty)*i.groupPrice;
 const saving=current-target;
 return {current,target,saving,pct:current?100*saving/current:0,qty:i.franprixQty+i.veneziaQty};
}
function field(key,label,step='1'){
 return '<label class="bg-field"><span>'+e(label)+'</span><input data-bg-input="'+e(key)+'" type="number" inputmode="decimal" min="0" step="'+step+'" value="'+e(state.inputs[key])+'"></label>';
}
function simulation(){
 return '<div class="bg-section-title"><div><span class="bg-eyebrow">SIMULATEUR DE NÉGOCIATION</span><h3>La force du volume, chiffrée.</h3></div>'+badge('Exemple fictif Lesieur','warning')+'</div>'+
 '<div class="bg-sim-grid"><section class="bg-panel"><span class="bg-eyebrow">HYPOTHÈSES</span><h4 class="bg-subtitle">Volumes et prix unitaires</h4><div class="bg-field-grid">'+
 field('franprixQty','Franprix · Quantité')+field('franprixPrice','Franprix · Prix actuel MAD','0.01')+
 field('veneziaQty','Venezia · Quantité')+field('veneziaPrice','Venezia · Prix actuel MAD','0.01')+
 '</div><div class="bg-negotiated">'+field('groupPrice','Prix Groupe proposé · MAD','0.01')+'</div>'+
 '<p class="bg-hint">Calcul indicatif, unités supposées comparables, hors taxes et remises arrière, transport, frais de centrale et impacts logistiques. Aucun résultat n’est sauvegardé.</p></section>'+
 '<section class="bg-result"><span class="bg-eyebrow">POTENTIEL DE NÉGOCIATION</span><div class="bg-result-label">Économie brute simulée</div><strong id="bgSaving">—</strong><div class="bg-result-sub" id="bgSavingPct">—</div>'+
 '<div class="bg-result-row"><span>Volume consolidé</span><strong id="bgQty">—</strong></div><div class="bg-result-row"><span>Coût de référence</span><strong id="bgCurrent">—</strong></div>'+
 '<div class="bg-result-row"><span>Coût au prix Groupe</span><strong id="bgTarget">—</strong></div><div class="bg-result-disclaimer">Une simulation n’est pas une économie réalisée.</div></section></div>';
}
function refreshSimulation(){
 const v=simulateValues(),save=document.querySelector('#bgSaving');if(!save)return;
 save.textContent=money(v.saving);save.classList.toggle('bg-negative',v.saving<0);
 document.querySelector('#bgSavingPct').textContent=(v.pct>=0?'+':'')+n(v.pct)+' % vs référence';
 document.querySelector('#bgQty').textContent=n(v.qty)+' unités';
 document.querySelector('#bgCurrent').textContent=money(v.current);
 document.querySelector('#bgTarget').textContent=money(v.target);
}
function contracts(){
 return '<div class="bg-section-title"><div><span class="bg-eyebrow">CONTRACT INTELLIGENCE</span><h3>Du PDF au contrat pilotable.</h3></div></div>'+
 '<div class="bg-contract-layout"><div class="bg-panel bg-contract-hero"><span class="bg-contract-symbol">✳</span><h3>Chaque clause doit devenir une règle contrôlée.</h3>'+
 '<p>Le moteur cible saura lire un contrat Word ou PDF, proposer les taux, seuils, assiettes, exclusions et échéances, puis demander une validation avant tout calcul financier.</p>'+
 '<a class="bg-btn bg-btn-primary" href="'+PLATFORM_URL+'" rel="noopener noreferrer" target="_blank">Ouvrir la maquette contrats ↗</a>'+
 '<small>Maquette externe, sans intégration à la session StoreOps. Ne pas déposer de contrat confidentiel.</small></div>'+
 '<div class="bg-panel"><span class="bg-eyebrow">CHAÎNE DOCUMENTAIRE CIBLE</span>'+
 ['Déposer le document dans un stockage privé','Extraire les valeurs et preuves par page','Rattacher à un fournisseur Groupe et à une entité','Vérifier et approuver les clauses financières','Versionner les avenants, échéances et approbations'].map((x,i)=>'<div class="bg-checkline"><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+e(x)+'</strong></div>').join('')+
 '<p class="bg-hint">Le stockage et l’IA contractuelle ne sont pas encore reliés à ce module StoreOps.</p></div></div>';
}
function dynamics(){
 const d=state.diagnostics,po=state.purchaseOrders,store=currentStore();
 const summary=d?(d.connected?'Connexion D365 : connecteur répond':'Connexion non confirmée'):(state.diagnosticsError?'Diagnostic indisponible':'Diagnostic non exécuté');
 const suppliers=Array.isArray(po)?[...new Set(po.map(r=>String(r.source_vendor_account||r.vendor||r.source_origin||'').trim()).filter(Boolean))]:[];
 const rows=Array.isArray(po)?po.slice(0,15):[];
 return '<div class="bg-section-title"><div><span class="bg-eyebrow">STOREOPS · LIVE ADAPTER</span><h3>Qualifions la source D365.</h3></div>'+badge('Accès en lecture seule','success')+'</div>'+
 '<div class="bg-connect-grid"><section class="bg-panel"><span class="bg-eyebrow">DIAGNOSTIC DU CONNECTEUR</span><h4 class="bg-subtitle">'+e(summary)+'</h4>'+
 '<p class="bg-hint">Périmètre du tenant Franprix et droits de la session actuelle, pas une consolidation multi-sociétés.</p>'+
 (d?'<div class="bg-detail"><span>Mode</span><strong>'+e(d.mode||'—')+'</strong></div><div class="bg-detail"><span>Connecté</span><strong>'+(d.connected?'Oui':'Non / à vérifier')+'</strong></div>':'')+
 (state.diagnosticsError?'<p class="bg-inline-error">'+e(state.diagnosticsError)+'</p>':'')+
 '<button class="bg-btn bg-btn-primary" data-bg-diagnostic '+(state.diagnosticsLoading?'disabled':'')+'>'+(state.diagnosticsLoading?'Vérification…':'Tester la connexion')+'</button></section>'+
 '<section class="bg-panel"><span class="bg-eyebrow">RÉCEPTIONS PO DANS STOREOPS</span><h4 class="bg-subtitle">'+e(store?.name||'Magasin non sélectionné')+'</h4>'+
 '<p class="bg-hint">Lecture du cache des réceptions PO du magasin sélectionné ; ce n’est ni la dépense Groupe, ni un registre complet de commandes.</p>'+
 (po?'<div class="bg-micro-kpis"><span><strong>'+n(po.length)+'</strong> PO récupérés</span><span><strong>'+n(suppliers.length)+'</strong> fournisseurs identifiés</span></div>':'')+
 (state.purchaseOrdersError?'<p class="bg-inline-error">'+e(state.purchaseOrdersError)+'</p>':'')+
 '<button class="bg-btn bg-btn-outline" data-bg-po '+(state.purchaseOrdersLoading?'disabled':'')+'>'+(state.purchaseOrdersLoading?'Chargement…':'Lire les PO disponibles')+'</button></section></div>'+
 (rows.length?'<div class="bg-panel bg-po-list"><div class="bg-section-title"><div><span class="bg-eyebrow">RÉCEPTION PO · MAGASIN UNIQUEMENT</span><h3>Derniers documents retournés</h3></div></div><div class="bg-table">'+rows.map(r=>'<div class="bg-po-row"><span>'+e(r.vendor||r.source_origin||'Fournisseur non identifié')+'<small>'+e(r.source_vendor_account||'Compte non renseigné')+'</small></span><strong>'+e(r.reference||r.document_number||r.id||'—')+'</strong></div>').join('')+'</div></div>':'')+
 '<p class="bg-hint">Un écran métier dédié utilisera ensuite un adaptateur serveur D365, des entités juridiques autorisées et un rapprochement des données. Aucune mutation ERP n’est effectuée ici.</p>';
}
function renderActive(){
 const active=tabs.find(t=>t.id===state.tab)?.id||'overview';
 if(active==='overview')return overview();
 if(active==='opportunities')return opportunities();
 if(active==='simulation')return simulation();
 if(active==='contracts')return contracts();
 return dynamics();
}
function bind(root){
 root.querySelectorAll('[data-bg-tab]').forEach(b=>b.addEventListener('click',()=>{
   const next=b.dataset.bgTab;if(!tabs.some(t=>t.id===next))return;
   state.tab=next;renderBuyingGroup();
 }));
 root.querySelectorAll('[data-bg-input]').forEach(input=>input.addEventListener('input',()=>{
   const value=Number(input.value);
   state.inputs[input.dataset.bgInput]=Number.isFinite(value)&&value>=0?value:0;refreshSimulation();
 }));
 root.querySelector('[data-bg-diagnostic]')?.addEventListener('click',async()=>{
   state.diagnosticsLoading=true;state.diagnosticsError=null;renderBuyingGroup();
   try{state.diagnostics=await api('/api/dynamics/diagnostics')}
   catch(error){state.diagnostics=null;state.diagnosticsError=error?.message||'Diagnostic non disponible'}
   finally{state.diagnosticsLoading=false;renderBuyingGroup()}
 });
 root.querySelector('[data-bg-po]')?.addEventListener('click',async()=>{
   if(!app.storeId){state.purchaseOrdersError='Sélectionne un magasin';renderBuyingGroup();return}
   state.purchaseOrdersLoading=true;state.purchaseOrdersError=null;renderBuyingGroup();
   try{const result=await api('/api/stores/'+encodeURIComponent(app.storeId)+'/receipts/po');
     if(!Array.isArray(result))throw new Error('Le connecteur n’a pas renvoyé la liste attendue');
     state.purchaseOrders=result;state.purchaseOrdersStore=app.storeId}
   catch(error){state.purchaseOrders=null;state.purchaseOrdersError=error?.message||'PO indisponibles'}
   finally{state.purchaseOrdersLoading=false;renderBuyingGroup()}
 });
 refreshSimulation();
}
export function renderBuyingGroup(){
 const root=el();if(!root)return;
 if(!isDirector()){root.innerHTML='<div class="bg-access">Accès réservé à la direction.</div>';return}
 if(state.purchaseOrdersStore&&state.purchaseOrdersStore!==app.storeId){state.purchaseOrders=null;state.purchaseOrdersStore=null}
 root.innerHTML='<div class="bg-app">'+header()+
   '<div class="bg-toolbar"><div class="bg-tabs" role="navigation" aria-label="Espaces Centrale d’achat">'+tabs.map(t=>'<button data-bg-tab="'+t.id+'" class="'+(t.id===state.tab?'active':'')+'" '+(t.id===state.tab?'aria-current="page"':'')+'>'+e(t.label)+'</button>').join('')+'</div>'+
   '<span class="bg-environment">PILOTE · 0 DONNÉE FINANCIÈRE CRÉÉE</span></div>'+
   '<div class="bg-content">'+renderActive()+'</div></div>';
 bind(root);
}
