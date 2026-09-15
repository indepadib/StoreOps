import {api} from './api.js';
import {isDirector,app} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='d365MappingStudio';
let busy=false,last=null;

function tone(c){return c==='HIGH'?'ok':c==='MEDIUM'?'info':c==='LOW'?'warn':'neutral'}
function conf(c){return({HIGH:'Fort',MEDIUM:'Moyen',LOW:'Faible',NONE:'Non trouvé'})[c]||c}
function fieldCard(label,x){return `<div class="integration-map-field"><span>${esc(label)}</span><strong>${esc(x?.candidate||'Non identifié')}</strong>${status(conf(x?.confidence||'NONE'),tone(x?.confidence||'NONE'))}</div>`}
function selectedStore(){return app.storeId||'val-fleuri'}
function findHost(){return document.getElementById('integrationsStudioSection')}

async function loadReadiness(){try{return await api(`/api/admin/integrations/d365-mapping/readiness?storeId=${encodeURIComponent(selectedStore())}`)}catch{return null}}
function renderReadiness(r){
 const host=findHost();if(!host||host.querySelector(`#${ID}`))return;
 const section=document.createElement('div');section.id=ID;section.className='integration-d365-mapping';
 section.innerHTML=`<div class="row"><div><div class="label">DONNÉES D365 À FINALISER</div><h4>Identifier ventes, coût & historique prix</h4><p class="small muted">StoreOps sonde uniquement quelques lignes. Aucun mapping, aucune variable Netlify et aucun write ERP ne sont modifiés automatiquement.</p></div>${status(r?.mode==='live'?'D365 connecté':'Probe désactivé',r?.mode==='live'?'ok':'neutral')}</div><div class="integration-d365-summary"><div><span>Magasin</span><strong>${esc(r?.storeId||'—')}</strong></div><div><span>Retail Channel</span><strong>${esc(r?.retailChannelId||'—')}</strong></div><div><span>Entité ventes candidate</span><strong>${esc(r?.sales?.entity||'—')}</strong></div><div><span>Marge</span><strong>${r?.sales?.configuredFields?.cost?'Champ coût configuré':'Coût non identifié'}</strong></div></div><button class="btn brand" id="${ID}Run">Analyser les entités D365</button><div id="${ID}Result" style="margin-top:12px"></div>`;
 host.appendChild(section);section.querySelector(`#${ID}Run`)?.addEventListener('click',run)
}
function renderResult(d){
 const root=document.getElementById(`${ID}Result`);if(!root)return;
 if(d.status==='DISABLED'){root.innerHTML=`<div class="banner ban-info"><strong>Diagnostic externe désactivé</strong><span>${esc(d.message||'D365_MODE non LIVE.')}</span></div>`;return}
 const best=d.domains?.sales?.find(x=>x.entity===d.recommendation?.salesEntity)||d.domains?.sales?.find(x=>x.ok)||null,fields=best?.inference?.fields||{};
 root.innerHTML=`<div class="banner ${d.recommendation?.marginReady?'ban-ok':'ban-warn'}"><strong>${d.recommendation?.salesEntity?`Entité ventes détectée : ${esc(d.recommendation.salesEntity)}`:'Aucune entité ventes exploitable détectée'}</strong><span>${d.recommendation?.marginReady?'Un champ coût candidat existe : la marge peut passer à l’étape de validation métier.':'Aucun coût fiable n’a été détecté : StoreOps continue volontairement à ne pas afficher de marge calculée.'}</span></div>${best?`<div class="integration-map-grid">${fieldCard('Canal / magasin',fields.channel)}${fieldCard('Business date',fields.businessDate)}${fieldCard('Ticket',fields.transaction)}${fieldCard('Article',fields.product)}${fieldCard('CA TTC / montant',fields.net)}${fieldCard('Quantité',fields.quantity)}${fieldCard('Coût',fields.cost)}${fieldCard('Heure',fields.time)}</div><details class="integration-mapping-raw"><summary>Voir les champs réellement retournés</summary><div class="small muted">${best.inference.keys.map(esc).join(' · ')||'Aucun champ'}</div></details>`:''}<div class="integration-probe-list">${(d.domains?.price||[]).map(p=>`<div><strong>${esc(p.entity)}</strong>${status(p.ok?`${p.rowCount} ligne(s)`:'Indisponible',p.ok?'ok':'neutral')}<small>${p.error?esc(p.error):`Prix candidat : ${esc(p.inference?.fields?.price?.candidate||'non identifié')} · Début : ${esc(p.inference?.fields?.validFrom?.candidate||'—')} · Fin : ${esc(p.inference?.fields?.validTo?.candidate||'—')}`}</small></div>`).join('')}</div><div class="small muted" style="margin-top:10px">Diagnostic uniquement. Pour passer un mapping LIVE, on fera ensuite un smoke sur une journée / un article de contrôle et on comparera avec Dynamics.</div>`;
}
async function run(){
 if(busy)return;busy=true;const b=document.getElementById(`${ID}Run`);if(b){b.disabled=true;b.textContent='Analyse…'}
 try{last=await api('/api/admin/integrations/d365-mapping/diagnose',{method:'POST',body:{storeId:selectedStore()}});renderResult(last)}catch(e){const r=document.getElementById(`${ID}Result`);if(r)r.innerHTML=`<div class="banner ban-danger"><strong>Diagnostic impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}finally{busy=false;if(b){b.disabled=false;b.textContent='Analyser les entités D365'}}
}
async function mount(){
 if(!isDirector())return;const host=findHost();if(!host||host.querySelector(`#${ID}`))return;
 const r=await loadReadiness();renderReadiness(r)
}

const style=document.createElement('style');style.textContent=`.integration-d365-mapping{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,#fff,#fbf8f9)}.integration-d365-mapping h4{font-size:20px;margin:4px 0}.integration-d365-summary,.integration-map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.integration-d365-summary>div,.integration-map-field{padding:10px;border-radius:13px;background:#f7f4f5}.integration-d365-summary span,.integration-map-field>span{display:block;font-size:9px;color:var(--muted)}.integration-d365-summary strong,.integration-map-field strong{display:block;font-size:11px;margin:3px 0}.integration-probe-list{display:grid;gap:7px;margin-top:10px}.integration-probe-list>div{padding:10px;border:1px solid var(--line);border-radius:12px}.integration-probe-list strong,.integration-probe-list small{display:block}.integration-probe-list small{font-size:10px;color:var(--muted);margin-top:4px}.integration-mapping-raw{margin-top:10px}@media(max-width:800px){.integration-d365-summary,.integration-map-grid{grid-template-columns:1fr 1fr}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});queueMicrotask(mount);
