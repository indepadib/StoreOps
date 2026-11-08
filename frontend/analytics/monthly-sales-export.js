const core=window.RETAIL_INTELLIGENCE;
const button=document.getElementById('fullExportBtn');

const safeCell=value=>{
 const raw=value===null||value===undefined?'':String(value);
 const protectedValue=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+protectedValue.replaceAll('"','""')+'"';
};
function toast(message){
 const el=document.getElementById('toast');if(!el)return;
 el.textContent=message;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),3600);
}
function daysBetween(start,end){
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.floor((b-a)/86400000)+1:null;
}
function csvFrom(data){
 const columns=Array.isArray(data?.columns)?data.columns:[],rows=Array.isArray(data?.rows)?data.rows:[];
 return '\ufeff'+[columns.map(c=>c.label),...rows.map(row=>columns.map(c=>row[c.key]))].map(row=>row.map(safeCell).join(';')).join('\r\n');
}
async function saveCsv(text,filename){
 const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),file=new File([blob],filename,{type:'text/csv;charset=utf-8'});
 if(navigator.share&&navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:'StoreOps Analytics · ventes complètes N / N-1',text:'Export mensuel complet des ventes'});return'SHARED'}
  catch(error){if(error?.name==='AbortError')return'CANCELLED'}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);return'DOWNLOADED'
}
async function run(){
 if(!core||!button)return;
 const state=core.getState(),days=daysBetween(state.periodStart,state.periodEnd);
 if(!days||days>31){toast('Sélectionne une période de 1 à 31 jours pour l’export mensuel complet.');return}
 const stores=core.getSelectedStores(),ids=stores.map(s=>s.id).join(',');
 const old=button.innerHTML;button.disabled=true;button.textContent='Préparation du dataset…';
 try{
  const params=new URLSearchParams({start:state.periodStart,end:state.periodEnd});
  if(ids)params.set('storeIds',ids);
  const data=await core.api('/api/analytics/monthly-export?'+params.toString());
  if(!data?.rows?.length)throw new Error(data?.message||'Aucune vente à exporter sur cette période.');
  button.textContent='Génération Excel…';
  const scope=stores.length===1?(stores[0].code||stores[0].id):'reseau';
  const result=await saveCsv(csvFrom(data),'StoreOps-Analytics-ventes-completes-N-N1-'+scope+'-'+state.periodStart+'-'+state.periodEnd+'.csv');
  if(result!=='CANCELLED')toast((data.summary?.rows||data.rows.length)+' lignes exportées · hiérarchie + N-1 + paniers + poids CA.');
 }catch(error){
  console.error('Full monthly sales export failed',error);
  toast(error?.message||'Impossible de générer l’export complet.');
 }finally{button.disabled=false;button.innerHTML=old}
}
button?.addEventListener('click',run);
