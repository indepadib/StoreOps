import { app } from './state.js';

const technicalPatterns=[/D365_CLIENT_SECRET/i,/Configuration Dynamics incomplète/i,/D365_CONFIG_INCOMPLETE/i,/D365_AUTH_FAILED/i,/Token Dynamics refusé/i,/Dynamics 5\d\d/i];
const itemNotFoundPatterns=[/Article introuvable/i,/ITEM_NOT_FOUND/i,/aucun article/i];
let lastErrorText='';

function isTechnical(text){return technicalPatterns.some(r=>r.test(String(text||'')))}
function isNotFound(text){return itemNotFoundPatterns.some(r=>r.test(String(text||'')))}
function pageButton(page,label){return `<button class="btn soft" data-manager-go="${page}">${label}</button>`}
function scannerErrorCopy(text){
 const director=app.user?.role==='ops_director';
 if(isTechnical(text))return{title:'Connexion articles indisponible',body:'StoreOps ne peut pas interroger Dynamics pour le moment. Aucune donnée article, prix ou stock n’est inventée.',action:director?pageButton('system','Voir l’état de Dynamics'):'<button class="btn soft" data-scan-focus>Réessayer</button>',hint:director?'Vérifiez le credential backend Dynamics dans Système.':'Le problème vient de la connexion système, pas du code-barres.'};
 if(isNotFound(text))return{title:'Article non reconnu',body:'Ce code-barres n’existe pas dans les données article disponibles pour ce magasin.',action:'<button class="btn soft" data-scan-focus>Scanner un autre article</button>',hint:'Vérifiez le code-barres ou la création de l’article dans Dynamics.'};
 return{title:'Impossible de lire cet article',body:'StoreOps n’a pas pu terminer la lecture. Réessayez sans perdre votre parcours.',action:'<button class="btn soft" data-scan-focus>Réessayer</button>',hint:'Si le problème persiste, l’administrateur peut consulter Système.'}
}
function normalizeError(){
 const box=document.querySelector('#managerScanResult .manager-scan-error');if(!box)return;
 const span=box.querySelector('span'),text=span?.textContent||'';if(!text||box.dataset.resilienceApplied==='1')return;
 lastErrorText=text;const copy=scannerErrorCopy(text);box.dataset.resilienceApplied='1';box.innerHTML=`<div class="scan-resilience-icon">!</div><strong>${copy.title}</strong><span>${copy.body}</span><small>${copy.hint}</small><div class="scan-resilience-actions">${copy.action}</div>`;
 box.querySelector('[data-scan-focus]')?.addEventListener('click',()=>{const input=document.getElementById('managerScanEan');box.innerHTML='';input?.focus()})
}
function enhancePartialResult(){
 const root=document.querySelector('#managerScanResult .manager-scan-result');if(!root||root.querySelector('.scan-partial-banner'))return;
 const text=root.textContent||'',unknownStock=/Entrepôt source\s*—|disponible\s*—|Stock.*—/i.test(text),unknownPrice=/Prix attendu\s*—/i.test(text);if(!unknownStock&&!unknownPrice)return;
 const banner=document.createElement('section');banner.className='scan-partial-banner';banner.innerHTML=`<strong>Données partielles</strong><span>${unknownPrice&&unknownStock?'Le prix et le stock temps réel ne sont pas disponibles.':unknownPrice?'Le prix temps réel n’est pas disponible.':'Le stock temps réel n’est pas disponible.'} Les champs inconnus restent « — » et ne sont jamais interprétés comme zéro.</span>`;root.prepend(banner)
}
function addScannerHelp(){
 const shell=document.querySelector('.manager-scan-shell');if(!shell||shell.querySelector('.scan-help-line'))return;
 const head=shell.querySelector('.manager-scan-head');if(!head)return;const line=document.createElement('div');line.className='scan-help-line';line.innerHTML='<span>1</span><strong>Scannez</strong><i>→</i><span>2</span><strong>Vérifiez</strong><i>→</i><span>3</span><strong>Agissez</strong>';head.after(line)
}
function run(){normalizeError();enhancePartialResult();addScannerHelp()}
function installCss(){if(document.getElementById('scannerResilienceStyles'))return;const s=document.createElement('style');s.id='scannerResilienceStyles';s.textContent=`.scan-resilience-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:#fff0f3;color:#b00035;font-weight:900;font-size:20px;margin:0 auto 8px}.manager-scan-error small{display:block;color:var(--muted);margin-top:6px}.scan-resilience-actions{margin-top:12px;display:flex;justify-content:center}.scan-partial-banner{border:1px solid #ecd6ad;background:#fff9ed;border-radius:15px;padding:12px 13px;margin:0 0 10px;display:grid;gap:3px}.scan-partial-banner strong{font-size:12px}.scan-partial-banner span{font-size:11px;color:#715a33;line-height:1.4}.scan-help-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:-4px 0 12px;color:var(--muted);font-size:10px}.scan-help-line span{width:21px;height:21px;border-radius:999px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);font-weight:900}.scan-help-line strong{font-size:10px}.scan-help-line i{font-style:normal;opacity:.45}@media(max-width:640px){.scan-help-line{justify-content:center}}`;document.head.appendChild(s)}

installCss();
new MutationObserver(run).observe(document.body,{childList:true,subtree:true,characterData:true});
run();
window.STOREOPS_SCAN_DIAGNOSTIC=()=>({lastErrorText,technical:isTechnical(lastErrorText)});
