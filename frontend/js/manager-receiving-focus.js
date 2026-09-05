const MANAGER=()=>document.body.classList.contains('manager-mode');

function today(){document.querySelector('#managerNav [data-page="today"]')?.click()}
function receiptCards(page){
  const lines=[...page.querySelectorAll('.receipt-line')];
  return[...new Set(lines.map(l=>l.closest('.card')).filter(Boolean))];
}
function cardState(card){
  const lines=[...card.querySelectorAll('.receipt-line')],pending=lines.filter(l=>l.querySelector('.quality-form')),post=card.querySelector('[data-post-receipt]');
  if(pending.length)return{stage:'LINE',lines,pending,current:pending[0],post};
  if(post&&!post.disabled)return{stage:'POST',lines,pending,current:null,post};
  return{stage:'DONE',lines,pending,current:null,post};
}
function ensureHead(content){let h=content.querySelector('.manager-receiving-head');if(h)return h;h=document.createElement('section');h.className='manager-receiving-head';content.prepend(h);return h}
function focus(){
  if(!MANAGER())return;
  const page=document.querySelector('#receiptsPage');if(!page?.classList.contains('active'))return;
  const content=page.querySelector('#receiptsContent'),cards=receiptCards(page);if(!content||!cards.length)return;
  page.classList.add('manager-receiving-focus-page');
  const states=cards.map(card=>({card,...cardState(card)})),active=states.find(x=>x.stage!=='DONE'),head=ensureHead(content);
  cards.forEach(c=>c.classList.add('manager-receipt-hidden'));
  page.querySelectorAll('.receipt-line').forEach(l=>l.classList.remove('manager-receipt-current','manager-receipt-line-hidden'));
  if(!active){
    head.innerHTML=`<div class="manager-focus-check">✓</div><span class="manager-eyebrow">Réception</span><h2>Tout est terminé</h2><p>Les réceptions affichées sont contrôlées et confirmées.</p><button class="btn brand manager-receiving-done">Retour à Aujourd’hui</button>`;
    head.querySelector('.manager-receiving-done')?.addEventListener('click',today);return;
  }
  active.card.classList.remove('manager-receipt-hidden');active.card.classList.add('manager-receipt-active');
  const po=active.card.querySelector('.row strong')?.textContent?.trim()||'Réception';
  const total=active.lines.length,done=total-active.pending.length;
  if(active.stage==='LINE'){
    active.lines.forEach(l=>{if(l!==active.current)l.classList.add('manager-receipt-line-hidden')});active.current.classList.add('manager-receipt-current');
    const product=active.current.querySelector('h4')?.textContent?.trim()||'Article à contrôler';
    head.innerHTML=`<span class="manager-eyebrow">${po} · ${done}/${total} article(s) contrôlé(s)</span><h2>${product}</h2><p>Contrôlez cet article. Le suivant apparaîtra automatiquement.</p><div class="manager-focus-progress"><i style="width:${Math.round(done/Math.max(1,total)*100)}%"></i></div>`;
    setTimeout(()=>active.current.scrollIntoView({behavior:'smooth',block:'center'}),50);
  }else{
    active.lines.forEach(l=>l.classList.add('manager-receipt-line-hidden'));
    head.innerHTML=`<div class="manager-focus-check">✓</div><span class="manager-eyebrow">${po}</span><h2>Tous les articles sont contrôlés</h2><p>Dernière étape : confirmez la réception système.</p>`;
    active.post.classList.add('manager-receipt-post-focus');setTimeout(()=>active.post.scrollIntoView({behavior:'smooth',block:'center'}),50);
  }
}
export function initManagerReceivingFocus(){const observer=new MutationObserver(focus);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled']});focus()}
document.addEventListener('DOMContentLoaded',initManagerReceivingFocus,{once:true});
