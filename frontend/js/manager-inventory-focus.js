const MANAGER=()=>document.body.classList.contains('manager-mode');
const inventoryPage=()=>document.querySelector('#inventoryPage.page.active');

function ensureGuideHost(content){
  let host=content.querySelector('.manager-inventory-guide');
  if(host)return host;
  host=document.createElement('section');
  host.className='card manager-inventory-guide';
  const anchor=content.querySelector('.inventory-session-list')||content.firstElementChild;
  if(anchor)anchor.before(host);else content.prepend(host);
  return host;
}

function setVisible(el,visible){if(el)el.classList.toggle('manager-inventory-hidden',!visible)}

function focusSoon(selector){
  const el=document.querySelector(selector);
  if(!el||el.dataset.managerAutoFocus==='1')return;
  el.dataset.managerAutoFocus='1';
  setTimeout(()=>{try{el.focus({preventScroll:true})}catch{}},80);
}

export function polishManagerInventory(){
  if(!MANAGER()||!inventoryPage())return;
  const content=document.querySelector('#inventoryContent');if(!content)return;
  const sessions=[...content.querySelectorAll('.inventory-session')];
  const editable=sessions.find(s=>s.querySelector('[data-count-line], [data-inv-ean], [data-finalize-inventory]'))||sessions[0]||null;
  sessions.forEach(s=>setVisible(s,s===editable));

  const guide=ensureGuideHost(content);
  if(!editable){
    guide.innerHTML='<span class="manager-eyebrow">Inventaire guidé</span><h3>Commence par lancer un inventaire</h3><p>Choisis le périmètre, puis scanne le premier article.</p>';
    focusSoon('#invZone');
    return;
  }

  const rows=[...editable.querySelectorAll('.inventory-line-row')];
  const activeRow=rows.find(r=>r.querySelector('[data-count-line]'))||null;
  rows.forEach(r=>setVisible(r,!activeRow||r===activeRow));
  const table=editable.querySelector('.inventory-table');
  const head=table?.querySelector('thead');
  if(head)head.classList.toggle('manager-inventory-hidden',!!activeRow);
  const addPanel=editable.querySelector('.inventory-add-line');
  const footer=editable.querySelector('.inventory-footer');

  if(activeRow){
    setVisible(addPanel,false);setVisible(footer,false);
    const recount=!!activeRow.querySelector('[data-recount="1"]'),name=activeRow.querySelector('td strong')?.textContent?.trim()||'Article',ean=activeRow.querySelector('td .small')?.textContent?.split('·')[0]?.trim()||'';
    guide.innerHTML=`<span class="manager-eyebrow">${recount?'Étape 3 · Recomptage':'Étape 2 · Comptage aveugle'}</span><h3>${recount?'Recompte':'Compte'} : ${escapeHtml(name)}</h3><p>${ean?`EAN ${escapeHtml(ean)} · `:''}${recount?'Ne consulte pas le premier résultat. Saisis uniquement ce que tu recompte physiquement.':'Le stock Dynamics reste caché. Saisis uniquement la quantité physique devant toi.'}</p>`;
    focusSoon(`[data-count-qty="${activeRow.querySelector('[data-count-qty]')?.dataset.countQty||''}"]`);
    return;
  }

  const ready=!!editable.querySelector('[data-finalize-inventory]:not([disabled])');
  if(ready){
    setVisible(addPanel,true);setVisible(footer,true);
    guide.innerHTML='<span class="manager-eyebrow">Étape suivante</span><h3>Scanne un autre article ou termine l’inventaire</h3><p>Chaque article est traité entièrement avant de passer au suivant.</p>';
    focusSoon('[data-inv-ean]');
  }else{
    setVisible(addPanel,true);setVisible(footer,false);
    guide.innerHTML='<span class="manager-eyebrow">Étape 1 · Scanner</span><h3>Scanne le prochain article</h3><p>Le stock théorique est enregistré en arrière-plan puis masqué pendant le comptage.</p>';
    focusSoon('[data-inv-ean]');
  }
}

function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

const observer=new MutationObserver(()=>polishManagerInventory());
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled']});
document.addEventListener('DOMContentLoaded',()=>polishManagerInventory(),{once:true});
