const apiPath='/api/analytics/replenishment';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tableColumns=[['sku','Code'],['name','Article'],['quantity','Qté proposée'],['unit','Unité'],['available','Disponible'],['inbound','Arrivages'],['usage','Consommation / jour'],['leadDays','Délai (j)'],['min','Min'],['max','Max'],['shortfall','Reste à couvrir']];

function element(tag,text,className){
 const node=document.createElement(tag);
 if(text!=null)node.textContent=text;
 if(className)node.className=className;
 return node;
}

function csvCell(value){
 const text=String(value??'');
 return '"'+(/^[\s]*[=+\-@]/.test(text)&&typeof value!=='number'?"'":'')+text.replaceAll('"','""')+'"';
}

function download(summary,rows){
 const columns=[['supplier','Fournisseur'],['warehouse','Entrepôt'],['destination','Dépôt destination'],['store','Magasin'],...tableColumns,['leadSource','Source du délai'],['pack','Colisage']];
 const text=[columns.map(([,label])=>csvCell(label)).join(';'),...rows.map(row=>columns.map(([key])=>csvCell(row[key])).join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF',text],{type:'text/csv;charset=utf-8'}));
 const link=element('a');link.href=url;link.download=`Proposition-${summary.mode}-${summary.end}.csv`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderTable(rows,number){
 const wrapper=element('div',null,'table-wrap repl-table');
 const table=element('table'),head=element('thead'),headRow=element('tr'),body=element('tbody');
 for(const [,label] of tableColumns){const th=element('th',label);th.scope='col';headRow.append(th);}
 head.append(headRow);
 for(const row of rows){
  const tr=element('tr');
  for(const [key] of tableColumns){const value=row[key];tr.append(element('td',value==null?'—':typeof value==='number'?number(value):value,key==='quantity'?'repl-quantity':null));}
  body.append(tr);
 }
 table.append(head,body);wrapper.append(table);return wrapper;
}

function renderResult(result,summary,rows,number){
 const proposed=rows.filter(row=>row.status==='PROPOSED'),blocked=rows.filter(row=>row.status==='BLOCKED');
 const title=summary.mode==='PO'?`Projets PO · ${summary.warehouse}`:`Projet TO · ${summary.warehouse} → ${summary.store}`;
 const heading=element('div',null,'repl-result-heading');heading.append(element('h3',title));
 if(proposed.length){const exportButton=element('button','Exporter les propositions','primary');exportButton.type='button';exportButton.onclick=()=>download(summary,proposed);heading.append(exportButton);}
 const facts=element('div',null,'repl-facts');
 for(const [label,count] of [['Références examinées',summary.examined],['Lignes proposées',proposed.length],['À vérifier',blocked.length]]){
  const card=element('div',null,'repl-fact');card.append(element('strong',number(count)),element('span',label));facts.append(card);
 }
 result.replaceChildren(heading,facts,element('p',[summary.assortmentBasis,`${summary.demandBasis} · ${summary.start} au ${summary.end}.`].filter(Boolean).join(' · '),'repl-source'));
 if(!proposed.length)result.append(element('p',blocked.length?'Aucune ligne chiffrée. Consulte les références à vérifier.':'Aucun besoin détecté sur les références examinées.','repl-empty'));
 const groups=new Map();
 for(const row of proposed){const key=summary.mode==='PO'?row.supplier:summary.store;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const [key,items] of groups){
  const details=element('details',null,'repl-group');details.open=groups.size===1;
  const label=summary.mode==='PO'?`Fournisseur ${key}`:key;
  const content=element('div');
  function showLines(){
   if(!details.open||content.childElementCount)return;
   let count=0;
   function appendPage(){
    const next=items.slice(count,count+50);count+=next.length;
    const more=content.querySelector('button');if(more)more.remove();
    content.append(renderTable(next,number));
    if(count<items.length){const button=element('button','Afficher 50 lignes de plus','primary');button.type='button';button.onclick=appendPage;content.append(button);}
   }
   appendPage();
  }
  details.addEventListener('toggle',showLines);
  details.append(element('summary',`${label} · ${items.length} ligne(s)`),content);result.append(details);showLines();
 }
 if(blocked.length){
  const details=element('details',null,'repl-group repl-blocked'),list=element('ul');details.open=!proposed.length;
  for(const row of blocked)list.append(element('li',`${row.sku} · ${row.name} — ${row.reason}`));
  details.append(element('summary',`${blocked.length} référence(s) à vérifier`),list);result.append(details);
 }
}

export function mountReplenishment(core,host){
 const form=host.querySelector('form[data-repl-order]');
 const scope=form?.elements.namedItem('scope');
 const status=host.querySelector('[role=status]'),result=host.querySelector('[data-repl-result]'),button=form?.querySelector('button[type=submit]');
 const scopeLabel=host.querySelector('[data-scope-label]');
 if(!scope||!status||!result||!button||!scopeLabel)return;
 const modes=[...host.querySelectorAll('[data-mode]')];
 let mode='TO',scopes=null,generation=0;
 function reset(){generation++;status.textContent='';result.replaceChildren();button.disabled=!scope.value;}
 function setScope(){
  const previous=scope.value;
  const options=mode==='TO'?(scopes?.stores||[]).map(s=>[s.id,s.name]):(scopes?.warehouses||[]).map(id=>[id,id]);
  scopeLabel.textContent=mode==='TO'?'Magasin de destination':'Entrepôt à réapprovisionner';
  const placeholder=element('option',mode==='TO'?'Choisir un magasin':'Choisir un entrepôt');placeholder.value='';
  scope.replaceChildren(placeholder,...options.map(([id,name])=>{const option=element('option',name);option.value=id;return option;}));
  scope.value=options.some(([id])=>id===previous)?previous:options.length===1?options[0][0]:'';
  button.textContent=`Générer le ${mode}`;reset();
  if(scopes&&!options.length)status.textContent=mode==='PO'?'L’achat entrepôt est accessible aux profils Direction ou Supply.':'Aucun magasin autorisé avec un entrepôt associé.';
 }
 modes.forEach(control=>control.onclick=()=>{mode=control.dataset.mode;modes.forEach(x=>x.setAttribute('aria-pressed',String(x===control)));setScope();});
 scope.onchange=reset;
 async function loadScopes(){
  if(scopes)return;
  try{scopes=await core.api(apiPath+'/scopes',{noRetry:true});setScope();}
  catch(error){status.textContent=error.message;}
 }
 document.addEventListener('retail-intelligence:section',event=>{if(event.detail?.section==='replenishment')loadScopes();});
 if(core.getState().section==='replenishment')loadScopes();
 form.onsubmit=async event=>{
  event.preventDefault();reset();
  const token=generation,selected=scope.value;
  if(!selected)return;
  button.disabled=true;status.textContent='Préparation de la proposition…';
  try{
   const query=new URLSearchParams({mode,scope:selected});
   const {jobId}=await core.api(`${apiPath}/jobs?${query}`,{method:'POST',noRetry:true});
   const path=`${apiPath}/jobs/${encodeURIComponent(jobId)}`;
   for(let count=0;count<240&&token===generation;count++){
    const job=await core.api(path,{noRetry:true});
    if(token!==generation)return;
    if(job.status==='FAILED')throw new Error(job.message);
    if(job.status==='READY'){
     const rows=[];
     for(let page=0;page<job.pages;page++){
      const data=await core.api(`${path}/pages/${page}`,{noRetry:true});
      if(token!==generation)return;
      rows.push(...data.rows);
     }
     renderResult(result,job.summary,rows,core.number);status.textContent='';return;
    }
    status.textContent=job.progress?.label||'En attente de préparation…';
    await sleep(4000);
   }
   if(token===generation)status.textContent='La préparation prend plus de temps que prévu. Relance pour retrouver la demande en cours.';
  }catch(error){if(token===generation)status.textContent=error.message||'Préparation indisponible.';}
  finally{if(token===generation)button.disabled=false;}
 };
 setScope();
}

const host=document.getElementById('replenishmentPanel');
if(host&&window.RETAIL_INTELLIGENCE)mountReplenishment(window.RETAIL_INTELLIGENCE,host);
