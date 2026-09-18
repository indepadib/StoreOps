import {api} from './api.js';

const modulePages={DEVELOPMENT:['development'],QUALITY:['quality'],MAINTENANCE:['maintenance'],CASH:['cash','cashOpening'],WORKFORCE:['staffing','managerTeam'],REPLENISHMENT:['receipts','inventory'],ADMIN_STUDIO:['adminStudio'],OPERATIONS:['opening','closing','handover'],SCANNER:['managerScan']};
function hexSoft(hex){const h=hex.replace('#','');if(h.length!==6)return'#fff1f5';const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));return`rgb(${Math.round(r+(255-r)*.9)},${Math.round(g+(255-g)*.9)},${Math.round(b+(255-b)*.9)})`}
export async function applyTenantBranding(){try{const p=await api('/api/tenant/profile');document.documentElement.style.setProperty('--brand',p.accentColor);document.documentElement.style.setProperty('--brand-soft',hexSoft(p.accentColor));document.title=`${p.brandName} ${p.appName}`;const brand=document.querySelector('.brand strong');if(brand)brand.innerHTML=`${p.brandName} <span>${p.appName}</span>`;for(const [module,pages] of Object.entries(modulePages)){if(p.modules?.[module]!==false)continue;for(const page of pages){document.querySelectorAll(`[data-page="${page}"]`).forEach(x=>x.hidden=true)}}window.STOREOPS_TENANT=p;return p}catch{return null}}
function brandingAuthReady(){return !!(sessionStorage.getItem('storeops_access_token')||sessionStorage.getItem('storeops_local_authorization'))}
function scheduleTenantBranding(){
 const showcase=(window.STOREOPS_CONFIG?.mode||'showcase')==='showcase'||!window.STOREOPS_CONFIG?.apiBase;
 if(showcase||brandingAuthReady())return applyTenantBranding();
 window.addEventListener('storeops:booted',()=>applyTenantBranding(),{once:true});
 return null
}
scheduleTenantBranding();
