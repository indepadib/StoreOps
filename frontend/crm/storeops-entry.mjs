import {app} from '/js/state.js';
import {api,health,isShowcase} from '/js/api.js';
import {ensureAccessToken,ensureLocalSession,logout} from '/js/auth.js';
import {checkPilotAccess,validateObservationResponse} from './pilot-session.mjs';
const gate=document.getElementById('crmPilotGate'),title=document.getElementById('crmPilotTitle'),detail=document.getElementById('crmPilotDetail'),login=document.getElementById('crmPilotLogin');
const states={SESSION_CHANGED:['Session modifiée','Votre compte professionnel a changé. Rechargez la page pour vérifier les droits du nouveau compte.'],LOGIN_REQUIRED:['Connectez-vous à StoreOps','Utilisez votre compte professionnel habituel pour accéder au pilote CRM.'],DENIED:['Accès réservé','Ce pilote est réservé aux profils de direction d’exploitation et administrateurs de plateforme explicitement habilités.'],UNAVAILABLE:['Session indisponible','Impossible de vérifier votre session professionnelle. Aucun accès automatique en mode démo.']};
function setGate(status){
 if(status!=='AUTHORIZED')clearLiveObservation();
 document.documentElement.classList.toggle('crm-pilot-open',status==='AUTHORIZED');
 gate.hidden=status==='AUTHORIZED';
 if(status!=='AUTHORIZED'){const [a,b]=states[status]||states.UNAVAILABLE;title.textContent=a;detail.textContent=b;login.hidden=status==='DENIED'}
}
async function check(){
 if(isShowcase())return {status:'UNAVAILABLE'};
 // API is same-origin only for this pilot. Refuse unexpected deployment config.
 try{if(new URL(window.STOREOPS_CONFIG.apiBase,location.origin).origin!==location.origin)return {status:'UNAVAILABLE'}}catch{return {status:'UNAVAILABLE'}}
 let principal;
 const result=await checkPilotAccess({health,ensureAccessToken,ensureLocalSession,readSession:async()=>{const session=await api('/api/session',{cache:'no-store',noRetry:true});principal=session?.user?.id;return session},setMode:mode=>{app.authMode=mode}});
 return result.status==='AUTHORIZED'?{...result,principal,mode:app.authMode}:result;
}
export async function openCrmPilot(){
 login.onclick=()=>{sessionStorage.setItem('storeops_return_path','/crm/');location.assign('/')};
 document.getElementById('crmPilotRetry').onclick=()=>location.reload();
 const r=await check();setGate(r.status);
 if(r.status!=='AUTHORIZED')return false;
 setupCustomerDirectory();
 setupNavigation();
 setupLiveObservation();
 let busy=false,closed=false,timer;
 const close=status=>{closed=true;clearInterval(timer);setGate(status);for(const d of document.querySelectorAll('dialog[open]'))d.close()};
 document.getElementById('crmPilotLogout').onclick=()=>{close('LOGIN_REQUIRED');logout()};
 const recheck=async()=>{if(busy||closed)return;busy=true;try{const next=await check();if(closed)return;if(next.status!=='AUTHORIZED')close(next.status);else if(next.principal!==r.principal||next.mode!==r.mode)close('SESSION_CHANGED')}catch{close('UNAVAILABLE')}finally{busy=false}};
 timer=setInterval(recheck,60000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearLiveObservation();else recheck()});
 window.addEventListener('pagehide',()=>close('UNAVAILABLE'),{once:true});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
 return true;
}

const el=id=>document.getElementById(id);
const liveStatus=()=>el('crmLiveStatus');
const money=n=>new Intl.NumberFormat('fr-MA',{style:'currency',currency:'MAD',maximumFractionDigits:2}).format(n);
const fmt=n=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:3}).format(n);
let generation=0,ticketGeneration=0,loyaltyGeneration=0,insightGeneration=0,customerPage=1,summary=null,currentPage=1;
function metric(container,label,value){const d=document.createElement('div'),b=document.createElement('strong');if(container.id==='crmLiveMetrics')d.className='metric';d.append(document.createTextNode(label));b.textContent=String(value);d.append(b);container.append(d)}
function clearDetails(){
 if(el('orbitCount'))el('orbitCount').textContent='—';if(el('crmScopeDate'))el('crmScopeDate').textContent='—';if(el('crmScopeLabel'))el('crmScopeLabel').textContent='Franprix';
 ticketGeneration++;loyaltyGeneration++;insightGeneration++;summary=null;currentPage=1;customerPage=1;
 for(const id of ['crmCustomersRows','crmAssociationsRows'])el(id)?.replaceChildren();for(const id of ['crmCustomersRead','crmAssociationsRead'])if(el(id))el(id).disabled=true;if(el('crmCustomersPager'))el('crmCustomersPager').hidden=true;for(const id of ['crmCustomersStatus','crmAssociationsStatus'])if(el(id))el(id).textContent='Chargez une journée réelle.';
 el('crmTicketRows')?.replaceChildren();el('crmLoyaltyMetrics')?.replaceChildren();
 if(el('crmTicketPager'))el('crmTicketPager').hidden=true;
 if(el('crmTicketStatus'))el('crmTicketStatus').textContent='Aucun ticket affiché. Chargez une journée.';
 if(el('crmLoyaltyStatus'))el('crmLoyaltyStatus').textContent='Sélectionnez le magasin et la date.';
 if(el('crmLoyaltyRead'))el('crmLoyaltyRead').disabled=true;
}
function clearLiveObservation(){clearDirectory();generation++;el('crmLiveMetrics')?.replaceChildren();el('crmLiveStore')?.replaceChildren();if(el('crmLiveRead'))el('crmLiveRead').disabled=true;clearDetails();if(liveStatus())liveStatus().textContent='Session à vérifier. Actualisez les magasins.'}
function validateTicketPage(x,{storeId,date,page,checkedAt,tickets}){
 if(x?.status!=='READY'||x.storeId!==storeId||x.date!==date||x.page!==page||x.pageSize!==20||x.totalTickets!==tickets||x.checkedAt!==checkedAt||x.source!=='D365/RetailTransactionSalesTransBIEntities'||x.basis!=='POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS'||x.financialReconciliation!=='NOT_VERIFIED'||x.currency!=='MAD'||x.activationEnabled!==false||!Array.isArray(x.rows)||x.rows.length!==Math.min(20,tickets-(page-1)*20))return false;
 const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=160;
 return x.rows.every((r,i)=>r.ordinal===(page-1)*20+i+1&&numeric(r.positiveTtc)&&Array.isArray(r.items)&&r.items.length>0&&r.items.length<=500&&r.items.every(z=>str(z.productNumber)&&(z.productName===null||str(z.productName))&&(z.unit===null||str(z.unit))&&(z.quantity===null||numeric(z.quantity)&&z.quantity>0)&&numeric(z.positiveTtc)&&(z.observedDiscount===null||numeric(z.observedDiscount)))&&Math.abs(r.items.reduce((n,z)=>n+z.positiveTtc,0)-r.positiveTtc)<=0.006*r.items.length+0.011);
}
function renderTickets(rows){
 const out=el('crmTicketRows');out.replaceChildren();
 for(const r of rows){const d=document.createElement('details'),s=document.createElement('summary'),l=document.createElement('span'),v=document.createElement('span');l.textContent='Panier '+r.ordinal+' · '+r.items.length+' référence(s)/unité(s)';v.textContent=money(r.positiveTtc);s.append(l,v);d.append(s);
  const wrap=document.createElement('div'),table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr'),body=document.createElement('tbody');wrap.className='ticket-items';for(const label of ['Article','Quantité','TTC positif','Remise observée']){const th=document.createElement('th');th.textContent=label;hr.append(th)}head.append(hr);table.append(head,body);
  for(const x of r.items){const tr=document.createElement('tr'),product=document.createElement('td');product.textContent=x.productName||x.productNumber;if(x.productName){const code=document.createElement('small');code.textContent=x.productNumber;product.append(code)}tr.append(product);for(const val of [x.quantity===null?'Non disponible':fmt(x.quantity)+(x.unit?' '+x.unit:''),money(x.positiveTtc),x.observedDiscount===null?'Non disponible':money(x.observedDiscount)]){const td=document.createElement('td');td.textContent=val;tr.append(td)}body.append(tr)}wrap.append(table);d.append(wrap);out.append(d)
 }
}
function setupLiveObservation(){
 const store=el('crmLiveStore'),date=el('crmLiveDate'),run=el('crmLiveRead'),load=el('crmLiveLoad'),metrics=el('crmLiveMetrics'),loyalty=el('crmLoyaltyRead');
 if(!store||!date||!run||!load||!metrics||!loyalty)return;
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),offset=d=>new Date(Date.parse(now)-d*86400000).toISOString().slice(0,10);
 date.max=offset(1);date.min=offset(31);date.value=date.max;
 const valid=()=>document.documentElement.classList.contains('crm-pilot-open'),selection=()=>valid()&&!!store.value&&!!date.value&&date.checkValidity();
 const clear=()=>{generation++;metrics.replaceChildren();clearDetails();liveStatus().textContent='Sélection modifiée. Chargez la journée.';run.disabled=!selection();loyalty.disabled=!selection()};
 store.onchange=clear;date.onchange=clear;
 const readTickets=async(page)=>{
  if(!selection()||!summary)return;const g=generation,tg=++ticketGeneration,id=store.value,day=date.value,expected=summary;
  el('crmTicketRows').replaceChildren();el('crmTicketPager').hidden=true;el('crmTicketStatus').textContent='Lecture du contenu des paniers…';
  try{const x=await api('/api/crm/observed-tickets?'+new URLSearchParams({storeId:id,date:day,page:String(page)}),{noRetry:true,cache:'no-store'});if(g!==generation||tg!==ticketGeneration||!valid())return;
   if(!validateTicketPage(x,{storeId:id,date:day,page,checkedAt:expected.checkedAt,tickets:expected.tickets}))throw Error('Ticket evidence mismatch');
   renderTickets(x.rows);currentPage=page;const total=Math.ceil(x.totalTickets/20);el('crmTicketStatus').textContent='D365 · '+day+' · '+fmt(x.totalTickets)+' paniers observés. Retours exclus.';el('crmTicketPage').textContent='Page '+page+' / '+total;el('crmTicketPrev').disabled=page===1;el('crmTicketNext').disabled=page===total;el('crmTicketPager').hidden=false;
  }catch{if(g===generation&&tg===ticketGeneration&&valid()){el('crmTicketRows').replaceChildren();el('crmTicketStatus').textContent='Contenu indisponible ou extraction différente. Rechargez la journée.'}}
 };
 el('crmTicketPrev').onclick=()=>readTickets(currentPage-1);el('crmTicketNext').onclick=()=>readTickets(currentPage+1);
 load.onclick=async()=>{
  const g=++generation;metrics.replaceChildren();clearDetails();store.replaceChildren();run.disabled=true;load.disabled=true;liveStatus().textContent='Vérification des sources configurées…';
  try{
   const data=await api('/api/crm/observed-sales',{noRetry:true,cache:'no-store'});if(g!==generation||!valid())return;
   if(data?.status!=='READY'||!Array.isArray(data.stores))throw Error('Sources indisponibles');
   const options=[];for(const s of data.stores){if(typeof s.id!=='string'||typeof s.name!=='string')throw Error('Source invalide');const o=document.createElement('option');o.value=s.id;o.textContent=s.name;options.push(o)}store.replaceChildren(...options);
   liveStatus().textContent=store.options.length?'Sources configurées. Choisissez une journée et lancez la lecture.':'Aucun magasin connecté et autorisé.';run.disabled=!selection();loyalty.disabled=!selection();
  }catch{if(g===generation&&valid())liveStatus().textContent='Sources indisponibles. Vérifiez le déploiement et la connexion Dynamics.'}finally{load.disabled=false}
 };
 run.onclick=async()=>{
  if(!selection())return;
  const g=++generation,id=store.value,day=date.value;metrics.replaceChildren();clearDetails();run.disabled=true;loyalty.disabled=true;liveStatus().textContent='Lecture des tickets observés…';
  try{
   const x=await api('/api/crm/observed-sales?'+new URLSearchParams({storeId:id,date:day}),{noRetry:true,cache:'no-store'});
   if(g!==generation||!valid())return;
   if(x?.status==='SUPPRESSED'){liveStatus().textContent='Résultat masqué : cohorte trop petite.';return}
   if(!validateObservationResponse(x,{storeId:id,date:day}))throw Error('Evidence unavailable');
   summary=x;el('crmCustomersRead').disabled=false;el('crmAssociationsRead').disabled=false;
   if(el('orbitCount'))el('orbitCount').textContent=fmt(x.identifiedCustomers);if(el('crmScopeDate'))el('crmScopeDate').textContent=day;if(el('crmScopeLabel'))el('crmScopeLabel').textContent='Franprix · '+store.selectedOptions[0].textContent;
   for(const [label,v] of [['Clients identifiés observés',fmt(x.identifiedCustomers)],['Tickets observés',fmt(x.tickets)],['Tickets identifiés',fmt(x.identifiedTickets)],['Ventes TTC positives',money(x.positiveSales)],['Ventes positives identifiées',money(x.identifiedPositiveSales)],['Panier positif moyen',money(x.averagePositiveBasket)]])metric(metrics,label,v);
   liveStatus().textContent='D365 · '+day+' · extraction '+x.checkedAt+' · rapprochement financier non vérifié. Retours exclus.';
   await readTickets(1);
  }catch{if(g===generation&&valid()){metrics.replaceChildren();clearDetails();liveStatus().textContent='Données indisponibles ou insuffisantes. Aucun montant fictif substitué.'}}finally{if(g===generation&&valid()){run.disabled=!selection();loyalty.disabled=!selection()}}
 };
 loyalty.onclick=async()=>{
  if(!selection())return;const g=generation,lg=++loyaltyGeneration,id=store.value,day=date.value,out=el('crmLoyaltyMetrics'),status=el('crmLoyaltyStatus');out.replaceChildren();loyalty.disabled=true;status.textContent='Lecture fidélité Dynamics…';
  try{const x=await api('/api/crm/observed-loyalty?'+new URLSearchParams({storeId:id,date:day}),{noRetry:true,cache:'no-store'});if(g!==generation||lg!==loyaltyGeneration||!valid())return;
   const count=v=>v===null||Number.isSafeInteger(v)&&v>=0;
   const walletValid=x.walletEarn===null&&x.walletEarnStatus==='UNAVAILABLE'||typeof x.walletEarn==='number'&&Number.isFinite(x.walletEarn)&&Number.isSafeInteger(Math.round(x.walletEarn*100))&&x.walletEarnStatus==='READY';
   if(!['READY','UNAVAILABLE'].includes(x?.status)||x.storeId!==id||x.date!==day||!Number.isFinite(Date.parse(x.checkedAt))||x.currency!=='MAD'||x.attribution!=='EARLIEST_LOYALTY_CARD_OPERATING_UNIT'||x.activationEnabled!==false||!count(x.accountCreations)||!count(x.cardEnrollments)||!walletValid||!['READY','PARTIAL','UNAVAILABLE'].includes(x.accountStatus)||!['READY','UNAVAILABLE'].includes(x.cardStatus))throw Error('Loyalty evidence unavailable');
   const display=value=>value!==null?fmt(value):'Non disponible';
   metric(out,'Comptes créés attribués',display(x.accountCreations,x.accountStatus));metric(out,'Cartes inscrites',display(x.cardEnrollments,x.cardStatus));metric(out,'Wallet Earn net',x.walletEarn===null?'Non disponible':money(x.walletEarn));
   status.textContent='D365 · '+day+' · attribution '+(x.accountStatus==='PARTIAL'?'partielle':'selon première carte')+' · extraction '+x.checkedAt;
  }catch{if(g===generation&&lg===loyaltyGeneration&&valid()){out.replaceChildren();status.textContent='Données fidélité indisponibles.'}}finally{if(g===generation&&lg===loyaltyGeneration&&valid())loyalty.disabled=!selection()}
 };
 const insightValid=(x,id,day,expected)=>x?.status==='READY'&&x.storeId===id&&x.date===day&&x.checkedAt===expected.checkedAt&&x.currency==='MAD'&&x.source==='D365/RetailTransactionSalesTransBIEntities'&&x.basis==='POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS'&&x.activationEnabled===false&&Array.isArray(x.rows);
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=160;
 function tableRow(container,values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=String(v);tr.append(td)}container.append(tr)}
 const readInsight=async(kind,page=1)=>{
  if(!selection()||!summary)return;
  const g=generation,ig=++insightGeneration,id=store.value,day=date.value,expected=summary,customer=kind==='customers',prefix=customer?'crmCustomers':'crmAssociations',out=el(prefix+'Rows'),status=el(prefix+'Status'),button=el(prefix+'Read');
  out.replaceChildren();if(customer)el('crmCustomersPager').hidden=true;status.textContent='Lecture des observations Dynamics…';button.disabled=true;
  try{
   const x=await api('/api/crm/observed-'+kind+'?'+new URLSearchParams({storeId:id,date:day,page:String(page)}),{noRetry:true,cache:'no-store'});if(g!==generation||ig!==insightGeneration||!valid())return;
   if(!insightValid(x,id,day,expected))throw Error('Source mismatch');
   if(customer){
    if(x.identityBasis!=='EXTRACTION_LOCAL_ORDINAL'||x.totalCustomers!==expected.identifiedCustomers||x.page!==page||x.pageSize!==20||x.rows.length!==Math.min(20,x.totalCustomers-(page-1)*20)||!x.rows.every((r,i)=>r.ordinal===(page-1)*20+i+1&&Number.isSafeInteger(r.tickets)&&r.tickets>0&&number(r.positiveTtc)&&Number.isSafeInteger(r.distinctProducts)&&r.distinctProducts>0))throw Error('Invalid customer observations');
    for(const r of x.rows)tableRow(out,['Client observé '+r.ordinal,fmt(r.tickets),money(r.positiveTtc),fmt(r.distinctProducts)]);
    customerPage=page;const total=Math.ceil(x.totalCustomers/20);el('crmCustomersPage').textContent='Page '+page+' / '+total;el('crmCustomersPrev').disabled=page===1;el('crmCustomersNext').disabled=page===total;el('crmCustomersPager').hidden=false;
    status.textContent=fmt(x.totalCustomers)+' clients identifiés observés · '+day+' · identification limitée à l’extraction.';
   }else{
    if(x.method!=='IDENTIFIED_POSITIVE_BASKET_COOCCURRENCE'||x.minimumDistinctCustomers!==10||!Number.isSafeInteger(x.baskets)||x.baskets<1||x.baskets>expected.identifiedTickets||x.rows.length>30||!x.rows.every(r=>text(r.productA)&&text(r.productB)&&Number.isSafeInteger(r.together)&&r.together>=10&&r.together<=x.baskets&&number(r.supportPct)&&r.supportPct<=100&&number(r.confidencePct)&&r.confidencePct<=100&&number(r.lift)))throw Error('Invalid associations');
    for(const r of x.rows)tableRow(out,[r.productA,r.productB,fmt(r.together),fmt(r.supportPct)+' %',fmt(r.confidencePct)+' %',fmt(r.lift)]);
    status.textContent=x.rows.length?fmt(x.baskets)+' paniers identifiés analysés · '+day:'Aucune paire ne franchit le seuil de publication pour cette journée.';
   }
  }catch{if(g===generation&&ig===insightGeneration&&valid()){out.replaceChildren();status.textContent='Observations indisponibles ou extraction différente. Rechargez la journée.'}}finally{if(g===generation&&valid())button.disabled=!summary}
 };
 el('crmCustomersRead').onclick=()=>readInsight('customers');el('crmCustomersPrev').onclick=()=>readInsight('customers',customerPage-1);el('crmCustomersNext').onclick=()=>readInsight('customers',customerPage+1);el('crmAssociationsRead').onclick=()=>readInsight('associations');
 load.click();
}

function setupNavigation(){
 const buttons=[...document.querySelectorAll('nav button[data-view]')],views=[...document.querySelectorAll('[data-live-view]')],dialog=el('crmModuleSearch'),input=el('crmModuleQuery'),results=el('crmModuleResults');
 const descriptions={overview:'Pilotage client · données Dynamics',customers:'Référentiel et historique d’achat',segments:'Construction des audiences',transactions:'Tickets et contenu des paniers',loyalty:'Franprix Connect · recrutements',basket:'Affinités entre produits',churn:'Risque de non-retour',purchase:'Anticipation des achats',offers:'Personnalisation des offres',sendtime:'Optimisation des contacts',copilot:'Assistant marketing',agent:'Recommandations et décisions',campaigns:'Préparation des campagnes',omnichannel:'Orchestration des canaux',dispatch:'Suivi des diffusions',experiments:'Mesure de l’impact',journeys:'Parcours clients',data:'Sources et intégrations'};
 function go(id){const button=buttons.find(b=>b.dataset.view===id);if(!button)return;
  for(const b of buttons){b.classList.toggle('active',b===button);if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  for(const v of views)v.hidden=v.dataset.liveView!==id;
  const label=button.textContent.trim();el('heading').textContent=label;el('activeCrumb').textContent=label;el('subtitle').textContent=descriptions[id]||'';
  el('crmLiveObservation').hidden=!['transactions','loyalty','basket'].includes(id);if(id==='customers'||id==='overview')loadDirectoryIfNeeded();
  el('topAction').hidden=id!=='overview';if(dialog.open)dialog.close();window.scrollTo({top:0,behavior:'instant'});
 }
 for(const b of buttons)b.onclick=()=>go(b.dataset.view);
 for(const b of document.querySelectorAll('[data-go]'))b.onclick=()=>go(b.dataset.go);
 function search(){results.replaceChildren();const q=input.value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(const b of buttons){const label=b.textContent.trim();if(!label.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q))continue;const item=document.createElement('button');item.type='button';item.className='secondary';item.textContent=label;item.onclick=()=>go(b.dataset.view);results.append(item)}if(!results.children.length)results.textContent='Aucun module correspondant.'}
 function open(){if(!document.documentElement.classList.contains('crm-pilot-open'))return;input.value='';search();if(!dialog.open)dialog.showModal();input.focus()}
 el('navSearch').onclick=open;el('topSearch').onclick=open;el('crmSearchClose').onclick=()=>dialog.close();input.oninput=search;
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}});
 go('overview');
}

let directoryGeneration=0,directoryPage=1,directoryLoaded=false,directoryBusy=false,directorySearch='',profileGeneration=0,historyGeneration=0,profileAccount=null,historyPage=1;
function clearProfile(){profileGeneration++;historyGeneration++;profileAccount=null;historyPage=1;el('crmHistoryRows')?.replaceChildren();el('crmHistoryMetrics')?.replaceChildren();if(el('crmHistoryPager'))el('crmHistoryPager').hidden=true;if(el('crmHistoryRead'))el('crmHistoryRead').disabled=false;if(el('crmHistoryStatus'))el('crmHistoryStatus').textContent='Lancez la lecture de l’historique.';el('crmProfileMetrics')?.replaceChildren();if(el('crmProfileTitle'))el('crmProfileTitle').textContent='Fiche client';if(el('crmProfileStatus'))el('crmProfileStatus').textContent='';if(el('crmCustomerProfile'))el('crmCustomerProfile').hidden=true}
function clearDirectory(){clearProfile();directorySearch='';if(el('crmDirectoryQuery'))el('crmDirectoryQuery').value='';directoryGeneration++;directoryPage=1;directoryLoaded=false;directoryBusy=false;el('crmDirectoryRows')?.replaceChildren();for(const id of ['crmDirectoryTotal','crmMasterKpi'])if(el(id))el(id).textContent='—';if(el('crmDirectoryPager'))el('crmDirectoryPager').hidden=true;if(el('crmDirectoryStatus'))el('crmDirectoryStatus').textContent='Session à vérifier. Actualisez le référentiel.';if(el('crmDirectoryRead'))el('crmDirectoryRead').disabled=false}
function loadDirectoryIfNeeded(){if(!directoryLoaded&&!directoryBusy)readDirectory(1)}
async function readDirectory(page){
 if(!document.documentElement.classList.contains('crm-pilot-open')||directoryBusy)return;
 clearProfile();const search=directorySearch,g=++directoryGeneration,rows=el('crmDirectoryRows'),status=el('crmDirectoryStatus'),btn=el('crmDirectoryRead');if(!rows||!status||!btn)return;
 directoryBusy=true;btn.disabled=true;rows.replaceChildren();el('crmDirectoryPager').hidden=true;status.textContent='Lecture du référentiel permanent Dynamics…';
 try{
  const x=await api('/api/crm/customer-directory?'+new URLSearchParams({page:String(page),...(search?{q:search}:{})}),{noRetry:true,cache:'no-store'});if(g!==directoryGeneration||!document.documentElement.classList.contains('crm-pilot-open'))return;
  if(x?.status!=='READY'||x.source!=='D365/CustTableCDREntities'||x.scope!=='LEGAL_ENTITY_RETAIL'||x.identityBasis!=='D365_LEGAL_ENTITY_ACCOUNT'||x.historyStatus!=='NOT_CONNECTED'||x.activationEnabled!==false||!Number.isFinite(Date.parse(x.checkedAt))||!Number.isSafeInteger(x.totalAccounts)||x.totalAccounts<0||!Number.isSafeInteger(x.matchedAccounts)||x.matchedAccounts<0||x.matchedAccounts>x.totalAccounts||x.search!==search||x.page!==page||x.pageSize!==50||!Array.isArray(x.rows)||x.rows.length!==Math.min(50,Math.max(0,x.matchedAccounts-(page-1)*50))||x.rows.some(r=>typeof r.accountRef!=='string'||!r.accountRef.trim()||r.accountRef.length>160||!Number.isFinite(Date.parse(r.createdAt))))throw Error('Invalid customer master');
  for(const r of x.rows){const tr=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=r.accountRef;button.onclick=()=>readProfile(r);cell.append(button);tr.append(cell);for(const v of [new Intl.DateTimeFormat('fr-MA',{timeZone:'Africa/Casablanca'}).format(new Date(r.createdAt)),'À raccorder']){const td=document.createElement('td');td.textContent=v;tr.append(td)}rows.append(tr)}
  const total=Math.max(1,Math.ceil(x.matchedAccounts/50));directoryPage=page;directoryLoaded=true;for(const id of ['crmDirectoryTotal','crmMasterKpi'])el(id).textContent=fmt(x.totalAccounts);
  status.textContent='D365 · '+fmt(x.matchedAccounts)+' compte(s) sur '+fmt(x.totalAccounts)+' · extraction '+x.checkedAt;el('crmDirectoryPage').textContent='Page '+page+' / '+total;el('crmDirectoryPrev').disabled=page===1;el('crmDirectoryNext').disabled=page===total;el('crmDirectoryPager').hidden=false;
 }catch(e){if(g===directoryGeneration){directoryLoaded=false;for(const id of ['crmDirectoryTotal','crmMasterKpi'])el(id).textContent='—';status.textContent=e.status===403?'Accès réseau refusé (403). Vérifiez votre habilitation CRM.':e.status===503?'Source Dynamics indisponible (503). Le référentiel n’a pas pu être lu.':'Lecture du référentiel impossible. Aucune base fictive substituée.'}}finally{if(g===directoryGeneration){directoryBusy=false;btn.disabled=false}}
}
async function readProfile(row){
 if(!document.documentElement.classList.contains('crm-pilot-open'))return;
 clearProfile();profileAccount=row.accountRef;const g=++profileGeneration,box=el('crmCustomerProfile'),out=el('crmProfileMetrics'),status=el('crmProfileStatus');box.hidden=false;out.replaceChildren();el('crmProfileTitle').textContent='Compte '+row.accountRef;status.textContent='Lecture du lien fidélité Dynamics…';
 try{const x=await api('/api/crm/customer-directory?'+new URLSearchParams({accountRef:row.accountRef}),{noRetry:true,cache:'no-store'});if(g!==profileGeneration||!document.documentElement.classList.contains('crm-pilot-open'))return;
  const l=x?.loyalty;
  if(x?.status!=='READY'||x.accountRef!==row.accountRef||x.createdAt!==row.createdAt||x.source!=='D365/CustTableCDREntities'||x.scope!=='LEGAL_ENTITY_RETAIL'||x.historyStatus!=='NOT_CONNECTED'||x.activationEnabled!==false||!['READY','UNVERIFIED','UNAVAILABLE'].includes(l?.status)||!(l.status==='READY'?Number.isSafeInteger(l.cardCount)&&l.cardCount>=0&&(l.cardCount===0?l.firstEnrollmentAt===null:Number.isFinite(Date.parse(l.firstEnrollmentAt))):l.cardCount===null&&l.firstEnrollmentAt===null))throw Error('Invalid profile');
  const date=v=>new Intl.DateTimeFormat('fr-MA',{timeZone:'Africa/Casablanca'}).format(new Date(v));
  metric(out,'Création du compte',date(x.createdAt));metric(out,'Cartes liées',l.cardCount===null?'Non vérifié':fmt(l.cardCount));metric(out,'Première inscription connue',l.firstEnrollmentAt?date(l.firstEnrollmentAt):'Non disponible');status.textContent=l.status==='READY'?'Lien compte → Party → cartes vérifié dans les sources.':'Lien fidélité indisponible ou non vérifié.';
 }catch{if(g===profileGeneration){out.replaceChildren();status.textContent='Lecture de la fiche indisponible. Réessayez.'}}
}
function setupCustomerDirectory(){el('crmDirectoryRead').onclick=()=>readDirectory(1);el('crmDirectoryPrev').onclick=()=>readDirectory(directoryPage-1);el('crmDirectoryNext').onclick=()=>readDirectory(directoryPage+1);el('crmDirectorySearch').onsubmit=e=>{e.preventDefault();if(!directoryBusy){directorySearch=el('crmDirectoryQuery').value.trim();readDirectory(1)}};el('crmDirectoryReset').onclick=()=>{if(!directoryBusy){directorySearch='';el('crmDirectoryQuery').value='';readDirectory(1)}};el('crmProfileClose').onclick=clearProfile;el('crmHistoryRead').onclick=()=>readHistory(1);el('crmHistoryPrev').onclick=()=>readHistory(historyPage-1);el('crmHistoryNext').onclick=()=>readHistory(historyPage+1)}

async function readHistory(page){
 const account=profileAccount;
 if(!account||!document.documentElement.classList.contains('crm-pilot-open'))return;
 const g=++historyGeneration,pg=profileGeneration,out=el('crmHistoryRows'),metrics=el('crmHistoryMetrics'),status=el('crmHistoryStatus'),btn=el('crmHistoryRead'),pager=el('crmHistoryPager');
 out.replaceChildren();metrics.replaceChildren();pager.hidden=true;btn.disabled=true;status.textContent='Lecture des achats Dynamics sur les magasins pilotes…';
 const active=()=>g===historyGeneration&&pg===profileGeneration&&account===profileAccount&&document.documentElement.classList.contains('crm-pilot-open');
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const text=v=>typeof v==='string'&&v.length>0&&v.length<=160;
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
 try{
  const x=await api('/api/crm/customer-directory?'+new URLSearchParams({accountRef:account,history:'1',page:String(page)}),{noRetry:true,cache:'no-store'});
  if(!active())return;
  if(x?.status!=='READY'||x.accountRef!==account||x.source!=='D365/RetailTransactionSalesTransBIEntities'||x.scope!=='APPROVED_PILOT_STORES'||x.basis!=='POSITIVE_ACCOUNT_LINES_EXCLUDES_RETURNS'||x.financialReconciliation!=='NOT_VERIFIED'||x.activationEnabled!==false||x.currency!=='MAD'||!Number.isFinite(Date.parse(x.checkedAt))||!Array.isArray(x.storeIds)||!x.storeIds.length||x.storeIds.length>2||new Set(x.storeIds).size!==x.storeIds.length||x.storeIds.some(s=>!text(s))||!Number.isSafeInteger(x.totalTickets)||x.totalTickets<0||!number(x.positiveTtc)||x.page!==page||x.pageSize!==20||!Array.isArray(x.rows)||x.rows.length!==Math.min(20,Math.max(0,x.totalTickets-(page-1)*20))||!(x.totalTickets?day(x.firstPurchase)&&day(x.lastPurchase)&&x.firstPurchase<=x.lastPurchase:x.firstPurchase===null&&x.lastPurchase===null&&x.positiveTtc===0)||!x.rows.every(r=>x.storeIds.includes(r.storeId)&&day(r.date)&&r.date>=x.firstPurchase&&r.date<=x.lastPurchase&&text(r.transactionRef)&&number(r.positiveTtc)&&r.positiveTtc>0&&Array.isArray(r.items)&&r.items.length>0&&r.items.length<=500&&r.items.every(i=>text(i.productNumber)&&(i.productName===null||text(i.productName))&&(i.unit===null||text(i.unit))&&(i.quantity===null||number(i.quantity))&&number(i.positiveTtc))&&Math.abs(r.items.reduce((n,i)=>n+i.positiveTtc,0)-r.positiveTtc)<=0.006*r.items.length+0.011))throw Error('Invalid history');
  const date=v=>v?new Intl.DateTimeFormat('fr-MA',{timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'—';
  metric(metrics,'Tickets observés',fmt(x.totalTickets));metric(metrics,'Achats TTC positifs',money(x.positiveTtc));metric(metrics,'Premier achat observé',date(x.firstPurchase));metric(metrics,'Dernier achat observé',date(x.lastPurchase));
  for(const r of x.rows){const d=document.createElement('details'),s=document.createElement('summary'),l=document.createElement('span'),v=document.createElement('span');l.textContent=date(r.date)+' · '+({ 'val-fleuri':'Val Fleuri',trefle:'Trèfle'}[r.storeId]||r.storeId)+' · '+r.transactionRef;v.textContent=money(r.positiveTtc);s.append(l,v);d.append(s);const wrap=document.createElement('div'),table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr'),body=document.createElement('tbody');wrap.className='ticket-items';for(const label of ['Article','Quantité','TTC positif']){const th=document.createElement('th');th.textContent=label;hr.append(th)}head.append(hr);table.append(head,body);for(const i of r.items){const tr=document.createElement('tr');for(const val of [i.productName?i.productName+' · '+i.productNumber:i.productNumber,i.quantity===null?'Non disponible':fmt(i.quantity)+(i.unit?' '+i.unit:''),money(i.positiveTtc)]){const td=document.createElement('td');td.textContent=val;tr.append(td)}body.append(tr)}wrap.append(table);d.append(wrap);out.append(d)}
  historyPage=page;const total=Math.max(1,Math.ceil(x.totalTickets/20));el('crmHistoryPage').textContent='Page '+page+' / '+total;el('crmHistoryPrev').disabled=page===1;el('crmHistoryNext').disabled=page===total;pager.hidden=false;status.textContent=x.totalTickets?'D365 · historique disponible sur les magasins pilotes · extraction '+x.checkedAt:'Aucun achat positif attribué à ce compte dans les sources pilotes interrogées.';
 }catch{if(active()){out.replaceChildren();metrics.replaceChildren();status.textContent='Historique indisponible ou incomplet. Aucun achat nul n’est déduit.'}}finally{if(active())btn.disabled=false}
}
