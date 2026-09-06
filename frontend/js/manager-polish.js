import './manager-dlc-focus.js';
import './manager-commercial-focus.js';

const MANAGER=()=>document.body.classList.contains('manager-mode');
let submitPending=false;
let finalizePending=null;
let successTimer=null;
let pendingTimer=null;
let finalizeTimer=null;

function ensureSuccessHost(){
  let host=document.querySelector('#managerSuccess');
  if(host)return host;
  host=document.createElement('div');
  host.id='managerSuccess';
  host.className='manager-success';
  host.hidden=true;
  host.innerHTML='<div class="manager-success-mark">✓</div><strong></strong><span></span>';
  document.body.appendChild(host);
  return host;
}

function resetPending(){submitPending=false;clearTimeout(pendingTimer)}
function markPending(){
  submitPending=true;
  clearTimeout(pendingTimer);
  pendingTimer=setTimeout(()=>{submitPending=false},10000);
}
function resetFinalize(){finalizePending=null;clearTimeout(finalizeTimer)}
function markFinalize(group){
  finalizePending=group;
  clearTimeout(finalizeTimer);
  finalizeTimer=setTimeout(resetFinalize,10000);
}

function showSuccess({title='C’est fait.',detail='On passe à la suite.',duration=650,onDone=null}={}){
  if(!MANAGER())return;
  const host=ensureSuccessHost();
  host.querySelector('strong').textContent=title;
  host.querySelector('span').textContent=detail;
  clearTimeout(successTimer);
  host.hidden=false;
  requestAnimationFrame(()=>host.classList.add('show'));
  successTimer=setTimeout(()=>{
    host.classList.remove('show');
    setTimeout(()=>{
      host.hidden=true;
      if(onDone)return onDone();
      const next=document.querySelector('.page.active .step-card.current,.page.active .manager-main-cta');
      next?.scrollIntoView({behavior:'smooth',block:'center'});
    },180);
  },duration);
}

function simplifyTaskModal(){
  if(!MANAGER())return;
  const modal=document.querySelector('#taskModal');
  if(!modal||modal.hidden)return;
  modal.querySelectorAll('.boolean-choice .choice.yes').forEach(b=>{if(b.textContent.trim()==='Conforme')b.textContent='Oui'});
  modal.querySelectorAll('.boolean-choice .choice.no').forEach(b=>{if(b.textContent.trim()==='Non conforme')b.textContent='Non'});
  modal.querySelectorAll('.task-wizard-question label').forEach(label=>{
    const node=label.childNodes[0],text=node?.textContent?.trim();
    if(text&&!/[?…:]$/.test(text))node.textContent=`${text} ? `;
  });
  const submit=document.querySelector('#modalSubmit');
  if(submit&&submit.textContent.trim()==='Valider le contrôle')submit.textContent='Valider';
}

function simplifyManagerChrome(){
  if(!MANAGER())return;
  const refresh=document.querySelector('#refreshBtn');
  if(refresh)refresh.hidden=true;
  document.querySelector('footer')?.setAttribute('aria-hidden','true');
}

function autoTakeJourney(){
  if(!MANAGER())return;
  const page=document.querySelector('.page.active');
  if(!page||!['openingPage','closingPage'].includes(page.id)||!page.querySelector('.process-overview'))return;
  const btn=page.querySelector('[data-take]');
  if(!btn)return;
  const label=btn.textContent.trim();
  if(label.startsWith('Pris en charge')){delete btn.dataset.autoTakeStarted;return}
  if(label!=='Prendre en charge'||btn.disabled||btn.dataset.autoTakeStarted==='1')return;
  btn.dataset.autoTakeStarted='1';
  setTimeout(()=>{
    if(MANAGER()&&page.classList.contains('active')&&!btn.disabled&&btn.textContent.trim()==='Prendre en charge')btn.click();
  },40);
}

function finishJourneyIfReady(){
  if(!MANAGER()||!finalizePending)return;
  const page=document.querySelector('.page.active');
  const expected=finalizePending==='opening'?'openingPage':'closingPage';
  const doneText=finalizePending==='opening'?'Magasin ouvert':'Magasin fermé';
  if(page?.id!==expected||!page.textContent.includes(doneText))return;
  const group=finalizePending;
  resetFinalize();
  showSuccess({
    title:group==='opening'?'Magasin prêt.':'Journée terminée.',
    detail:group==='opening'?'Bonne journée.':'Tout est enregistré.',
    duration:900,
    onDone:()=>document.querySelector('#managerNav [data-page="today"]')?.click()
  });
}

export function initManagerPolish(){
  const taskModal=document.querySelector('#taskModal');
  document.querySelector('#modalSubmit')?.addEventListener('click',()=>{if(MANAGER()&&!taskModal?.hidden)markPending()},{capture:true});
  document.querySelector('#modalClose')?.addEventListener('click',resetPending,{capture:true});
  taskModal?.addEventListener('click',e=>{if(e.target===taskModal)resetPending()},{capture:true});
  document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-validate]');if(MANAGER()&&btn)markFinalize(btn.dataset.validate)},{capture:true});
  const observer=new MutationObserver(()=>{
    simplifyManagerChrome();
    simplifyTaskModal();
    autoTakeJourney();
    finishJourneyIfReady();
    if(submitPending&&taskModal?.hidden){resetPending();showSuccess()}
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','disabled']});
  simplifyManagerChrome();
  simplifyTaskModal();
  autoTakeJourney();
}

document.addEventListener('DOMContentLoaded',()=>initManagerPolish(),{once:true});
