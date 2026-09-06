const MANAGER=()=>document.body.classList.contains('manager-mode');
let mode='home';
let queued=false;

function ensureStyles(){
  if(document.querySelector('link[data-manager-commercial-focus]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/manager-commercial-focus.css';link.dataset.managerCommercialFocus='1';document.head.appendChild(link);
}
function page(){return document.querySelector('#commercialPage')}
function content(){return document.querySelector('#commercialContent')}
function hide(el){if(el&&!el.classList.contains('manager-commercial-hidden'))el.classList.add('manager-commercial-hidden')}
function show(el){if(el&&el.classList.contains('manager-commercial-hidden'))el.classList.remove('manager-commercial-hidden')}
function resetHidden(){content()?.querySelectorAll('.manager-commercial-hidden').forEach(x=>x.classList.remove('manager-commercial-hidden'))}

function home(){
  let host=document.querySelector('#managerCommercialHome');
  if(host)return host;
  host=document.createElement('section');host.id='managerCommercialHome';host.className='manager-commercial-home';
  host.innerHTML=`<span class="manager-eyebrow">Prix & promotions</span><h2>Que voulez-vous contrôler ?</h2><p>StoreOps récupère les prix et promotions attendus. Vous contrôlez uniquement ce qui est visible en magasin.</p><div class="manager-commercial-actions"><button class="btn brand" id="managerCommercialScan">Scanner un article</button><button class="btn soft" id="managerCommercialQueue">Actions prix / promos du jour</button></div>`;
  content()?.prepend(host);
  host.querySelector('#managerCommercialScan')?.addEventListener('click',()=>{mode='scan';enhance()});
  host.querySelector('#managerCommercialQueue')?.addEventListener('click',()=>{mode='actions';enhance()});
  return host;
}
function backButton(parent,id){
  let btn=document.querySelector(`#${id}`);if(btn)return btn;
  btn=document.createElement('button');btn.id=id;btn.className='btn ghost manager-commercial-back';btn.textContent='Retour';parent?.prepend(btn);btn.addEventListener('click',()=>{mode='home';enhance()});return btn;
}
function simplifyScan(card){
  if(!card)return;
  const strong=card.querySelector('.price-check-head strong');if(strong&&strong.textContent!=='Scanner un article')strong.textContent='Scanner un article';
  const small=card.querySelector('.price-check-head .small'),copy='Scannez le code-barres puis comparez simplement le prix attendu au prix affiché en rayon.';if(small&&small.textContent!==copy)small.textContent=copy;
  backButton(card,'managerCommercialScanBack');
}
function pendingCards(){
  const cards=[...content()?.querySelectorAll('.commercial-list .commercial-card')||[]];
  return cards.filter(card=>!card.textContent.includes('Contrôle terrain conforme.'));
}
function focusQueue(list){
  const cards=[...content()?.querySelectorAll('.commercial-list .commercial-card')||[]];cards.forEach(hide);
  const next=list[0];if(next){show(next);next.querySelector('.commercial-control')?.setAttribute('open','')}
}
function queueHead(total){
  let host=document.querySelector('#managerCommercialQueueHead');
  if(!host){host=document.createElement('section');host.id='managerCommercialQueueHead';host.className='manager-commercial-queue-head';content()?.prepend(host)}
  const state=String(total);if(host.dataset.state!==state){host.dataset.state=state;host.innerHTML=total?`<span class="manager-eyebrow">À traiter maintenant</span><h2>${total} action${total>1?'s':''} prix / promo</h2><p>Traitez la carte affichée. La suivante apparaîtra automatiquement.</p><button class="btn ghost" id="managerCommercialQueueBack">Retour</button>`:`<div class="manager-commercial-done">✓</div><span class="manager-eyebrow">Prix & promotions</span><h2>Tout est contrôlé.</h2><p>Aucune action prix / promo en attente.</p><button class="btn brand" id="managerCommercialToday">Retour à Aujourd’hui</button>`;
    host.querySelector('#managerCommercialQueueBack')?.addEventListener('click',()=>{mode='home';enhance()});
    host.querySelector('#managerCommercialToday')?.addEventListener('click',()=>document.querySelector('#managerNav [data-page="today"]')?.click());
  }
  return host;
}
function simplify(){
  if(!MANAGER())return;const p=page();if(!p?.classList.contains('active'))return;const c=content();if(!c)return;
  resetHidden();
  const title=p.querySelector('.page-title h1');if(title&&title.textContent!=='Prix & promotions')title.textContent='Prix & promotions';
  const copy=p.querySelector('.page-title p'),text='Contrôler les prix visibles et les promotions du jour.';if(copy&&copy.textContent!==text)copy.textContent=text;
  const scan=c.querySelector('.price-check-card'),history=c.querySelector('#priceCheckHistory'),readiness=c.querySelector('.commercial-readiness'),list=c.querySelector('.commercial-list');
  const directKpi=[...c.children].find(x=>x.matches?.('.grid.g4'));hide(directKpi);hide(readiness);hide(history);
  const syncBanner=[...c.children].find(x=>x.matches?.('.banner.ban-danger'));if(syncBanner)show(syncBanner);
  const h=home(),qh=document.querySelector('#managerCommercialQueueHead');
  if(mode==='home'){show(h);hide(scan);hide(list);hide(qh)}
  else if(mode==='scan'){hide(h);hide(qh);show(scan);hide(list);simplifyScan(scan)}
  else{hide(h);hide(scan);show(list);const pending=pendingCards(),head=queueHead(pending.length);show(head);focusQueue(pending)}
}
function watch(){
  document.addEventListener('click',e=>{if(MANAGER()&&mode==='actions'&&e.target.closest('[data-commercial-submit]'))setTimeout(()=>{mode='actions'},0)},true);
  document.addEventListener('click',e=>{if(MANAGER()&&mode==='scan'&&e.target.closest('#priceCheckSubmit'))setTimeout(()=>{mode='scan'},0)},true);
}
function enhance(){queued=false;simplify()}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(enhance)}
export function initManagerCommercialFocus(){ensureStyles();watch();enhance();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initManagerCommercialFocus,{once:true});else initManagerCommercialFocus();
