const MANAGER=()=>document.body.classList.contains('manager-mode');
const inventoryPage=()=>document.querySelector('#inventoryPage.page.active');

function ensureStyles(){
  if(document.querySelector('#managerInventoryFocusStyles'))return;
  const style=document.createElement('style');
  style.id='managerInventoryFocusStyles';
  style.textContent=`
    body.manager-mode #inventoryPage .manager-inventory-hidden{display:none!important}
    body.manager-mode #inventoryPage .manager-inventory-guide{margin:0 auto 14px;max-width:680px;padding:20px;border-radius:22px;border-color:#e1b6c5;background:#fffafb}
    body.manager-mode #inventoryPage .manager-inventory-guide h3{margin:5px 0 7px;font-size:22px}
    body.manager-mode #inventoryPage .manager-inventory-guide p{margin:0;color:var(--muted);line-height:1.45}
    body.manager-mode #inventoryPage .inventory-session-list{max-width:680px;margin-left:auto;margin-right:auto}
    body.manager-mode #inventoryPage .inventory-session{border-radius:24px;padding:18px}
    body.manager-mode #inventoryPage .inventory-session-kpis,body.manager-mode #inventoryPage .inventory-progress-line{display:none}
    body.manager-mode #inventoryPage .inventory-add-line{display:grid;grid-template-columns:1fr;gap:10px;padding:14px 0 2px}
    body.manager-mode #inventoryPage .inventory-add-line>.row{display:grid;grid-template-columns:1fr;gap:8px}
    body.manager-mode #inventoryPage [data-inv-ean]{min-height:58px;font-size:18px;border-radius:16px}
    body.manager-mode #inventoryPage [data-add-inv-line]{min-height:54px;border-radius:16px}
    body.manager-mode #inventoryPage .inventory-table-wrap{overflow:visible}
    body.manager-mode #inventoryPage .inventory-table,body.manager-mode #inventoryPage .inventory-table tbody{display:block}
    body.manager-mode #inventoryPage .inventory-line-row{display:block;border:0}
    body.manager-mode #inventoryPage .inventory-line-row td{display:block;border:0;padding:5px 0}
    body.manager-mode #inventoryPage .inventory-line-row td[data-label]:before{display:none}
    body.manager-mode #inventoryPage .inventory-line-row td:not([data-label="Article"]):not([data-label="Action"]){display:none}
    body.manager-mode #inventoryPage .inventory-line-row td[data-label="Article"]{padding:8px 0 14px;font-size:17px}
    body.manager-mode #inventoryPage .inventory-line-row td[data-label="Action"]{padding:0}
    body.manager-mode #inventoryPage .inventory-count-form{display:grid;grid-template-columns:1fr;gap:10px}
    body.manager-mode #inventoryPage .inventory-count-form input,body.manager-mode #inventoryPage .inventory-count-form select{min-height:56px;font-size:16px;border-radius:15px}
    body.manager-mode #inventoryPage .inventory-count-form button{min-height:56px;border-radius:16px;font-size:16px}
    body.manager-mode #inventoryPage .inventory-footer{display:grid;gap:10px;margin-top:12px}
    body.manager-mode #inventoryPage .inventory-footer>.row,body.manager-mode #inventoryPage .inventory-footer button{width:100%}
    body.manager-mode #inventoryPage [data-post-inventory]{display:none!important}
    @media(max-width:900px){body.manager-mode #inventoryPage .grid.g4,body.manager-mode #inventoryPage .grid.g2,body.manager-mode #inventoryPage .network-section-title{display:none}body.manager-mode #inventoryPage .inventory-blind-banner{margin-bottom:12px}}
  `;
  document.head.appendChild(style);
}

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
  ensureStyles();
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
    guide.innerHTML=`<span class="manager-eyebrow">${recount?'Étape 3 · Recomptage':'Étape 2 · Comptage aveugle'}</span><h3>${recount?'Recompte':'Compte'} : ${escapeHtml(name)}</h3><p>${ean?`EAN ${escapeHtml(ean)} · `:''}${recount?'Ne consulte pas le premier résultat. Saisis uniquement ce que tu recomptes physiquement.':'Le stock Dynamics reste caché. Saisis uniquement la quantité physique devant toi.'}</p>`;
    const qty=activeRow.querySelector('[data-count-qty]');if(qty)focusSoon(`[data-count-qty="${qty.dataset.countQty}"]`);
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
