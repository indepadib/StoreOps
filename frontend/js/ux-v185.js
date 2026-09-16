import {app,isDirector} from './state.js';

const GROUPS=[
  ['Pilotage',[['today','Aujourd’hui'],['network','Réseau'],['development','Développement']]],
  ['Opérations',[['opening','Ouverture'],['handover','Passation'],['staffing','Équipe & prise de poste'],['commercial','Prix & promotions'],['receipts','Réception'],['inventory','Stock & inventaire'],['losses','Démarque & pertes'],['quality','Qualité'],['maintenance','Maintenance'],['incidents','Incidents'],['cash','Caisses & clôture'],['closing','Fermeture']]],
  ['Administration',[['adminStudio','Admin Studio'],['system','Système & intégrations']]]
];

let palette=null,input=null,list=null;
function pageButton(page){return document.querySelector(`#nav button[data-page="${page}"]`)}
function go(page){const b=pageButton(page);if(b)b.click()}
function initials(){const name=String(app.user?.name||'StoreOps').trim();return name.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')||'SO'}
function roleClass(){document.body.classList.toggle('director-mode',!!isDirector());document.body.classList.toggle('storeops-ux-v185',true)}

function ensureAvatar(){const controls=document.querySelector('.top-controls');if(!controls||document.getElementById('uxUserBadge'))return;const badge=document.createElement('button');badge.id='uxUserBadge';badge.type='button';badge.className='ux-user-badge';badge.title=app.user?.name||'Profil';badge.innerHTML=`<span>${initials()}</span><small>${String(app.user?.name||'Profil')}</small>`;controls.appendChild(badge)}

function visibleCommands(){const out=[];for(const [group,items] of GROUPS){for(const [page,label] of items){const b=pageButton(page);if(!b||b.hidden)continue;out.push({group,page,label})}}return out}
function renderCommands(query=''){if(!list)return;const q=String(query||'').trim().toLowerCase(),rows=visibleCommands().filter(x=>!q||`${x.group} ${x.label}`.toLowerCase().includes(q));if(!rows.length){list.innerHTML='<div class="ux-command-empty">Aucun écran correspondant.</div>';return}let current='';list.innerHTML=rows.map(x=>{const head=x.group!==current?(current=x.group,`<div class="ux-command-group">${x.group}</div>`):'';return `${head}<button class="ux-command-item" data-ux-go="${x.page}"><span><strong>${x.label}</strong><small>${x.group}</small></span><span>↵</span></button>`}).join('');list.querySelectorAll('[data-ux-go]').forEach(b=>b.onclick=()=>{closePalette();go(b.dataset.uxGo)})}
function closePalette(){if(palette)palette.hidden=true}
function openPalette(){if(!palette)return;palette.hidden=false;renderCommands(input?.value||'');requestAnimationFrame(()=>input?.focus())}
function ensurePalette(){if(document.getElementById('uxCommandPalette')){palette=document.getElementById('uxCommandPalette');input=document.getElementById('uxCommandInput');list=document.getElementById('uxCommandList');return}palette=document.createElement('div');palette.id='uxCommandPalette';palette.className='ux-command-backdrop';palette.hidden=true;palette.innerHTML=`<div class="ux-command-panel" role="dialog" aria-modal="true" aria-label="Aller à"><div class="ux-command-search"><span>⌕</span><input id="uxCommandInput" autocomplete="off" placeholder="Chercher un écran ou une action…"><kbd>Esc</kbd></div><div class="ux-command-list" id="uxCommandList"></div></div>`;document.body.appendChild(palette);input=document.getElementById('uxCommandInput');list=document.getElementById('uxCommandList');input?.addEventListener('input',()=>renderCommands(input.value));palette.addEventListener('click',e=>{if(e.target===palette)closePalette()})}
function ensureCommandTrigger(){if(!isDirector())return;const controls=document.querySelector('.top-controls');if(!controls||document.getElementById('uxCommandTrigger'))return;const b=document.createElement('button');b.id='uxCommandTrigger';b.type='button';b.className='btn ghost ux-command-trigger';b.innerHTML='<span>⌕ Aller à</span><kbd>⌘K</kbd>';b.onclick=openPalette;controls.prepend(b)}
function simplifyDirectorNav(){if(!isDirector())return;const nav=document.getElementById('nav');if(!nav)return;const allowed=new Set(['today','network','development','adminStudio']);nav.querySelectorAll('button[data-page]').forEach(b=>b.hidden=!allowed.has(b.dataset.page));const labels={today:'Aujourd’hui',network:'Réseau',development:'Développement',adminStudio:'Admin'};for(const [p,l] of Object.entries(labels)){const b=pageButton(p);if(b)b.textContent=l}}
function keyboard(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette?.hidden?openPalette():closePalette()}else if(e.key==='Escape')closePalette()}
function refreshShell(){roleClass();ensurePalette();ensureCommandTrigger();ensureAvatar();simplifyDirectorNav()}

refreshShell();document.addEventListener('keydown',keyboard);window.addEventListener('storeops:booted',()=>setTimeout(refreshShell,0));new MutationObserver(()=>{clearTimeout(window.__ux185t);window.__ux185t=setTimeout(refreshShell,40)}).observe(document.body,{subtree:true,childList:true});
