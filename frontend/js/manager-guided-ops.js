import { api } from './api.js';
import { app } from './state.js';

const MANAGER=()=>document.body.classList.contains('manager-mode');
let timer=null,working=false;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];

function css(){
 if(q('#guidedOpsStyles'))return;
 const s=document.createElement('style');s.id='guidedOpsStyles';s.textContent=`
 .guided-hero{border:1px solid var(--line);border-radius:22px;padding:18px;background:#fff;margin:12px 0}.guided-hero h2{font-size:28px;line-height:1.05;margin:5px 0 7px}.guided-hero p{margin:0;color:var(--muted);line-height:1.45}.guided-step{display:flex;gap:8px;margin-top:14px}.guided-step i{height:4px;flex:1;border-radius:99px;background:#eee}.guided-step i.on{background:#df2356}.guided-focus{outline:2px solid rgba(223,35,86,.18);box-shadow:0 12px 34px rgba(35,27,31,.08)}.guided-hidden{display:none!important}.guided-next{margin-top:12px}.guided-result{border-radius:18px;padding:16px;background:#231b1f;color:#fff;margin:12px 0}.guided-result small{display:block;opacity:.7;margin-top:4px}.guided-loss-create .form-grid{grid-template-columns:1fr!important}.guided-loss-create .loss-rules{display:none}.guided-loss-create .row:first-child .pill{display:none}.guided-loss-create strong{font-size:19px}.guided-loss-create .small{line-height:1.4}.guided-session .inventory-session-kpis,.guided-session .inventory-table thead,.guided-session .inventory-footer>.small{display:none}.guided-session .inventory-table-wrap{overflow:visible}.guided-session .inventory-table,.guided-session .inventory-table tbody,.guided-session .inventory-table tr,.guided-session .inventory-table td{display:block;width:100%}.guided-session .inventory-table td{border:0;padding:4px 0}.guided-session .inventory-line-row{border:1px solid var(--line);border-radius:18px;padding:14px;margin:10px 0}.guided-session .inventory-line-row td:not([data-label="Article"]):not([data-label="Action"]){display:none}.guided-session .inventory-count-form{display:grid;gap:9px;margin-top:10px}.guided-session .inventory-count-form input,.guided-session .inventory-count-form select{width:100%}.guided-session .inventory-count-form button{width:100%;min-height:46px}.guided-session .inventory-add-line{border:0;padding:0;margin-top:12px}.guided-session .inventory-add-line>div:first-child{display:none}
 @media(max-width:520px){.guided-hero{padding:15px}.guided-hero h2{font-size:25px}}
 `;document.head.appendChild(s);
}
function hero(host,eyebrow,title,detail,step=1,total=3){
 let h=q('.guided-hero',host);if(!h){h=document.createElement('section');h.className='guided-hero';host.prepend(h)}
 h.innerHTML=`<span class="manager-eyebrow">${eyebrow}</span><h2>${title}</h2><p>${detail}</p><div class="guided-step">${Array.from({length:total},(_,i)=>`<i class="${i<step?'on':''}"></i>`).join('')}</div>`;return h;
}
function inventory(){
 const page=q('#inventoryPage');if(!MANAGER()||!page?.classList.contains('active'))return;
 const host=q('#inventoryContent',page);if(!host)return;
 css();
 const sessions=qa('.inventory-session',host),active=sessions.find(x=>!x.textContent.includes('Posté'))||null;
 qa('.grid,.network-section-title,.inventory-blind-banner,.inventory-create',host).forEach(x=>x.classList.add('guided-hidden'));
 sessions.forEach(x=>x.classList.add('guided-hidden'));
 if(!active){hero(host,'Inventaire','Aucun comptage en cours','Lancez un inventaire depuis une anomalie stock ou depuis Plus. StoreOps vous guidera article par article.',3,3);q('.inventory-create',host)?.classList.remove('guided-hidden');return}
 active.classList.remove('guided-hidden');active.classList.add('guided-session');
 const ready=!!q('[data-post-inventory]',active),finalize=q('[data-finalize-inventory]',active),count=q('[data-count-line]',active);
 if(ready){hero(host,'Inventaire · étape 3/3','Ajustement prêt','Le comptage est validé. Vérifiez le résultat puis préparez l’envoi Dynamics.',3,3);return}
 if(finalize&&!finalize.disabled&&!count){hero(host,'Inventaire · étape 3/3','Comptage terminé','Tous les articles sont comptés. Une dernière validation prépare les mouvements Dynamics.',3,3);finalize.classList.add('guided-focus');return}
 if(count){const row=count.closest('.inventory-line-row'),name=q('[data-label="Article"] strong',row)?.textContent||'Article';hero(host,'Inventaire · étape 2/3',name,'Comptez physiquement. Le stock théorique reste volontairement masqué pour éviter de biaiser le comptage.',2,3);qa('.inventory-line-row',active).forEach(x=>x.classList.toggle('guided-hidden',x!==row));row?.classList.add('guided-focus');return}
 hero(host,'Inventaire · étape 1/3','Scannez l’article','Un scan suffit. StoreOps récupère l’article et le stock Dynamics en arrière-plan.',1,3);
}
function losses(){
 const page=q('#lossesPage');if(!MANAGER()||!page?.classList.contains('active'))return;
 const host=q('#lossesContent',page);if(!host)return;css();
 const create=q('.loss-create',host),rows=qa('.loss-row',host),pending=rows.find(x=>!x.classList.contains('done'));
 qa('.loss-kpis,.network-section-title',host).forEach(x=>x.classList.add('guided-hidden'));
 if(create){create.classList.add('guided-loss-create');hero(host,'Démarque','Enregistrer en quelques secondes','Scannez l’article, choisissez le motif et la quantité. StoreOps récupère le reste et prépare Dynamics.',1,3)}
 if(pending){const needsProof=!!q('[data-open-incident]',pending),needsApproval=!!q('[data-approve-loss]',pending),post=q('[data-post-loss]',pending);rows.forEach(x=>x.classList.toggle('guided-hidden',x!==pending));pending.classList.add('guided-focus');
   if(needsProof)hero(host,'Démarque · étape 2/3','Une preuve est nécessaire','Ajoutez uniquement la preuve demandée. Le reste de la fiche est déjà enregistré.',2,3);
   else if(needsApproval)hero(host,'Démarque · étape 2/3','Validation Direction nécessaire','Le montant dépasse le seuil magasin. La Direction valide, sans ressaisie.',2,3);
   else if(post)hero(host,'Démarque · étape 3/3','Prêt pour Dynamics','La sortie est complète. Elle peut être préparée pour Dynamics avec les autres mouvements.',3,3);
 }
}
function receipts(){
 const page=q('#receiptsPage');if(!MANAGER()||!page?.classList.contains('active'))return;
 const host=q('#receiptsContent',page);if(!host)return;css();
 const current=q('.manager-receipt-current',host),post=q('.manager-receipt-post-focus',host);
 if(current){const name=q('h4',current)?.textContent||'Article';const form=q('.quality-form',current);if(form){qa('.banner,.small.muted',form).forEach((x,i)=>{if(i>0)x.classList.add('guided-hidden')});hero(host,'Réception · contrôle article',name,'Saisissez uniquement ce qui doit être vérifié. Les champs inutiles restent hors du parcours.',2,3)}}
 if(post)hero(host,'Réception · étape 3/3','Réception prête','Tous les articles sont contrôlés. Confirmez une fois : StoreOps prépare ensuite la suite côté système.',3,3);
}
function run(){if(working)return;working=true;try{inventory();losses();receipts()}finally{working=false}}
function schedule(){clearTimeout(timer);timer=setTimeout(run,90)}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled']});
window.addEventListener('storeops:booted',schedule);document.addEventListener('DOMContentLoaded',schedule,{once:true});schedule();
