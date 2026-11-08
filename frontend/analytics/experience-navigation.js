/**
 * Retail Intelligence Experience Layer v1
 * Navigation, progressive disclosure and keyboard search — no data mutation,
 * no fetch, no change to store permissions, KPI formulas, or existing widgets.
 */
const el=id=>document.getElementById(id);
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
 {id:'detention',label:'Détention',description:'Comparer la présence des articles entre magasins et entrepôts.',search:'detention référencement magasin entrepot'},
 {id:'reference',label:'Référentiel articles',description:'Retrouver les caractéristiques et hiérarchies des produits.',search:'referentiel article fiche produit'},
 {id:'cashiers',label:'Caissiers',description:'Lire les performances et pratiques d’identification en caisse.',search:'caisse collaborateurs staff tickets'},
];
const byId=Object.fromEntries(sections.map(s=>[s.id,s]));
const navGroups=[
 ['PILOTAGE',['overview','sales','network']],
 ['COMMERCE',['categories','suppliers','promotions']],
 ['RELATION CLIENT',['crm','loyalty','cashiers']],
 ['EXÉCUTION & DONNÉES',['inventory','detention','reference']]
];
const intents={
 overview:[['Comprendre les variations','Pourquoi le CA évolue-t-il ? Distingue le trafic et le panier moyen.'],['Analyser les clients','crm'],['Contrôler le réseau','network']],
 sales:[['Identifier les moteurs du CA','Quels sont les trois facteurs principaux de variation du CA ?'],['Explorer les catégories','categories'],['Voir les clients','crm']],
 crm:[['Comprendre les non-retours','Pourquoi certains clients ne reviennent-ils plus ? Compare fréquence, paniers et produits abandonnés.'],['Voir les paniers avant/après','journey'],['Analyser la fidélité','loyalty']],
 network:[['Magasins en recul','Quels magasins expliquent le recul et pourquoi ?'],['Comparer les ventes','sales'],['Voir les stocks','inventory']],
 categories:[['Articles qui pèsent sur le CA','Quelles références expliquent les principales baisses de ventes ?'],['Voir les promotions','promotions'],['Analyser les clients','crm']],
 promotions:[['Effet des remises','Que nous apprennent les promotions sur le CA et les clients identifiés ?'],['Voir les clients','crm'],['Voir les produits','categories']],
 loyalty:[['Recrutement & valeur','Combien de clients ont été recrutés et quel est leur impact ?'],['Parcours clients','crm'],['Voir les ventes','sales']],
 inventory:[['Comprendre les ruptures','Quels articles sont à risque de rupture et quelles actions prioriser ?'],['Détention magasin','detention'],['Impact sur les ventes','sales']]
};
const fallbackActions=[['Voir les ventes','sales'],['Comprendre les clients','crm'],['Interroger le compagnon','Comment évolue cette activité et que vérifier ?']];
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
function setMode(mode,{remember=true}={}){
 if(!modes.some(m=>m.id===mode))return;
 currentMode=mode;document.body.dataset.riMode=mode;
 for(const btn of document.querySelectorAll('[data-ri-mode-choice]')){
  const selected=btn.dataset.riModeChoice===mode;
  btn.classList.toggle('is-active',selected);btn.setAttribute('aria-pressed',String(selected))
 }
 const copy=el('riExperienceModeHelp');if(copy)copy.textContent=modes.find(m=>m.id===mode).description;
 if(remember)writePreference(mode);
}
function selectedSection(){return window.RETAIL_INTELLIGENCE?.getState?.()?.section||document.body.dataset.analyticsSection||'overview'}
function updateHeading(){
 const section=byId[selectedSection()]||byId.overview;
 if(el('riExperienceSection'))el('riExperienceSection').textContent=section.label;
 if(el('riExperienceSubtitle'))el('riExperienceSubtitle').textContent=section.description;
 const actions=el('riExperienceActions');if(!actions)return;
 actions.replaceChildren();
 for(const [label,command] of (intents[section.id]||fallbackActions)){
  const b=node('button','ri-intent-chip',label);b.type='button';b.dataset.riAction=command;actions.append(b)
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
 if(command==='journey'){
  setMode('explore');
  const target=el('customerResearch');
  if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return}
  getClient()?.navigate?.('crm');return
 }
 if(byId[command]){getClient()?.navigate?.(command);return}
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
  ...sections.map(s=>({title:s.label,description:s.description,terms:s.search,action:s.id,kind:'section'})),
  ...extras.map(x=>({title:x.label,description:x.description,terms:x.label,action:x.question,kind:'question'}))
 ];
 function renderFinder(value=''){
  const q=norm(value);
  const rows=entries.map(x=>{
   const name=norm(x.title),d=norm(x.description),search=norm(x.terms||'');
   return{...x,score:!q?1:name===q?10:name.startsWith(q)?8:name.includes(q)?6:search.includes(q)?4:d.includes(q)?2:0}
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  results.replaceChildren();
  for(const item of rows.slice(0,12)){
   const button=node('button','ri-finder-item');button.type='button';
   button.dataset.riFinderAction=item.action;
   const symbol=node('span','ri-finder-icon',item.kind==='section'?'◈':'✦');
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
  if(event.key==='Enter'){
   const first=results.querySelector('button[data-ri-finder-action]');
   if(first){event.preventDefault();first.click()}
  }
 });
 results.addEventListener('click',event=>{
  const target=event.target.closest('[data-ri-finder-action]');if(!target)return;
  dialog.close();act(target.dataset.riFinderAction)
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{if(priorFocus?.isConnected)priorFocus.focus();priorFocus=null});
 document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();if(dialog.open)dialog.close();else showFinder();
  }
 });
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
 defineFinder();setupFilters();updateHeading();
 document.addEventListener('retail-intelligence:section',updateHeading);
}
connect();
