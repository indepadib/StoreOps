const core=window.RETAIL_INTELLIGENCE;
const button=document.getElementById('fullExportBtn');

const safeCell=value=>{
 const raw=value===null||value===undefined||value===''?'N/D':String(value);
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
 const values=row=>Array.isArray(row)?row:columns.map(c=>row[c.key]);
 return '\ufeff'+[columns.map(c=>c.label),...rows.map(values)].map(row=>row.map(safeCell).join(';')).join('\r\n');
}
async function saveCsv(text,filename){
 const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),file=new File([blob],filename,{type:'text/csv;charset=utf-8'});
 if(navigator.share&&navigator.canShare?.({files:[file]})){
  try{await navigator.share({files:[file],title:'StoreOps Analytics · ventes complètes période / comparaison',text:'Export complet des ventes selon la comparaison active'});return'SHARED'}
  catch(error){if(error?.name==='AbortError')return'CANCELLED'}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);return'DOWNLOADED'
}
async function run(){
 if(!core||!button)return;
 const state=core.getState(),days=daysBetween(state.periodStart,state.periodEnd);
 if(!days||days>31){toast('Sélectionne une période de 1 à 31 jours pour l’export mensuel complet.');return}
 const stores=core.getSelectedStores();
 if(!stores.length){toast('Sélectionne au moins un magasin.');return}
 const old=button.innerHTML;button.disabled=true;button.textContent='Préparation de l’export…';
 try{
  const base={start:state.periodStart,end:state.periodEnd,compareStart:state.compareStart,compareEnd:state.compareEnd,comparisonMode:state.comparisonMode||'custom',compact:'1'};
  let columns=null,rows=[],basketReady=0,basketExpected=0;
  for(let i=0;i<stores.length;i++){
   const store=stores[i],params=new URLSearchParams({...base,storeIds:store.id,scope:'stores'});
   button.textContent='Préparation '+(i+1)+'/'+stores.length+' · '+(store.code||store.name);
   const part=await core.api('/api/analytics/monthly-export?'+params.toString());
   if(!columns?.length&&part?.columns?.length)columns=part.columns;
   rows.push(...(part?.rows||[]));
   basketReady+=Number(part?.diagnostics?.basketCurrentReady||0)+Number(part?.diagnostics?.basketComparisonReady||0);
   basketExpected+=2
  }
  let networkIncluded=false;
  if(stores.length>1){
   button.textContent='Consolidation réseau…';
   try{
    const params=new URLSearchParams({...base,storeIds:stores.map(s=>s.id).join(','),scope:'network'});
    const network=await core.api('/api/analytics/monthly-export?'+params.toString());
    if(!columns?.length&&network?.columns?.length)columns=network.columns;
    rows=[...(network?.rows||[]),...rows];networkIncluded=(network?.rows||[]).length>0;
    basketReady+=Number(network?.diagnostics?.basketCurrentReady||0)+Number(network?.diagnostics?.basketComparisonReady||0);
    basketExpected+=4
   }catch(error){console.warn('Network export consolidation skipped',error)}
  }
  if(!rows.length)throw new Error('Aucune vente à exporter sur cette période.');
  const data={columns:columns||[],rows};
  button.textContent='Génération Excel…';
  const scope=stores.length===1?(stores[0].code||stores[0].id):'reseau';
  const result=await saveCsv(csvFrom(data),'StoreOps-Analytics-ventes-completes-PERIODE-COMPARAISON-'+scope+'-'+state.periodStart+'-'+state.periodEnd+'-vs-'+state.compareStart+'-'+state.compareEnd+'.csv');
  if(result!=='CANCELLED'){
   const basketNote=basketExpected&&basketReady<basketExpected?' · certains indicateurs panier sont N/D':' · paniers disponibles';
   toast(rows.length+' lignes exportées · détail magasin'+(networkIncluded?' + consolidation réseau':'')+' · comparaison active'+basketNote+'.')
  }
 }catch(error){
  console.error('Full monthly sales export failed',error);
  toast(error?.message||'Impossible de générer l’export complet.');
 }finally{button.disabled=false;button.innerHTML=old}
}
button?.addEventListener('click',run);
