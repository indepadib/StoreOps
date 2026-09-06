import { api } from './api.js';
import { app } from './state.js';
import { toast } from './ui.js';

const MANAGER=()=>document.body.classList.contains('manager-mode');
const TYPES=[
  ['SECURITY','Sécurité'],['TECHNICAL','Technique'],['COLD','Froid'],['QUALITY','Qualité'],['OPERATIONS','Autre']
];
const IMPACTS=[
  ['FOLLOW','À suivre','Pas de blocage'],
  ['URGENT','Urgent','Action rapide nécessaire'],
  ['OPENING','Bloque l’ouverture','Le magasin ne doit pas ouvrir'],
  ['CLOSING','Bloque la fermeture','Le magasin ne doit pas fermer'],
  ['TRANSACTION','Bloque les ventes','Transaction impossible']
];
let draft={title:'',category:'',impact:''};
let step=0;

function impactConfig(code){
  if(code==='URGENT')return{criticality:'HIGH',blockingLevel:'NONE',requiresEvidence:false};
  if(code==='OPENING')return{criticality:'CRITICAL',blockingLevel:'STORE_OPENING',requiresEvidence:true};
  if(code==='CLOSING')return{criticality:'CRITICAL',blockingLevel:'STORE_CLOSING',requiresEvidence:true};
  if(code==='TRANSACTION')return{criticality:'CRITICAL',blockingLevel:'TRANSACTION',requiresEvidence:true};
  return{criticality:'MEDIUM',blockingLevel:'NONE',requiresEvidence:false};
}

function host(){
  let el=document.querySelector('#managerAlertReporter');
  if(el)return el;
  el=document.createElement('div');
  el.id='managerAlertReporter';
  el.className='manager-alert-backdrop';
  el.hidden=true;
  document.body.appendChild(el);
  return el;
}
function close(){const el=host();el.hidden=true;el.innerHTML='';draft={title:'',category:'',impact:''};step=0}
function progress(){return`<div class="manager-alert-progress"><span class="${step>=0?'current':''}"></span><span class="${step>=1?'current':''}"></span><span class="${step>=2?'current':''}"></span></div>`}
function render(){
  const el=host();el.hidden=false;
  let body='';
  if(step===0)body=`<span class="manager-eyebrow">Signaler un problème</span><h2>Que se passe-t-il ?</h2><textarea id="managerAlertTitle" rows="4" maxlength="220" placeholder="Ex. Porte arrière impossible à verrouiller">${draft.title}</textarea><button class="btn brand manager-alert-primary" id="managerAlertNext">Continuer</button>`;
  if(step===1)body=`<span class="manager-eyebrow">Type de problème</span><h2>De quoi s’agit-il ?</h2><div class="manager-alert-choices">${TYPES.map(([v,l])=>`<button type="button" data-alert-type="${v}" class="${draft.category===v?'selected':''}">${l}<span>›</span></button>`).join('')}</div><button class="btn ghost manager-alert-back" id="managerAlertBack">Retour</button>`;
  if(step===2)body=`<span class="manager-eyebrow">Impact</span><h2>Est-ce que ça bloque le magasin ?</h2><div class="manager-alert-choices">${IMPACTS.map(([v,l,d])=>`<button type="button" data-alert-impact="${v}" class="${draft.impact===v?'selected':''}"><div><strong>${l}</strong><small>${d}</small></div><span>›</span></button>`).join('')}</div><button class="btn ghost manager-alert-back" id="managerAlertBack">Retour</button>`;
  el.innerHTML=`<section class="manager-alert-sheet"><button class="manager-alert-close" id="managerAlertClose" aria-label="Fermer">×</button>${progress()}${body}</section>`;
  bind();
}
function bind(){
  document.querySelector('#managerAlertClose')?.addEventListener('click',close);
  document.querySelector('#managerAlertBack')?.addEventListener('click',()=>{step=Math.max(0,step-1);render()});
  document.querySelector('#managerAlertNext')?.addEventListener('click',()=>{const value=document.querySelector('#managerAlertTitle')?.value.trim()||'';if(value.length<5){toast('Décris brièvement le problème.');return}draft.title=value;step=1;render()});
  document.querySelectorAll('[data-alert-type]').forEach(b=>b.addEventListener('click',()=>{draft.category=b.dataset.alertType;step=2;render()}));
  document.querySelectorAll('[data-alert-impact]').forEach(b=>b.addEventListener('click',async()=>{draft.impact=b.dataset.alertImpact;await submit(b)}));
}
async function submit(button){
  if(!draft.title||!draft.category||!draft.impact)return;
  const cfg=impactConfig(draft.impact);
  button.disabled=true;
  try{
    await api(`/api/stores/${app.storeId}/incidents`,{method:'POST',body:JSON.stringify({
      title:draft.title,
      description:'Signalé depuis le parcours Responsable magasin.',
      category:draft.category,
      criticality:cfg.criticality,
      blockingLevel:cfg.blockingLevel,
      assignedTo:app.user?.id||null,
      dueAt:null,
      requiresEvidence:cfg.requiresEvidence
    })});
    close();toast('Alerte enregistrée.');
    document.querySelector('#managerNav [data-page="incidents"]')?.click();
  }catch(e){button.disabled=false;toast(e.message)}
}

function simplifyAlertsPage(){
  if(!MANAGER())return;
  const page=document.querySelector('#incidentsPage');
  if(!page?.classList.contains('active'))return;
  const title=page.querySelector('.page-title h1');if(title)title.textContent='Alertes';
  const copy=page.querySelector('.page-title p');if(copy)copy.textContent='Ce qui demande une action.';
  let btn=page.querySelector('#managerReportAlert');
  if(!btn){btn=document.createElement('button');btn.id='managerReportAlert';btn.className='btn soft';btn.textContent='Signaler un problème';page.querySelector('.page-title')?.appendChild(btn);btn.addEventListener('click',()=>{draft={title:'',category:'',impact:''};step=0;render()})}
  const openTitle=[...page.querySelectorAll('.network-section-title strong')].find(x=>x.textContent.includes('Incidents ouverts'));if(openTitle)openTitle.textContent='À traiter';
  const open=[...page.querySelectorAll('[data-open-incident]')];
  let next=page.querySelector('#managerNextAlert');
  if(open.length){
    if(!next){next=document.createElement('button');next.id='managerNextAlert';next.className='btn brand wide';next.style.margin='10px 0 14px';page.querySelector('#incidentsContent')?.prepend(next)}
    next.textContent=open.length===1?'Traiter l’alerte':'Traiter la prochaine alerte';
    next.onclick=()=>open[0]?.click();
  }else next?.remove();
}

export function initManagerAlerts(){
  const observer=new MutationObserver(simplifyAlertsPage);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  simplifyAlertsPage();
}
document.addEventListener('DOMContentLoaded',initManagerAlerts,{once:true});
