// Small, accessible semantic-model explorer for the existing StoreOps companion.
// Uses the authenticated API; descriptions never come from a language model.
const $=id=>document.getElementById(id);
const button=$('assistantKpiDictionary'),panel=$('assistantKpiPanel'),filter=$('assistantKpiSearch'),results=$('assistantKpiResults');
let model=null,loading=null;
const phrase=(s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n};
function render(){
 if(!panel||!results)return;
 results.replaceChildren();
 if(!model)return;
 const q=phrase(filter?.value).trim(),list=model.metrics.filter(m=>!q||phrase([m.label,m.domain,m.formula,m.warning,m.id].join(' ')).includes(q));
 const count=node('p','semantic-count',list.length+' indicateurs · '+model.version);
 results.append(count);
 for(const m of list){
  const details=node('details','semantic-definition'),head=node('summary');
  const title=node('strong',null,m.label),domain=node('span','semantic-domain',m.domain);
  head.append(title,domain);
  const definition=node('p',null,m.formula),source=node('p','semantic-source','Source : '+m.source+' · Unité : '+m.unit);
  const rule=node('p','semantic-warning',m.warning||'Interpréter sur le bon périmètre.');
  const avail=node('small',null,(model.coverageLevels||{})[m.availability]||m.availability);
  details.append(head,definition,source,rule,avail);results.append(details)
 }
 if(!list.length)results.append(node('p','semantic-empty','Aucun indicateur correspondant.'))
}
async function open(metricId){
 if(!panel||!button)return;
 const assistant=$('analyticsAssistant');
 if(assistant?.hidden)$('analyticsAssistantToggle')?.click();
 panel.hidden=false;button.setAttribute('aria-expanded','true');
 if(metricId){filter.value=model?.metrics.find(x=>x.id===metricId)?.label||metricId}
 if(!model){
  results.replaceChildren(node('p','semantic-loading','Chargement du catalogue des indicateurs…'));
  try{
   loading=loading||window.RETAIL_INTELLIGENCE.api('/api/analytics/semantic-model',{noRetry:true});
   model=await loading;
   if(metricId)filter.value=model.metrics.find(x=>x.id===metricId)?.label||metricId;
  }catch(error){
   loading=null;results.replaceChildren(node('p','semantic-error','Catalogue momentanément indisponible : '+(error.message||'réessayer')));return
  }
 }
 render();filter?.focus()
}
function close(){if(panel)panel.hidden=true;button?.setAttribute('aria-expanded','false')}
button?.addEventListener('click',()=>panel.hidden?open():close());
filter?.addEventListener('input',render);
document.addEventListener('click',event=>{
 const selected=event.target.closest('[data-semantic-kpi]');
 if(selected){event.preventDefault();open(selected.dataset.semanticKpi)}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel?.hidden){close();button?.focus()}});
