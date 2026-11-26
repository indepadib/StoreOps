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
let generation=0,ticketGeneration=0,loyaltyGeneration=0,summary=null,currentPage=1;
function metric(container,label,value){const d=document.createElement('div'),b=document.createElement('strong');if(container.id==='crmLiveMetrics')d.className='metric';d.append(document.createTextNode(label));b.textContent=String(value);d.append(b);container.append(d)}
function clearDetails(){
 if(el('orbitCount'))el('orbitCount').textContent='—';if(el('crmScopeDate'))el('crmScopeDate').textContent='—';if(el('crmScopeLabel'))el('crmScopeLabel').textContent='Franprix';
 ticketGeneration++;loyaltyGeneration++;summary=null;currentPage=1;
 el('crmTicketRows')?.replaceChildren();el('crmLoyaltyMetrics')?.replaceChildren();
 if(el('crmTicketPager'))el('crmTicketPager').hidden=true;
 if(el('crmTicketStatus'))el('crmTicketStatus').textContent='Aucun ticket affiché. Chargez une journée.';
 if(el('crmLoyaltyStatus'))el('crmLoyaltyStatus').textContent='Sélectionnez le magasin et la date.';
 if(el('crmLoyaltyRead'))el('crmLoyaltyRead').disabled=true;
}
function clearLiveObservation(){generation++;el('crmLiveMetrics')?.replaceChildren();el('crmLiveStore')?.replaceChildren();if(el('crmLiveRead'))el('crmLiveRead').disabled=true;clearDetails();if(liveStatus())liveStatus().textContent='Session à vérifier. Actualisez les magasins.'}
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
   summary=x;
   if(el('orbitCount'))el('orbitCount').textContent=fmt(x.identifiedCustomers);if(el('crmScopeDate'))el('crmScopeDate').textContent=day;if(el('crmScopeLabel'))el('crmScopeLabel').textContent='Franprix · '+store.selectedOptions[0].textContent;
   for(const [label,v] of [['Clients identifiés observés',fmt(x.identifiedCustomers)],['Tickets observés',fmt(x.tickets)],['Tickets identifiés',fmt(x.identifiedTickets)],['Ventes TTC positives',money(x.positiveSales)],['Ventes positives identifiées',money(x.identifiedPositiveSales)],['Panier positif moyen',money(x.averagePositiveBasket)]])metric(metrics,label,v);
   liveStatus().textContent='D365 · '+day+' · extraction '+x.checkedAt+' · rapprochement financier non vérifié. Retours exclus.';
   await readTickets(1);
  }catch{if(g===generation&&valid()){metrics.replaceChildren();clearDetails();liveStatus().textContent='Données indisponibles ou insuffisantes. Aucun montant fictif substitué.'}}finally{if(g===generation&&valid()){run.disabled=!selection();loyalty.disabled=!selection()}}
 };
 loyalty.onclick=async()=>{
  if(!selection())return;const g=generation,lg=++loyaltyGeneration,id=store.value,day=date.value,out=el('crmLoyaltyMetrics'),status=el('crmLoyaltyStatus');out.replaceChildren();loyalty.disabled=true;status.textContent='Lecture fidélité Dynamics…';
  try{const x=await api('/api/crm/observed-loyalty?'+new URLSearchParams({storeId:id,date:day}),{noRetry:true,cache:'no-store'});if(g!==generation||lg!==loyaltyGeneration||!valid())return;
   const count=v=>v===null||Number.isSafeInteger(v)&&(v===0||v>=10);
   if(!['READY','UNAVAILABLE'].includes(x?.status)||x.storeId!==id||x.date!==day||!Number.isFinite(Date.parse(x.checkedAt))||x.currency!=='MAD'||x.attribution!=='EARLIEST_LOYALTY_CARD_OPERATING_UNIT'||x.activationEnabled!==false||!count(x.accountCreations)||!count(x.cardEnrollments)||x.walletEarn!==null||!['READY','PARTIAL','SUPPRESSED','UNAVAILABLE'].includes(x.accountStatus)||!['READY','SUPPRESSED','UNAVAILABLE'].includes(x.cardStatus))throw Error('Loyalty evidence unavailable');
   const display=(value,state)=>value!==null?fmt(value):state==='SUPPRESSED'?'Masqué':'Non disponible';
   metric(out,'Comptes créés attribués',display(x.accountCreations,x.accountStatus));metric(out,'Cartes inscrites',display(x.cardEnrollments,x.cardStatus));metric(out,'Wallet Earn','Non disponible');
   status.textContent='D365 · '+day+' · attribution '+(x.accountStatus==='PARTIAL'?'partielle':'selon première carte')+' · extraction '+x.checkedAt;
  }catch{if(g===generation&&lg===loyaltyGeneration&&valid()){out.replaceChildren();status.textContent='Données fidélité indisponibles.'}}finally{if(g===generation&&lg===loyaltyGeneration&&valid())loyalty.disabled=!selection()}
 };
 load.click();
}

function setupNavigation(){
 const buttons=[...document.querySelectorAll('nav button[data-view]')],views=[...document.querySelectorAll('[data-live-view]')],dialog=el('crmModuleSearch'),input=el('crmModuleQuery'),results=el('crmModuleResults');
 const descriptions={overview:'Pilotage client · données Dynamics',customers:'Référentiel et historique d’achat',segments:'Construction des audiences',transactions:'Tickets et contenu des paniers',loyalty:'Franprix Connect · recrutements',basket:'Affinités entre produits',churn:'Risque de non-retour',purchase:'Anticipation des achats',offers:'Personnalisation des offres',sendtime:'Optimisation des contacts',copilot:'Assistant marketing',agent:'Recommandations et décisions',campaigns:'Préparation des campagnes',omnichannel:'Orchestration des canaux',dispatch:'Suivi des diffusions',experiments:'Mesure de l’impact',journeys:'Parcours clients',data:'Sources et intégrations'};
 function go(id){const button=buttons.find(b=>b.dataset.view===id);if(!button)return;
  for(const b of buttons){b.classList.toggle('active',b===button);if(b===button)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
  for(const v of views)v.hidden=v.dataset.liveView!==id;
  const label=button.textContent.trim();el('heading').textContent=label;el('activeCrumb').textContent=label;el('subtitle').textContent=descriptions[id]||'';
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
