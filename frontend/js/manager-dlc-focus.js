const MANAGER=()=>document.body.classList.contains('manager-mode');
let mode='home';
let queued=false;

function ensureStyles(){
  if(document.querySelector('link[data-manager-dlc-focus]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/manager-dlc-focus.css';link.dataset.managerDlcFocus='1';document.head.appendChild(link);
}
function root(){return document.querySelector('#dlcPage')}
function content(){return document.querySelector('#dlcContent')}
function titleBlock(){return root()?.querySelector('.page-title')}
function hide(el){if(el&&!el.classList.contains('manager-dlc-hidden'))el.classList.add('manager-dlc-hidden')}
function show(el){if(el&&el.classList.contains('manager-dlc-hidden'))el.classList.remove('manager-dlc-hidden')}
function resetHidden(){content()?.querySelectorAll('.manager-dlc-hidden').forEach(x=>x.classList.remove('manager-dlc-hidden'))}

function managerHome(){
  let host=document.querySelector('#managerDlcHome');
  if(host)return host;
  host=document.createElement('section');
  host.id='managerDlcHome';
  host.className='manager-dlc-home';
  host.innerHTML=`<span class="manager-eyebrow">DLC / DDM</span><h2>Que voulez-vous faire ?</h2><p>Un seul parcours à la fois. StoreOps garde les règles de risque et l’audit en arrière-plan.</p><div class="manager-dlc-home-actions"><button class="btn brand" id="managerDlcNew">Contrôler un article</button><button class="btn soft" id="managerDlcQueue">Traiter mes alertes DLC</button></div>`;
  content()?.prepend(host);
  host.querySelector('#managerDlcNew')?.addEventListener('click',()=>{mode='new';enhance()});
  host.querySelector('#managerDlcQueue')?.addEventListener('click',()=>{mode='queue';enhance()});
  return host;
}

function compactEntry(entry){
  if(!entry)return;
  entry.classList.add('manager-dlc-entry');
  const heading=entry.querySelector('.row');
  if(heading){const strong=heading.querySelector('strong');if(strong&&strong.textContent!=='Contrôler un article')strong.textContent='Contrôler un article';const small=heading.querySelector('.small');const copy='Scannez ou saisissez l’EAN, puis renseignez seulement les informations utiles.';if(small&&small.textContent!==copy)small.textContent=copy}
  const fields=[...entry.querySelectorAll('.field')];
  for(const field of fields){
    const label=(field.querySelector('label')?.textContent||'').trim();
    if(/^Unité$|^Famille$|^Zone$|^Lot \/ repère$|^Observation contrôle$/.test(label))hide(field);else show(field);
  }
  const save=entry.querySelector('#saveDlc');if(save&&save.textContent!=='Enregistrer le contrôle')save.textContent='Enregistrer le contrôle';
}

function pendingCards(){
  const cards=[...content()?.querySelectorAll('.dlc-priority-list .dlc-record')||[]];
  return cards.filter(card=>!card.textContent.includes('Action du lot enregistrée.'));
}
function focusQueue(list){
  const cards=[...content()?.querySelectorAll('.dlc-priority-list .dlc-record')||[]];
  cards.forEach(hide);
  const next=list[0];
  if(next){show(next);next.querySelector('.dlc-action-box')?.setAttribute('open','');next.querySelector('.dlc-history')?.removeAttribute('open')}
}
function queueHeader(total){
  let host=document.querySelector('#managerDlcQueueHead');
  if(!host){host=document.createElement('section');host.id='managerDlcQueueHead';host.className='manager-dlc-queue-head';content()?.prepend(host)}
  const state=String(total);
  if(host.dataset.state!==state){
    host.dataset.state=state;
    host.innerHTML=total?`<span class="manager-eyebrow">À traiter maintenant</span><h2>${total} alerte${total>1?'s':''} DLC</h2><p>Traitez le lot affiché. Le suivant apparaîtra automatiquement.</p><button class="btn ghost" id="managerDlcBack">Retour</button>`:`<div class="manager-dlc-done">✓</div><span class="manager-eyebrow">DLC / DDM</span><h2>Tout est traité.</h2><p>Aucune action DLC en attente pour le moment.</p><button class="btn brand" id="managerDlcToday">Retour à Aujourd’hui</button>`;
    host.querySelector('#managerDlcBack')?.addEventListener('click',()=>{mode='home';enhance()});
    host.querySelector('#managerDlcToday')?.addEventListener('click',()=>document.querySelector('#managerNav [data-page="today"]')?.click());
  }
  return host;
}

function simplifyPage(){
  if(!MANAGER())return;
  const page=root();if(!page?.classList.contains('active'))return;
  const c=content();if(!c)return;
  resetHidden();
  const tb=titleBlock();if(tb){const h=tb.querySelector('h1');if(h&&h.textContent!=='DLC / DDM')h.textContent='DLC / DDM';const p=tb.querySelector('p'),copy='Contrôler les dates et traiter les lots à risque.';if(p&&p.textContent!==copy)p.textContent=copy}
  hide(c.querySelector('.dlc-kpis'));
  [...c.querySelectorAll(':scope > .grid.g3')].forEach(hide);
  const sections=[...c.querySelectorAll('.network-section-title')];
  const registryTitle=sections.find(x=>x.textContent.includes('Registre complet'));hide(registryTitle);hide(registryTitle?.nextElementSibling);
  const thresholdTitle=sections.find(x=>x.textContent.includes('Paramétrage des seuils'));hide(thresholdTitle);hide(thresholdTitle?.nextElementSibling);
  const entry=c.querySelector('.dlc-entry'),queueTitle=sections.find(x=>x.textContent.includes('File de traitement DLC')),queue=c.querySelector('.dlc-priority-list');
  const home=managerHome(),queueHead=document.querySelector('#managerDlcQueueHead');
  if(mode==='home'){
    show(home);hide(entry);hide(queueTitle);hide(queue);hide(queueHead);
  }else if(mode==='new'){
    hide(home);hide(queueHead);show(entry);compactEntry(entry);hide(queueTitle);hide(queue);
    let back=document.querySelector('#managerDlcEntryBack');
    if(!back){back=document.createElement('button');back.id='managerDlcEntryBack';back.className='btn ghost manager-dlc-back';back.textContent='Retour';entry?.prepend(back);back.addEventListener('click',()=>{mode='home';enhance()})}
    back.hidden=false;
  }else{
    hide(home);hide(entry);hide(queueTitle);show(queue);
    const pending=pendingCards(),head=queueHeader(pending.length);show(head);focusQueue(pending);
  }
}

function watchActions(){
  document.addEventListener('click',e=>{
    if(!MANAGER()||mode!=='queue')return;
    if(e.target.closest('[data-dlc-treat],[data-dlc-recheck]'))setTimeout(()=>{mode='queue'},0);
  },true);
  document.addEventListener('click',e=>{
    if(!MANAGER()||mode!=='new')return;
    if(e.target.closest('#saveDlc'))setTimeout(()=>{mode='queue'},0);
  },true);
}
function enhance(){queued=false;simplifyPage()}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(enhance)}
export function initManagerDlcFocus(){ensureStyles();watchActions();enhance();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initManagerDlcFocus,{once:true});else initManagerDlcFocus();
