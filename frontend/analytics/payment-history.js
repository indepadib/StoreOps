import {paymentHistoryRows,paymentTotals} from './payment-history-model.js';
import {analysisCsv} from './analysis-grid.js';
import {createXlsxBlob} from './xlsx-workbook.js';
export function mountPaymentHistory(){
 const core=window.RETAIL_INTELLIGENCE;if(!core)return;
 const panel=document.createElement('section');panel.id='paymentsPanel';panel.dataset.widget='paymentsPanel';panel.className='assortment-opportunities payment-history';panel.hidden=core.getState().section!=='payments';
 panel.innerHTML='<header><span class="studio-kicker">RÈGLEMENTS POS · HISTORIQUE ACCESSIBLE</span><h2>Paiements carte / TPE</h2><p>Sommes du journal de paiement, depuis sa première date accessible. Cette lecture ne constitue pas un rapprochement des remises TPE avec la banque. Les archives supprimées ne sont pas certifiées.</p></header><div class="analysis-grid-tools"><label>Lire jusqu’au<input type="date" data-end></label><label><input type="checkbox" data-force> Relire D365, ignorer le cache</label><button type="button" data-load>Lire tout l’historique accessible</button><button type="button" data-cancel hidden>Annuler</button></div><p data-scope></p><p data-status role="status"></p><div class="analysis-grid-tools"><label>Regrouper par<select data-grain><option value="month">Mois</option><option value="week">Semaine ISO</option><option value="day">Jour</option></select></label><label>Magasins<select data-stores><option value="store">Détail magasin</option><option value="network">Réseau sélectionné</option></select></label><label>Moyens<select data-methods><option value="card">Cartes bancaires reconnues</option><option value="all">Tous les moyens · diagnostic</option></select></label><label><input type="checkbox" data-manual checked> Inclure CB manuelle, séparément</label><label>Filtrer à partir du<input type="date" data-start></label><button type="button" data-csv disabled>Exporter CSV complet</button><button type="button" data-xlsx disabled>Exporter Excel complet</button></div><p data-total role="status"></p><p data-quality></p><div class="table-wrap"><table class="decision-table"><thead><tr><th>Période</th><th>Magasin</th><th>Mode source</th><th>Code</th><th>Classification</th><th>Devise</th><th>Montants positifs</th><th>Montants négatifs · absolus</th><th>Solde signé source</th><th>Lignes de règlement</th></tr></thead><tbody></tbody></table></div><details><summary>Couverture et sources</summary><div data-sources></div><p>Les montants négatifs ne sont pas transformés en encaissements par valeur absolue. L’orientation comptable des signes n’est pas certifiée ici ; les signes restent ceux du champ source. Les paiements annulés sont exclus lorsque leur statut est exposé et reconnaissable. Sinon le résultat reste un journal observé non rapproché. Les libellés des moyens viennent de D365 ; aucun code CB numérique n’est supposé. Un moyen non classé peut masquer une partie du total carte : consulter le diagnostic. Les devises restent séparées. Les filtres et exports génériques du tableau portent sur les lignes affichées ; les exports complets ci-dessus portent sur toute la lecture regroupée.</p></details>';
 document.querySelector('main').append(panel);const el=q=>panel.querySelector(q),make=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());el('[data-end]').value=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 const requestedGrain=new URLSearchParams(location.search).get('grain');if(['month','week','day'].includes(requestedGrain))el('[data-grain]').value=requestedGrain;
 let reports=[],generation=0,controller=null,autoStarted=false,scopeKey='',limit=300;
 el('[data-manual]').checked=true;
 const more=make('button','Afficher 300 regroupements de plus');more.type='button';more.hidden=true;panel.querySelector('.table-wrap').after(more);more.onclick=()=>{limit+=300;render()};
 const stores=()=>core.getSelectedStores(),scope=()=>JSON.stringify([core.getState().tenant,stores().map(s=>s.id).sort()]);
 const columns=['Période','Magasin','Mode source','Code','Classification','Devise','Montants positifs source','Montants négatifs source · absolus','Solde signé source','Lignes de règlement'];
 const values=row=>[row.period,row.store,row.label,row.tender,row.kind,row.currency,row.positive,row.negative,row.net,row.lines];
 const selectedRows=()=>paymentHistoryRows(reports,{grain:el('[data-grain]').value,manual:el('[data-manual]').checked,methods:el('[data-methods]').value,byStore:el('[data-stores]').value==='store',start:el('[data-start]').value});
 const money=(n,c)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:c}).format(n);
 function clear(){generation++;controller?.abort();controller=null;reports=[];limit=300;more.hidden=true;el('tbody').replaceChildren();el('[data-total]').textContent='';el('[data-quality]').textContent='';el('[data-sources]').replaceChildren();el('[data-load]').disabled=false;el('[data-cancel]').hidden=true;el('[data-csv]').disabled=el('[data-xlsx]').disabled=true}
 function render(){if(!reports.length)return;const rows=selectedRows(),fragment=document.createDocumentFragment();
  for(const row of rows.slice(0,limit)){const tr=make('tr');for(const value of values(row))tr.append(make('td',value));fragment.append(tr)}el('tbody').replaceChildren(fragment);more.hidden=rows.length<=limit;
  const prefix=el('[data-methods]').value==='card'?'Sous-total des modes carte reconnus':'Total des moyens observés';
  el('[data-total]').textContent=prefix+' · '+paymentTotals(rows).map(t=>`${t.currency} : positifs ${money(t.positive,t.currency)} · négatifs ${money(t.negative,t.currency)} · solde signé ${money(t.net,t.currency)}`).join(' | ')+(rows.length?'':' · aucune ligne dans cette sélection');
  const unknown=reports.reduce((n,r)=>n+r.unmapped,0),status=reports.reduce((n,r)=>n+r.unverifiedStatus,0);
  el('[data-quality]').textContent=`${Math.min(limit,rows.length)} / ${rows.length} regroupements affichés ; exports complets. ${unknown} lignes de moyen non classé · ${status} lignes avec statut d’annulation non certifié · ${reports.reduce((n,r)=>n+r.voided,0)} lignes annulées exclues. Signes comptables non certifiés ; aucun total bancaire rapproché annoncé.`;
  el('[data-csv]').disabled=el('[data-xlsx]').disabled=!rows.length;
 }
 async function load(){
  clear();const own=generation,shops=stores().map(s=>({...s})),end=el('[data-end]').value,force=el('[data-force]').checked;
  if(!shops.length||!end){el('[data-status]').textContent='Choisir au moins un magasin et une date de fin.';return}
  controller=new AbortController();const abort=controller;el('[data-load]').disabled=true;el('[data-cancel]').hidden=false;
  try{const completed=new Array(shops.length);let next=0,failure=null,stop=false;
   const worker=async()=>{try{while(!stop){const i=next++;if(i>=shops.length)return;const shop=shops[i];let cursor=null,data;const seen=new Set();
    do{const q=new URLSearchParams({storeId:shop.id,end});if(cursor)q.set('cursor',cursor);else if(force)q.set('force','1');data=await core.api('/api/analytics/payments/history?'+q,{noRetry:true,signal:abort.signal});if(own!==generation||stop)return;
     if(!['READY','PREPARING'].includes(data.status)||data.storeId!==shop.id||data.end!==end)throw Error('Historique de paiements incomplet ou hors périmètre.');cursor=data.nextCursor;
     if(cursor&&seen.has(cursor))throw Error('Pagination de paiements répétée.');if(cursor)seen.add(cursor);
     el('[data-status]').textContent=shop.name+' · '+data.scanned+' lignes de règlement lues · aucun total réseau partiel publié.';
    }while(cursor);if(data.status!=='READY')throw Error('Lecture incomplète.');completed[i]={...data,storeName:shop.name};
   }}catch(error){failure??=error;stop=true}};
   await Promise.all(Array.from({length:Math.min(2,shops.length)},worker));if(failure)throw failure;if(own!==generation)return;reports=completed;
   el('[data-sources]').replaceChildren(...reports.map(r=>make('p',`${r.storeName} · ${r.firstDate||'Aucune date'} → ${r.end} · ${r.scanned} lignes · ${r.source} / ${r.amountField} · moyens ${r.tenderSource} · lu ${r.checkedAt}`)));
   el('[data-status]').textContent='Lecture complète du journal accessible jusqu’au '+end+'. Modifier le regroupement ne relit pas D365.';render();
  }catch(error){if(own===generation&&!abort.signal.aborted){reports=[];el('[data-status]').textContent='Total suspendu : '+error.message}}
  finally{if(own===generation){controller=null;el('[data-load]').disabled=false;el('[data-cancel]').hidden=true}}
 }
 async function download(excel){const rows=selectedRows(),data={name:'Paiements',headers:columns,keys:['period','store','mode','code','classification','currency','positiveAmount','negativeAmount','netAmount','lines'],rows:rows.map(values)};
  const sourceSheet={name:'Sources et réserves',headers:['Paramètre','Valeur'],rows:[['Regroupement',el('[data-grain]').value],['Moyens',el('[data-methods]').value],['Inclure CB manuelle',String(el('[data-manual]').checked)],['Filtrer depuis',el('[data-start]').value],['Base','Journal POS observé, orientation des signes non certifiée ; pas un rapprochement bancaire.'],...reports.flatMap(r=>[['Magasin',r.storeName],['Depuis',r.firstDate],['Jusqu’au',r.end],['Source',r.source+'/'+r.amountField],['Lecture',r.checkedAt],['Non classés',r.unmapped],['Statut non certifié',r.unverifiedStatus]])]};
  const blob=excel?await createXlsxBlob([data,sourceSheet]):new Blob([analysisCsv([...columns,'Base','Jusqu’au'],rows.map(r=>[...values(r),'Journal POS observé · signes non certifiés',reports[0].end]))],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=make('a');link.href=url;link.download='paiements-'+el('[data-grain]').value+'.'+(excel?'xlsx':'csv');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 el('[data-load]').onclick=load;el('[data-cancel]').onclick=()=>{clear();el('[data-status]').textContent='Lecture annulée, aucun total incomplet publié.'};el('[data-end]').onchange=clear;
 for(const q of ['grain','manual','methods','stores','start'])el(`[data-${q}]`).onchange=()=>{limit=300;render()};
 for(const [q,excel] of [['csv',false],['xlsx',true]])el(`[data-${q}]`).onclick=()=>download(excel).catch(error=>el('[data-status]').textContent=error.message);
 function sync(){panel.hidden=core.getState().section!=='payments';if(scopeKey!==scope()){scopeKey=scope();clear()}el('[data-scope]').textContent='Magasins : '+stores().map(s=>s.name).join(' + ')+'. La période de ventes globale ne limite pas cet historique ; seule la date de fin ci-dessus s’applique.';
  if(!panel.hidden&&!autoStarted&&stores().length&&new URLSearchParams(location.search).get('read')==='1'){autoStarted=true;load()}}
 document.addEventListener('retail-intelligence:section',sync);document.addEventListener('retail-intelligence:period',sync);sync();
}
if(typeof document!=='undefined')mountPaymentHistory();
