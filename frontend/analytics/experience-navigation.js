/**
 * Retail Intelligence Experience Layer v1
 * Navigation, progressive disclosure and keyboard search — no data mutation,
 * no fetch, no change to store permissions, KPI formulas, or existing widgets.
 */
import {dataDestinations,rankDestinations} from './data-destinations.js';
const el=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n};
const sections=[
 {id:'overview',label:'Vue exécutive',description:'Les résultats essentiels et les décisions à prendre.',search:'accueil synthese direction performance prioritaires'},
 {id:'sales',label:'Ventes',description:'Comprendre les variations du chiffre d’affaires, des tickets et des paniers.',search:'ca chiffre affaires panier horaire ventes marges évolution'},
 {id:'network',label:'Réseau & magasins',description:'Comparer les magasins et identifier les écarts à investiguer.',search:'magasin benchmark val fleuri trefle réseau'},
 {id:'categories',label:'Produits & catégories',description:'Repérer les articles et univers qui expliquent les résultats.',search:'produit article sku rayon famille departement mix categorie'},
 {id:'suppliers',label:'Fournisseurs',description:'Relier performances commerciales, achats et fournisseurs.',search:'approvisionnement achats fournisseurs'},
 {id:'crm',label:'Clients & CRM',description:'Suivre les clients, les habitudes d’achat et les paniers avant/après.',search:'client cohortes acquisition retention non retour dormant fidelisation panier'},
 {id:'loyalty',label:'Fidélité',description:'Suivre l’identification, le recrutement et la valeur des clients.',search:'carte programme fidélité recrutement fidelise'},
 {id:'promotions',label:'Promotions',description:'Comprendre remises, effets sur les ventes et dépendance promotionnelle.',search:'promotions offres discount remises prix'},
 {id:'inventory',label:'Stock',description:'Contrôler disponibilité, immobilisation et risques opérationnels.',search:'stock rupture inventaire couverture'},
 {id:'replenishment',label:'Réapprovisionnement',description:'Calculer une proposition de commande fournisseur ou de transfert entrepôt.',search:'commande fournisseur transfert entrepot stock po to'},
 {id:'detention',label:'Détention',description:'Comparer la présence des articles entre magasins et entrepôts.',search:'detention référencement magasin entrepot'},
 {id:'reference',label:'Référentiel articles',description:'Retrouver les caractéristiques et hiérarchies des produits.',search:'referentiel article fiche produit'},
 {id:'cashiers',label:'Caissiers',description:'Lire les performances et pratiques d’identification en caisse.',search:'caisse collaborateurs staff tickets'},
];
const byId=Object.fromEntries(sections.map(s=>[s.id,s]));
const navGroups=[
 ['PILOTAGE',['overview','sales','network']],
 ['COMMERCE',['categories','suppliers','promotions']],
 ['RELATION CLIENT',['crm','loyalty','cashiers']],
 ['EXÉCUTION & DONNÉES',['inventory','detention','replenishment','reference']]
];
const pageActions={
 overview:[['Comparer les magasins','store-comparison'],['Comprendre la variation du CA','turnover']],
 sales:[['Voir le CA et le panier moyen','turnover'],['Voir les articles qui expliquent les ventes','category']],
 network:[['Voir les écarts entre magasins','store-comparison'],['Vérifier les ruptures','availability']],
 categories:[['Comparer les produits et les rayons','category'],['Consulter la fiche article','catalog']],
 suppliers:[['Voir le taux de service','service'],['Préparer une commande','purchase']],
 crm:[['Voir qui ne revient plus','retention'],['Voir les tickets identifiés','identification']],
 loyalty:[['Voir les tickets identifiés','identification'],['Comparer les paniers clients','retention']],
 promotions:[['Voir les ventes et remises','promotion'],['Vérifier le prix applicable','price']],
 inventory:[['Voir les ruptures et anomalies','availability'],['Préparer un transfert','purchase']],
 replenishment:[['Préparer une commande ou un transfert','purchase'],['Vérifier les articles déjà reçus','historical-range']],
 detention:[['Voir les articles déjà reçus','historical-range'],['Préparer un transfert','purchase']],
 reference:[['Chercher un code ou une fiche article','catalog'],['Voir les prix applicables','price']],
 cashiers:[['Voir les résultats par caissier','cashier-results'],['Voir les tickets identifiés','identification']]
};
const modes=[
 {id:'focus',label:"L’essentiel",description:'Les messages et indicateurs prioritaires, sans tableaux secondaires.'},
 {id:'explore',label:'Explorer',description:'Analyses, comparaisons et enquêtes détaillées.'},
 {id:'full',label:'Toutes les données',description:'Tous les tableaux, diagnostics et indicateurs disponibles.'}
];
const storage='retail-intelligence:experience-mode:v1';
let currentMode='focus',priorFocus=null;
function groupSidebar(){
 const nav=document.querySelector('.side-nav');if(!nav||nav.dataset.riOrganized)return;
 // Only moves existing buttons; existing per-button handlers remain attached.
 for(const [label,ids] of navGroups){
  const group=node('div','ri-nav-group'),header=node('div','ri-nav-label',label);
  group.append(header);
  for(const id of ids){const button=nav.querySelector('button[data-section="'+id+'"]');if(button)group.append(button)}
  nav.append(group)
 }
 nav.dataset.riOrganized='true'
}
function readPreference(){
 try{const v=localStorage.getItem(storage);return modes.some(m=>m.id===v)?v:'focus'}catch{return'focus'}
}
function writePreference(value){try{localStorage.setItem(storage,value)}catch{}}
function syncLensIndicator(){
 const track=el('riExperienceLens'),active=track?.querySelector('[data-ri-mode-choice][aria-pressed="true"]');
 if(!active)return;
 // A single physical surface moves under the active label, rather than
 // crossfading three separate cards. Transform-only animation is cheap.
 track.style.setProperty('--ri-lens-x',(active.offsetLeft-4)+'px');
 track.style.setProperty('--ri-lens-width',active.offsetWidth+'px');
}
function setMode(mode,{remember=true}={}){
 if(!modes.some(m=>m.id===mode))return;
 currentMode=mode;document.body.dataset.riMode=mode;
 for(const btn of document.querySelectorAll('[data-ri-mode-choice]')){
  const selected=btn.dataset.riModeChoice===mode;
  btn.classList.toggle('is-active',selected);btn.setAttribute('aria-pressed',String(selected))
 }
 const copy=el('riExperienceModeHelp');if(copy)copy.textContent=modes.find(m=>m.id===mode).description;
 syncLensIndicator();
 if(remember)writePreference(mode);
}
function selectedSection(){return window.RETAIL_INTELLIGENCE?.getState?.()?.section||document.body.dataset.analyticsSection||'overview'}
function updateHeading(){
 const section=byId[selectedSection()]||byId.overview;
 if(el('riExperienceSection'))el('riExperienceSection').textContent=section.label;
 if(el('riExperienceSubtitle'))el('riExperienceSubtitle').textContent=section.description;
 const actions=el('riExperienceActions');if(!actions)return;
 actions.replaceChildren();
 for(const [label,command] of pageActions[section.id]){
  const b=node('button',actions.childElementCount?'ri-intent-chip':'ri-intent-chip ri-intent-primary',label);b.type='button';b.dataset.riAction=command;actions.append(b)
 }
 const active=el('riExperienceLens');
 if(active)active.setAttribute('aria-label','Niveau de lecture — '+section.label);
}
function getClient(){
 return window.RETAIL_INTELLIGENCE||null
}
function openAssistant(question){
 const trigger=el('analyticsAssistantToggle'),panel=el('analyticsAssistant');
 if(!trigger||!panel)return false;
 if(panel.hidden)trigger.click();
 const input=el('analyticsAssistantQuestion');
 if(input){input.value=question;input.focus()}
 return true
}
function act(command){
 const destination=dataDestinations.find(item=>item.id===(command==='journey'?'retention':command));
 if(destination){
  if(selectedSection()!==destination.section)getClient()?.navigate?.(destination.section);
  requestAnimationFrame(()=>{
   const target=el(destination.target);
   if(!target)return;
   if(!target.getClientRects().length&&!target.closest('[hidden]'))setMode('full',{remember:false});
   if(!target.getClientRects().length)return;
   if(target.tabIndex<0&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true});
   target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  return
 }
 if(byId[command]){getClient()?.navigate?.(command,{scroll:true});return}
 openAssistant(command)
}
function defineFinder(){
 const dialog=el('riFinderDialog'),field=el('riFinderInput'),results=el('riFinderResults'),trigger=el('riFinderTrigger');
 if(!dialog||!field||!results||!trigger)return;
 const extras=[
  {label:'Comparer les ventes et le panier',description:'Question au compagnon',question:'Compare CA, tickets, panier et principales contributions par magasin.'},
  {label:'Comprendre les non-retours clients',description:'Question au compagnon',question:'Compare les clients identifiés et leurs paniers avant/après. Quels produits ont-ils abandonnés ?'},
  {label:'Diagnostiquer les ruptures',description:'Question au compagnon',question:'Quels articles peuvent être en rupture et quels contrôles de disponibilité effectuer ?'}
 ];
 const entries=[
  ...dataDestinations.map(x=>({...x,action:x.id,kind:'data'})),
  ...sections.map(s=>({title:s.label,description:s.description,terms:s.search,action:s.id,kind:'section'})),
  ...extras.map(x=>({title:x.label,description:x.description,terms:x.label,action:x.question,kind:'question'}))
 ];
 function renderFinder(value=''){
  const rows=value.trim()?rankDestinations(entries,value):entries.filter(item=>item.kind==='section');
  results.replaceChildren();
  for(const item of rows.slice(0,13)){
   const button=node('button','ri-finder-item');button.type='button';
   button.dataset.riFinderAction=item.action;
   const symbol=node('span','ri-finder-icon',item.kind==='question'?'✦':'◈');
   const stack=node('span','ri-finder-copy');stack.append(node('strong',null,item.title),node('small',null,item.description));
   button.append(symbol,stack);results.append(button)
  }
  if(!rows.length)results.append(node('p','ri-finder-empty','Aucun résultat. Essaie « clients », « prix », « panier » ou « fidélité ».'))
 }
 function showFinder(){
  priorFocus=document.activeElement;renderFinder('');
  field.value='';
  if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
  field.focus();
 }
 trigger.addEventListener('click',showFinder);
 field.addEventListener('input',()=>renderFinder(field.value));
 field.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();return}
  if(event.key==='Enter'){
   const first=results.querySelector('button[data-ri-finder-action]');
   if(first){event.preventDefault();first.click()}
  }
 });
 results.addEventListener('keydown',event=>{
  const buttons=[...results.querySelectorAll('button[data-ri-finder-action]')];
  const current=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?buttons.length-1:
    (current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
   buttons[target]?.focus()
  }
 });
 results.addEventListener('click',event=>{
  const target=event.target.closest('[data-ri-finder-action]');if(!target)return;
  const command=target.dataset.riFinderAction;
  if(dataDestinations.some(item=>item.id===command))priorFocus=null;
  dialog.close();act(command)
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null});
 document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();if(dialog.open)dialog.close();else showFinder();
  }
 });
}
function setupTools(){
 const details=el('riTools'),menu=el('riToolsMenu'),bar=document.querySelector('.topbar-actions');
 if(!details||!menu||!bar)return;
 const buttons=['customizeBtn','fullExportBtn','exportBtn'].map(el);
 if(buttons.some(x=>!x))return;
 const media=window.matchMedia('(max-width: 780px)');
 // Moving the original buttons preserves their event handlers, permissions
 // and disabled state. No duplicate export implementation is introduced.
 function layout(){
  if(media.matches){
   for(const button of buttons)menu.append(button);
   details.hidden=false
  }else{
   details.open=false;
   for(const button of buttons)bar.insertBefore(button,details);
   details.hidden=true
  }
 }
 menu.addEventListener('click',event=>{if(event.target.closest('button'))details.open=false});
 document.addEventListener('pointerdown',event=>{
  if(details.open&&!details.contains(event.target))details.open=false
 });
 media.addEventListener?.('change',layout);layout()
}
function setupFilters(){
 const toggle=el('riFilterMore'),filters=el('filterbar');
 if(!toggle||!filters)return;
 // Fields remain mounted, retaining validation and selected dates for exports.
 let expanded=false;
 function sync(){
  filters.dataset.riFilters=expanded?'expanded':'compact';
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.textContent=expanded?'Masquer les options':'Dates et comparaison';
 }
 toggle.addEventListener('click',()=>{expanded=!expanded;sync()});
 sync();
}
function connect(){
 groupSidebar();setMode(readPreference(),{remember:false});
 for(const choice of document.querySelectorAll('[data-ri-mode-choice]')){
  choice.addEventListener('click',()=>setMode(choice.dataset.riModeChoice))
 }
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-ri-action]');if(b)act(b.dataset.riAction)
 });
 setupTools();defineFinder();setupFilters();updateHeading();
 window.addEventListener('resize',syncLensIndicator,{passive:true});
 document.addEventListener('retail-intelligence:section',updateHeading);
}
connect();
