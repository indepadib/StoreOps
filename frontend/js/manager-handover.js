import { api } from './api.js';
import { app } from './state.js';
import { toast } from './ui.js';
import { renderHandover } from './pages/handover.js';

const MANAGER=()=>document.body.classList.contains('manager-mode');
let step=0;
let draft={title:'',category:'OPERATIONS',blocking:false};
let busy=false;

const TYPES=[['OPERATIONS','Exploitation'],['SECURITY','Sécurité'],['TECHNICAL','Technique'],['COLD','Froid'],['CASH','Caisses'],['STOCK','Stock'],['QUALITY','Qualité'],['COMMERCIAL','Prix / promos']];
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function host(){let el=document.querySelector('#managerHandoverFlow');if(el)return el;el=document.createElement('div');el.id='managerHandoverFlow';el.className='manager-handover-backdrop';el.hidden=true;document.body.appendChild(el);return el}
function close(){const el=host();el.hidden=true;el.innerHTML='';step=0;draft={title:'',category:'OPERATIONS',blocking:false};busy=false}
function render(){
  const el=host();el.hidden=false;
  let body='';
  if(step===0)body=`<span class="manager-eyebrow">À transmettre demain</span><h2>Qu’est-ce qu’il faut savoir ?</h2><textarea id="managerHandoverTitle" rows="4" maxlength="180" placeholder="Ex. TPE caisse 2 instable">${draft.title}</textarea><button class="btn brand manager-handover-primary" id="managerHandoverNext">Continuer</button>`;
  if(step===1)body=`<span class="manager-eyebrow">Type</span><h2>Ça concerne quoi ?</h2><div class="manager-handover-choices">${TYPES.map(([v,l])=>`<button type="button" data-ho-type="${v}">${l}<span>›</span></button>`).join('')}</div><button class="btn ghost manager-handover-back" id="managerHandoverBack">Retour</button>`;
  if(step===2)body=`<span class="manager-eyebrow">Impact demain</span><h2>Est-ce que ça doit bloquer l’ouverture ?</h2><div class="manager-handover-choices"><button type="button" data-ho-block="false"><div><strong>Non</strong><small>À suivre demain, sans bloquer l’ouverture</small></div><span>›</span></button><button type="button" data-ho-block="true"><div><strong>Oui</strong><small>Le magasin ne doit pas ouvrir tant que ce n’est pas résolu</small></div><span>›</span></button></div><button class="btn ghost manager-handover-back" id="managerHandoverBack">Retour</button>`;
  el.innerHTML=`<section class="manager-handover-sheet"><button class="manager-handover-close" id="managerHandoverClose" aria-label="Fermer">×</button><div class="manager-handover-progress"><span class="${step>=0?'active':''}"></span><span class="${step>=1?'active':''}"></span><span class="${step>=2?'active':''}"></span></div>${body}</section>`;
  bind();
}
function bind(){
  document.querySelector('#managerHandoverClose')?.addEventListener('click',close);
  document.querySelector('#managerHandoverBack')?.addEventListener('click',()=>{step=Math.max(0,step-1);render()});
  document.querySelector('#managerHandoverNext')?.addEventListener('click',()=>{const v=document.querySelector('#managerHandoverTitle')?.value.trim()||'';if(v.length<4)return toast('Décris brièvement ce qu’il faut transmettre.');draft.title=v;step=1;render()});
  document.querySelectorAll('[data-ho-type]').forEach(b=>b.addEventListener('click',()=>{draft.category=b.dataset.hoType;step=2;render()}));
  document.querySelectorAll('[data-ho-block]').forEach(b=>b.addEventListener('click',async()=>{draft.blocking=b.dataset.hoBlock==='true';await submit(b)}));
}
async function refresh(){await renderHandover();enhancePage()}
async function submit(button){
  if(busy)return;busy=true;button.disabled=true;
  try{
    await api(`/api/stores/${app.storeId}/handover`,{method:'POST',body:JSON.stringify({
      title:draft.title,
      description:'Transmis depuis le parcours Responsable magasin.',
      category:draft.category,
      priority:draft.blocking?'CRITICAL':'NORMAL',
      targetDate:tomorrow(),
      blockingOpening:draft.blocking
    })});
    close();toast('Sujet transmis pour demain.');await refresh();
  }catch(e){busy=false;button.disabled=false;toast(e.message)}
}
async function review(){
  if(busy)return;busy=true;
  const buttons=document.querySelectorAll('[data-manager-handover-review]');buttons.forEach(b=>b.disabled=true);
  try{await api(`/api/stores/${app.storeId}/handover/review-closing`,{method:'POST'});toast('Passation terminée.');busy=false;await refresh()}catch(e){busy=false;buttons.forEach(b=>b.disabled=false);toast(e.message)}
}

function enhancePage(){
  if(!MANAGER())return;
  const page=document.querySelector('#handoverPage');if(!page?.classList.contains('active'))return;
  const content=page.querySelector('#handoverContent');if(!content||content.querySelector('#managerHandoverPrompt'))return;
  const reviewed=/Revue effectuée|Passation de fin de journée revue/.test(content.textContent||'');
  const prompt=document.createElement('section');prompt.id='managerHandoverPrompt';prompt.className='manager-handover-prompt';
  prompt.innerHTML=reviewed?`<div class="manager-handover-check">✓</div><span class="manager-eyebrow">Passation</span><h2>C’est vérifié.</h2><p>Les sujets pour l’équipe suivante sont enregistrés.</p>`:`<span class="manager-eyebrow">Fin de journée</span><h2>Quelque chose à transmettre demain ?</h2><p>S’il n’y a rien, terminez directement la passation.</p><div class="manager-handover-actions"><button class="btn soft" id="managerHandoverYes">Ajouter un sujet</button><button class="btn brand" data-manager-handover-review>Terminer la passation</button></div>`;
  content.prepend(prompt);
  prompt.querySelector('#managerHandoverYes')?.addEventListener('click',()=>{step=0;draft={title:'',category:'OPERATIONS',blocking:false};render()});
  prompt.querySelectorAll('[data-manager-handover-review]').forEach(b=>b.addEventListener('click',review));
}

export function initManagerHandover(){const observer=new MutationObserver(enhancePage);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});enhancePage()}
document.addEventListener('DOMContentLoaded',initManagerHandover,{once:true});
