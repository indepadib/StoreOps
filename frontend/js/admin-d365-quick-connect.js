import {api} from './api.js';
import {isDirector,app} from './state.js';
import {esc,toast} from './ui.js';

const ID='d365QuickConnectStudio';
let busy=false,readiness=null;

function storeId(){return app.storeId||'val-fleuri'}
function host(){return document.getElementById('integrationsStudioSection')}
function line(name,result){
 const ok=result.status==='READY'||result.status==='SKIPPED';
 return `<div class="d365-quick-row ${ok?'ok':'warn'}"><span>${ok?'✓':'!'}</span><div><strong>${esc(name)}</strong><small>${esc(result.message)}</small></div></div>`
}
function renderResults(results,done=false){
 const box=document.getElementById('d365QuickConnectResult');if(!box)return;
 const allReady=results.length===3&&results.every(x=>x.status==='READY'||x.status==='SKIPPED');
 box.innerHTML=`${done?`<div class="banner ${allReady?'ban-ok':'ban-warn'}"><strong>${allReady?'Données D365 essentielles connectées':'Connexion D365 partiellement finalisée'}</strong><span>${allReady?'Business Pulse, Trade Agreements et PO ont chacun une preuve de lecture exploitable.':'Les flux non validés restent désactivés ou dégradés : aucun chiffre ni PO n’est inventé.'}</span></div>`:''}<div class="d365-quick-results">${results.map(x=>line(x.name,x)).join('')}</div>`
}
function progress(label,results){
 const box=document.getElementById('d365QuickConnectResult');if(!box)return;
 box.innerHTML=`<div class="banner ban-info"><strong>${esc(label)}</strong><span>StoreOps valide chaque flux avec les garde-fous D365. Cela peut prendre quelques secondes.</span></div><div class="d365-quick-results">${results.map(x=>line(x.name,x)).join('')}</div>`
}
async function run(){
 if(busy)return;busy=true;
 const button=document.getElementById('d365QuickConnectRun'),results=[],sid=storeId();
 if(button){button.disabled=true;button.textContent='Connexion D365 en cours…'}
 try{
  progress('1/3 · Business Pulse',results);
  if(readiness?.savedSalesMapping?.state==='LIVE')results.push({name:'Business Pulse / ventes',status:'SKIPPED',message:'Déjà LIVE.'});
  else{
   try{
    const sales=await api('/api/admin/integrations/d365-sales-mapping/auto-connect',{method:'POST',body:{storeId:sid}});
    results.push({name:'Business Pulse / ventes',status:sales?.activated?'READY':'FAILED',message:sales?.activated?'Mapping ventes validé et activé.':sales?.mapping?.smoke?.note||'Le smoke ventes n’a pas validé le mapping.'})
   }catch(e){results.push({name:'Business Pulse / ventes',status:'FAILED',message:e.message})}
  }

  progress('2/3 · Trade Agreements',results);
  try{
   const current=await api('/api/admin/integrations/d365-price-history-mapping');
   if(current?.mapping?.state==='LIVE')results.push({name:'Trade Agreements / historique prix',status:'SKIPPED',message:'Déjà LIVE.'});
   else{
    const price=await api('/api/admin/integrations/d365-price-history-mapping/auto-connect',{method:'POST',body:{}});
    results.push({name:'Trade Agreements / historique prix',status:price?.activated?'READY':'FAILED',message:price?.activated?`Source ${price?.mapping?.entity||'D365'} validée et activée.`:price?.mapping?.smoke?.note||'Le smoke prix n’a pas validé la source.'})
   }
  }catch(e){results.push({name:'Trade Agreements / historique prix',status:'FAILED',message:e.message})}

  progress('3/3 · Commandes fournisseurs',results);
  try{
   const po=await api(`/api/stores/${encodeURIComponent(sid)}/receipts/sync`,{method:'POST'}),sync=po?.sync||po||{};
   const count=Number(po?.items?.length??sync?.items?.length??0);
   results.push({name:'PO / réception',status:sync?.synced===true?'READY':'FAILED',message:sync?.synced===true?`${count} PO ouverte(s) détectée(s) pour ${sync?.warehouseId||'le magasin'}.`:sync?.error?.message||sync?.diagnostics?.code||'La lecture PO n’a pas été validée.'})
  }catch(e){results.push({name:'PO / réception',status:'FAILED',message:e.message})}

  readiness=await api(`/api/admin/integrations/d365-mapping/readiness?storeId=${encodeURIComponent(sid)}`).catch(()=>readiness);
  renderResults(results,true);
  const allReady=results.every(x=>x.status==='READY'||x.status==='SKIPPED');
  toast(allReady?'Connexion D365 essentielle terminée.':'Certains flux D365 demandent encore une correction.')
 }finally{
  busy=false;if(button&&button.isConnected){button.disabled=false;button.textContent='Connecter Business Pulse + prix + PO'}
 }
}
function render(){
 const h=host();if(!h)return;let root=document.getElementById(ID);
 if(!root){root=document.createElement('section');root.id=ID;root.className='d365-quick-connect';h.prepend(root)}
 root.innerHTML=`<div class="row"><div><div class="label">CONNEXION RAPIDE D365</div><h4>Finaliser les trois flux essentiels</h4><p class="small muted">Une seule action pour tester les ventes, les Trade Agreements et les PO. Chaque flux n’est activé que si son contrôle réel réussit.</p></div></div>${readiness?.canManage?'<button class="btn brand" id="d365QuickConnectRun">Connecter Business Pulse + prix + PO</button>':'<div class="banner ban-info"><strong>Lecture seule</strong><span>Seul un Administrateur StoreOps peut activer les mappings D365.</span></div>'}<div id="d365QuickConnectResult"></div>`;
 document.getElementById('d365QuickConnectRun')?.addEventListener('click',run)
}
async function mount(){
 if(!isDirector()||document.getElementById(ID)||!host())return;
 try{readiness=await api(`/api/admin/integrations/d365-mapping/readiness?storeId=${encodeURIComponent(storeId())}`);render()}catch(e){console.warn('D365 quick connect',e)}
}

const style=document.createElement('style');style.textContent=`.d365-quick-connect{margin-top:14px;padding:18px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,#fff,#fff8fa)}.d365-quick-connect h4{font-size:20px;margin:4px 0}.d365-quick-connect>.btn{margin-top:12px}.d365-quick-results{display:grid;gap:7px;margin-top:10px}.d365-quick-row{display:flex;gap:9px;align-items:flex-start;padding:10px;border:1px solid var(--line);border-radius:12px;background:#fff}.d365-quick-row>span{width:22px;height:22px;border-radius:8px;display:grid;place-items:center;font-weight:900;background:var(--brand-soft)}.d365-quick-row.ok>span{background:#e4f5ea;color:#187443}.d365-quick-row.warn>span{background:#fff0dd;color:#8b5600}.d365-quick-row strong,.d365-quick-row small{display:block}.d365-quick-row small{font-size:10px;color:var(--muted);margin-top:3px}#d365QuickConnectResult{margin-top:10px}@media(max-width:560px){.d365-quick-connect>.btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});queueMicrotask(mount);
