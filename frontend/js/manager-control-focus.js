const MANAGER=()=>document.body.classList.contains('manager-mode');
const DEFINITIONS=[
  {page:'cashOpeningPage',cards:'.cash-open-card',done:card=>card.classList.contains('is-ready'),label:'caisses',success:'Caisses prêtes'},
  {page:'coldChainPage',cards:'.cold-card',done:card=>card.classList.contains('is-ready')&&!card.querySelector('.ban-danger'),label:'zones',success:'Froid conforme'}
];

function today(){document.querySelector('#managerNav [data-page="today"]')?.click()}
function focus(def){
  if(!MANAGER())return;
  const page=document.querySelector(`#${def.page}`);if(!page?.classList.contains('active'))return;
  const cards=[...page.querySelectorAll(def.cards)];if(!cards.length)return;
  page.classList.add('manager-control-focus-page');
  const done=cards.filter(def.done),pending=cards.filter(x=>!def.done(x));
  cards.forEach(c=>{c.classList.remove('manager-control-current','manager-control-hidden');if(pending.length&&c!==pending[0])c.classList.add('manager-control-hidden');else if(pending.length&&c===pending[0])c.classList.add('manager-control-current')});
  let banner=page.querySelector('.manager-control-focus-head');
  if(!banner){banner=document.createElement('section');banner.className='manager-control-focus-head';const content=page.querySelector('[id$="Content"]');content?.prepend(banner)}
  if(pending.length){
    const current=pending[0],name=current.querySelector('.label')?.textContent?.trim()||`Contrôle ${done.length+1}`;
    banner.innerHTML=`<span class="manager-eyebrow">${done.length}/${cards.length} terminé(s)</span><h2>${name}</h2><p>Faites ce contrôle maintenant. Le suivant apparaîtra automatiquement.</p><div class="manager-focus-progress"><i style="width:${Math.round(done.length/cards.length*100)}%"></i></div>`;
    setTimeout(()=>current.scrollIntoView({behavior:'smooth',block:'center'}),40);
  }else{
    banner.innerHTML=`<div class="manager-focus-check">✓</div><span class="manager-eyebrow">Terminé</span><h2>${def.success}</h2><p>Tous les contrôles requis sont enregistrés.</p><button class="btn brand manager-focus-done" type="button">Retour à Aujourd’hui</button>`;
    banner.querySelector('.manager-focus-done')?.addEventListener('click',today);
  }
}
function run(){DEFINITIONS.forEach(focus)}
export function initManagerControlFocus(){const observer=new MutationObserver(run);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});run()}
document.addEventListener('DOMContentLoaded',initManagerControlFocus,{once:true});
