import './mobile-barcode.js';

const bannerId='storeopsConnectivity';
function banner(){let el=document.getElementById(bannerId);if(el)return el;el=document.createElement('div');el.id=bannerId;el.className='banner ban-danger storeops-connectivity';el.hidden=true;el.style.margin='12px 0 0';el.setAttribute('role','status');el.setAttribute('aria-live','polite');const shell=document.querySelector('.app-shell'),nav=document.querySelector('.nav');if(shell&&nav)shell.insertBefore(el,nav);else document.body.prepend(el);return el}
function renderConnectivity(){const el=banner();if(navigator.onLine){el.hidden=true;el.textContent='';return}const showcase=(window.STOREOPS_CONFIG?.mode||'showcase')==='showcase'||!window.STOREOPS_CONFIG?.apiBase;el.hidden=false;el.innerHTML=showcase?'<strong>Mode hors ligne</strong><div class="small">Le Showcase reste utilisable localement. Les données Dynamics réelles ne sont pas disponibles.</div>':'<strong>Connexion réseau perdue</strong><div class="small">Aucune validation métier n’est mise en attente silencieusement. Reconnecte le terminal avant de valider une opération nécessitant le backend.</div>'}
window.addEventListener('online',renderConnectivity);window.addEventListener('offline',renderConnectivity);renderConnectivity();
// Pilote V1.54 : le service worker est volontairement désactivé pour éliminer tout mélange de versions Safari.
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.getRegistrations().then(rows=>Promise.all(rows.map(r=>r.unregister().catch(()=>false)))).catch(()=>{}));
