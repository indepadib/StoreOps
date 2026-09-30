import {api} from '../api.js';
import {app} from '../state.js';
import {$,esc,toast} from '../ui.js';

let data=null,lastResult=null,filter='ALL',query='';
const n=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:0});
const pct=v=>v==null?'—':(Number(v)*100).toLocaleString('fr-FR',{maximumFractionDigits:1})+'%';
const authLabel=v=>v==='CLIENT_CREDENTIALS'?'Client ID / Secret':v==='STATIC_BEARER'?'Bearer manuel':'Non configurée';

function ensureStyles(){
 if(document.querySelector('#glovoOpsStyles'))return;
 const s=document.createElement('style');s.id='glovoOpsStyles';s.textContent=`
 .glovo-readiness{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.glovo-readiness>div{border:1px solid var(--line);background:#fff;border-radius:14px;padding:11px}.glovo-readiness span{display:block;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:850}.glovo-readiness strong{display:block;font-size:13px;margin-top:4px}.glovo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.glovo-actions .btn{min-height:42px}.glovo-filterbar{display:grid;grid-template-columns:1fr auto;gap:8px;margin:14px 0}.glovo-filterbar input{width:100%;min-height:44px;border:1px solid var(--line);border-radius:12px;padding:0 12px;background:#fff}.glovo-filters{display:flex;gap:6px}.glovo-filters button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 10px;font-weight:800;font-size:11px}.glovo-filters button.active{background:#231b1f;color:#fff;border-color:#231b1f}.glovo-result{border:1px solid #cae8d3;background:#f5fbf7;border-radius:14px;padding:11px 12px;margin:10px 0}.glovo-result strong{display:block}.glovo-result small{display:block;color:var(--muted);margin-top:3px}.channel-row b.on{color:#087b41}.channel-row b.off{color:#a3163c}.glovo-warning{border:1px solid #f0d6a5;background:#fff9ef;border-radius:14px;padding:11px 12px;margin:10px 0}.glovo-warning strong,.glovo-warning span{display:block}.glovo-warning span{font-size:11px;color:var(--muted);margin-top:3px}
 @media(max-width:760px){.glovo-readiness{grid-template-columns:1fr 1fr}.glovo-filterbar{grid-template-columns:1fr}.glovo-filters{overflow:auto}}
 `;document.head.appendChild(s);
}

function visibleItems(){
 const q=query.trim().toLowerCase();
 return (data?.items||[]).filter(x=>(filter==='ALL'||(filter==='ON'&&x.active)||(filter==='OFF'&&!x.active))&&(!q||String(x.sku||'').toLowerCase().includes(q)||String(x.name||'').toLowerCase().includes(q)||String(x.barcode||'').toLowerCase().includes(q)));
}
function renderList(){
 const host=$('#glovoList'),count=$('#glovoListCount');if(!host)return;
 const rows=visibleItems(),shown=rows.slice(0,300);if(count)count.textContent=`${shown.length}${rows.length>shown.length?' / '+rows.length:''} affiché(s)`;
 host.innerHTML=shown.length?shown.map(x=>`<div class="channel-row"><span><strong>${esc(x.name||x.sku)}</strong><small>${esc(x.sku)}${x.barcode?` · ${esc(x.barcode)}`:''}</small></span><b class="${x.active?'on':'off'}">${x.active?'Disponible':'Indisponible'}</b></div>`).join(''):'<div class="growth-error">Aucun article pour ce filtre.</div>';
}
function draw(){
 ensureStyles();const host=$('#channelAvailabilityContent');if(!host||!data)return;
 const s=data.summary||{},cfg=data.integration||{},catalog=data.catalog||{},d=data.diagnostics||{},mappingOk=Number(d.catalogMatchedStockRows||0)>0;
 host.innerHTML=`<div class="growth-shell">
  <div class="manager-hub-head"><span class="manager-eyebrow">CANAL E-COMMERCE · GLOVO</span><h2>Disponibilité Glovo pilotée par le stock magasin.</h2><p>StoreOps lit Dynamics, applique le catalogue autorisé et ne transmet à Glovo que <strong>SKU + Disponible / Indisponible</strong>.</p></div>
  <div class="privacy-banner"><div><span>PRIVACY MODE</span><strong>La quantité réelle ne sort jamais de StoreOps</strong><small>Payload officiel Catalog API : sku + active uniquement dans notre intégration.</small></div><b>✓</b></div>
  <div class="growth-kpis"><div><span>Disponibles</span><strong>${n(s.available)}</strong><small>actifs côté canal</small></div><div><span>Indisponibles</span><strong>${n(s.unavailable)}</strong><small>désactivés côté canal</small></div><div><span>Catalogue Glovo</span><strong>${n(s.total)}</strong><small>${catalog.version?`whitelist · ${esc(catalog.version)}`:'SKU autorisés'}</small></div></div>
  <div class="glovo-readiness">
   <div><span>Stock Dynamics</span><strong>${esc(d.stockStatus||data.status||'—')}</strong></div>
   <div><span>Correspondance catalogue</span><strong>${n(d.catalogMatchedStockRows)} / ${n(catalog.allowedSkus)} · ${pct(d.catalogMatchRatio)}</strong></div>
   <div><span>Vendor Glovo</span><strong>${cfg.vendorId?esc(cfg.vendorId):'À renseigner'}</strong></div>
   <div><span>Authentification</span><strong>${esc(authLabel(cfg.authMode))}</strong></div>
  </div>
  ${!mappingOk&&data.status==='READY'?'<div class="glovo-warning"><strong>Synchronisation bloquée par sécurité</strong><span>Aucun SKU du catalogue Glovo ne correspond au snapshot stock. Vérifier le mapping article avant tout push.</span></div>':''}
  <section class="channel-card"><div><span class="manager-eyebrow">CONNEXION GLOVO · SANS ÉCRITURE</span><strong>${cfg.credentialsReady?'Paramètres suffisants pour tester':'Configuration à compléter'}</strong><p>${cfg.credentialsReady?'StoreOps peut interroger le Catalog API pour vérifier Chain ID, Vendor ID et authentification sans modifier le catalogue.':'Renseigner Chain ID, Vendor ID et l’authentification Glovo côté serveur / Netlify.'}</p><small>Chain : ${esc(cfg.chainId||'—')} · API : ${esc(cfg.apiBaseUrl||'—')}</small><div class="glovo-actions"><button id="verifyGlovo" class="btn soft" ${cfg.credentialsReady?'':'disabled'}>Tester la connexion</button></div></div><span class="pill">${cfg.credentialsReady?'À tester':'Incomplet'}</span></section>
  <section class="channel-card"><div><span class="manager-eyebrow">PUSH DISPONIBILITÉ</span><strong>${cfg.ready?'Push activé':'Push verrouillé'}</strong><p>${cfg.ready?'Le bouton envoie le catalogue autorisé en mise à jour asynchrone.':'Après validation du test/sandbox, activer GLOVO_PUSH_ENABLED=1. Tant que ce flag reste à 0, aucun push Glovo n’est possible.'}</p><div class="glovo-actions"><button id="syncGlovo" class="btn brand" ${cfg.ready&&mappingOk?'':'disabled'}>Synchroniser la disponibilité</button></div></div><span class="pill">${cfg.pushEnabled?'Activé':'Sécurité ON'}</span></section>
  <section class="channel-card"><div><span class="manager-eyebrow">API STOREOPS OPTIONNELLE · LECTURE SEULE</span><strong>${cfg.partnerPullConfigured?'Endpoint sécurisé prêt':'Endpoint fermé'}</strong><p>À utiliser uniquement si Glovo ou un middleware souhaite venir lire la disponibilité depuis StoreOps. Ce flux reste séparé du Partner API/Catalog officiel.</p><small>${esc(cfg.partnerEndpoint||'')}</small></div><span class="pill">${cfg.partnerPullConfigured?'Bearer requis':'Désactivé'}</span></section>
  ${lastResult?`<div class="glovo-result"><strong>${esc(lastResult.title)}</strong><small>${esc(lastResult.detail)}</small></div>`:''}
  <div class="glovo-filterbar"><input id="glovoSearch" value="${esc(query)}" placeholder="Rechercher SKU, article ou EAN"><div class="glovo-filters"><button data-glovo-filter="ALL" class="${filter==='ALL'?'active':''}">Tous</button><button data-glovo-filter="ON" class="${filter==='ON'?'active':''}">Disponibles</button><button data-glovo-filter="OFF" class="${filter==='OFF'?'active':''}">Indisponibles</button></div></div>
  <div class="row" style="margin:4px 0 8px"><strong>Catalogue magasin</strong><span class="small muted" id="glovoListCount"></span></div><div class="channel-list" id="glovoList"></div>
  <div class="growth-trust">Buffer interne : ${d.safetyBuffer??0} · entrepôt magasin : ${esc(d.warehouseId||'—')} · quantité brute exposée : non.</div>
 </div>`;
 $('#verifyGlovo')?.addEventListener('click',verify);
 $('#syncGlovo')?.addEventListener('click',sync);
 $('#glovoSearch')?.addEventListener('input',e=>{query=e.target.value||'';renderList()});
 document.querySelectorAll('[data-glovo-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.glovoFilter||'ALL';draw()}));
 renderList();
}
async function verify(){
 const b=$('#verifyGlovo');if(b?.disabled)return;b.disabled=true;const old=b.textContent;b.textContent='Test en cours…';
 try{const r=await api(`/api/stores/${app.storeId}/channels/glovo/verify`,{method:'POST'});lastResult={title:'Connexion Glovo validée',detail:`HTTP ${r.httpStatus||200} · Vendor ${r.vendorId||'—'} · ${r.authMode||'auth OK'}`};toast('Connexion Glovo validée.');draw()}catch(e){lastResult={title:'Connexion Glovo refusée',detail:e.message};toast(e.message);draw()}finally{if(b&&document.body.contains(b)){b.disabled=false;b.textContent=old}}
}
async function sync(){
 const b=$('#syncGlovo');if(b?.disabled)return;b.disabled=true;const old=b.textContent;b.textContent='Synchronisation…';
 try{const r=await api(`/api/stores/${app.storeId}/channels/glovo/sync`,{method:'POST'});lastResult={title:'Synchronisation envoyée à Glovo',detail:`${r.sentProducts||0} SKU · job ${r.jobId||'sans identifiant'} · statut ${r.jobStatus||r.status||'QUEUED'}`};toast(`Glovo : ${r.sentProducts||0} disponibilités envoyées.`);await renderChannelAvailability()}catch(e){lastResult={title:'Synchronisation non envoyée',detail:e.message};toast(e.message);draw()}finally{if(b&&document.body.contains(b)){b.disabled=false;b.textContent=old}}
}
export async function renderChannelAvailability(){
 const host=$('#channelAvailabilityContent');if(host)host.innerHTML='<div class="growth-loading">Préparation de la disponibilité Glovo…</div>';
 try{data=await api(`/api/stores/${app.storeId}/channels/glovo`);draw()}catch(e){if(host)host.innerHTML=`<div class="growth-error">${esc(e.message)}</div>`;toast(e.message)}
}
