import {api} from '../api.js';
import {app} from '../state.js';
import {$,esc,toast} from '../ui.js';

let data=null;
const n=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:0});
function draw(){
 const host=$('#channelAvailabilityContent');if(!host||!data)return;const s=data.summary||{},cfg=data.integration||{},catalog=data.catalog||{};
 host.innerHTML=`<div class="growth-shell"><div class="manager-hub-head"><span class="manager-eyebrow">CANAL E-COMMERCE · GLOVO</span><h2>Partager la disponibilité, jamais votre stock.</h2><p>StoreOps lit Dynamics en interne et transforme le stock en un simple statut Disponible / Indisponible.</p></div><div class="privacy-banner"><div><span>PRIVACY MODE</span><strong>Quantités jamais partagées avec Glovo</strong><small>Payload sortant : SKU + active uniquement.</small></div><b>✓</b></div><div class="growth-kpis"><div><span>Disponibles</span><strong>${n(s.available)}</strong><small>actifs côté canal</small></div><div><span>Indisponibles</span><strong>${n(s.unavailable)}</strong><small>désactivés côté canal</small></div><div><span>Catalogue Glovo</span><strong>${n(s.total)}</strong><small>${catalog.version?`whitelist · ${esc(catalog.version)}`:'SKU autorisés'}</small></div></div><section class="channel-card"><div><span class="manager-eyebrow">API PARTENAIRE · LECTURE SEULE</span><strong>${cfg.partnerPullConfigured?'Endpoint sécurisé prêt':'Token partenaire à configurer'}</strong><p>${cfg.partnerPullConfigured?'Glovo peut lire SKU + disponible/indisponible via Bearer token. Aucune quantité et aucun accès StoreOps.':'Le endpoint est déjà codé mais reste fermé tant que GLOVO_READ_API_KEY n’est pas configuré côté serveur.'}</p><small>${esc(cfg.partnerEndpoint||'')}</small></div><span class="pill">${cfg.partnerPullConfigured?'Sécurisé':'Fermé'}</span></section><section class="channel-card"><div><span class="manager-eyebrow">SYNCHRONISATION</span><strong>${cfg.ready?'Connexion prête':'Connexion à finaliser'}</strong><p>${cfg.ready?'Le bouton envoie uniquement les statuts active=true/false.':'Chain ID, Vendor ID et token Glovo doivent être renseignés côté serveur. Aucun secret n’est exposé ici.'}</p></div><button id="syncGlovo" class="btn brand" ${cfg.ready?'':'disabled'}>Synchroniser la disponibilité</button></section><div class="channel-list">${(data.items||[]).slice(0,120).map(x=>`<div class="channel-row"><span><strong>${esc(x.name||x.sku)}</strong><small>${esc(x.sku)}${x.barcode?` · ${esc(x.barcode)}`:''}</small></span><b class="${x.active?'on':'off'}">${x.active?'Disponible':'Indisponible'}</b></div>`).join('')}</div><div class="growth-trust">Buffer de sécurité interne : ${data.diagnostics?.safetyBuffer??0}. La quantité réelle reste dans StoreOps/Dynamics.</div></div>`;
 $('#syncGlovo')?.addEventListener('click',sync);
}
async function sync(){
 const b=$('#syncGlovo');if(b?.disabled)return;b.disabled=true;const old=b.textContent;b.textContent='Synchronisation…';
 try{const r=await api(`/api/stores/${app.storeId}/channels/glovo/sync`,{method:'POST'});toast(`Glovo : ${r.sentProducts||0} disponibilités envoyées.`);await renderChannelAvailability()}catch(e){toast(e.message)}finally{if(b&&document.body.contains(b)){b.disabled=false;b.textContent=old}}
}
export async function renderChannelAvailability(){
 const host=$('#channelAvailabilityContent');if(host)host.innerHTML='<div class="growth-loading">Préparation de la disponibilité Glovo…</div>';
 try{data=await api(`/api/stores/${app.storeId}/channels/glovo`);draw()}catch(e){if(host)host.innerHTML=`<div class="growth-error">${esc(e.message)}</div>`;toast(e.message)}
}
