import {normalize} from './analytics-query-plan.mjs';
import {preparedCatalog} from './analytics-query-evidence.mjs';
import {selectRows} from './analytics-query-executor.mjs';
import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
import {readReceiptHistory} from './analytics-receipt-history.mjs';
import {relativeMetric,historicalMetric} from '../../frontend/analytics/detention-metrics.js';
import {lossInventoryReport,summarizeLossInventory} from './analytics-loss-inventory.mjs';
const n=x=>x==null?'Non mesuré':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(x);
export async function queryStock(stores,input,plan,{read=readAnalyticsCache,catalogReader=preparedCatalog,historyReader=readReceiptHistory,lossReader=lossInventoryReport}={}){
 const q=plan.queries[0],text=normalize(input.question),lines=[],sections=[];
 if(/demarque|inventaire/.test(text)){
  if(q.filters.category||q.filters.supplier||q.filters.origin||q.filters.text||q.filters.unit)return{answer:'Les registres de démarque et inventaire ne disposent pas encore de ce croisement fiable avec le référentiel. Précisez une liste de codes articles, ou demandez le total des registres du magasin. Aucun filtre n’est ignoré.',engine:'QUERY_CLARIFICATION',providerDataSent:false,sources:[]};
  const r=lossReader(stores,input),codes=q.filters.codes,losses=r.losses.filter(r=>!codes.length||codes.includes(r.product_number)),inventory=r.lines.filter(r=>!codes.length||codes.includes(r.product_number)),s=summarizeLossInventory(losses,r.sessions,inventory);
  if(!r.available.losses||!r.available.inventory)return{answer:'Un registre StoreOps de démarque ou inventaire est indisponible. Aucun zéro ni montant de substitution n’est produit.',engine:'QUERY_CLARIFICATION',providerDataSent:false,sources:[]};
  return{answer:`Démarque et inventaire StoreOps · ${input.start} → ${input.end}.\n\n${n(s.losses)} déclarations actives ; valeur de vente connue ${n(s.valuedRetail)} DH ; ${n(s.unknownRetail)} lignes sans valeur. ${n(s.lines)} lignes de comptage ; ${n(s.recount)} recomptages à traiter.\n\n${r.basis}`,engine:'QUERY_GROUNDED',providerDataSent:false,queryPlan:plan,sources:[{id:'S4',name:'Registres StoreOps'}]};
 }
 const catalog=await catalogReader(stores,{read}),refs=new Map(catalog.items.map(r=>[r.productNumber,r])),warehouse=/entrepot|plateforme/.test(text),relative=/relative/.test(text)&&/detention/.test(text),historical=/histor|detention/.test(text),seen=new Set();
 for(const store of stores){const u=await read(analyticsCacheKey('detention-universe-v3',[store.id]));if(!u){lines.push(store.name+' : image de stock non préparée. Lire les stocks dans Détention.');continue}
  const enrich=r=>{const ref=refs.get(r.productNumber);return{...r,article:r.productNumber,label:ref?.productName||r.productNumber,hierarchy:ref?.hierarchy||{},supplier:ref?.vendorName||ref?.primaryVendorAccount||null,vendorAccount:ref?.primaryVendorAccount||null,origin:!ref?.vendorName?'UNKNOWN':/extenc\s*international/i.test(ref.vendorName)?'IMPORT':'LOCAL',quantityUnit:ref?.inventoryUnit||null}};
  const all=(u.rows||[]).map(enrich);if(relative&&q.filters.category&&normalize(q.filters.category)!=='pgc')return{answer:'La détention relative demandée concerne PGC. Pour un autre département, choisissez la détention sur historique magasin ou entrepôt.',engine:'QUERY_CLARIFICATION',providerDataSent:false,sources:[]};let rows=selectRows(all,relative?{...q.filters,category:''}:q.filters),caption=store.name;
  if(historical){
   const kind=warehouse&&!relative?'supply':'store';if(kind==='supply'&&seen.has(u.supplyWarehouseId))continue;if(kind==='supply')seen.add(u.supplyWarehouseId);
   const h=relative?null:await historyReader(store.id,kind);let m;
   if(relative)m=relativeMetric(rows,{complete:u.stockComplete&&u.supplyComplete});else{const raw=historicalMetric(h?.products||[],all,{kind,stockComplete:kind==='supply'?u.supplyComplete:u.stockComplete,complete:h?.complete}),filtered=selectRows(raw.rows.map(enrich),q.filters);m=historicalMetric(filtered,all,{kind,includeCurrent:false,stockComplete:kind==='supply'?u.supplyComplete:u.stockComplete,complete:h?.complete})}
   if(kind==='supply')caption='Entrepôt '+u.supplyWarehouseId;
   sections.push({title:relative?'Détention relative PGC':kind==='supply'?'Passages entrepôt':'Réceptions historiques magasin',columns:['Périmètre','Détenues','Base','Inconnues','Taux'],rows:[[caption,n(m.held),n(m.denominator),n(m.unknown+(m.unclassified||0)),m.rate==null?'Non disponible':n(m.rate)+' %']]});
   lines.push(relative?'Plateforme positive uniquement ; plateforme 0 exclue.':(h?.coverage||h?.reason||'Historique à préparer')+' Les anciens journaux non exposés ne sont pas certifiés.');
  }else{
   if(/negatif/.test(text))rows=rows.filter(r=>r.storeAvailable<0);else if(/reappro|(?:absent|pas|manquant).*magasin|magasin.*(?:absent|pas|manquant)/.test(text))rows=rows.filter(r=>r.storeAvailable===0&&r.warehouseAvailable>0);else if(/rupture|absent|non detenu/.test(text))rows=rows.filter(r=>r.storeAvailable===0);
   const chosen=rows.slice(q.offset,q.offset+q.limit);sections.push({title:caption+' · références et actions',columns:['Article','Magasin','Entrepôt','Unité','Fournisseur'],rows:chosen.map(r=>[r.label+' ('+r.article+')',n(r.storeAvailable),n(r.warehouseAvailable),r.quantityUnit||'Inconnue',r.supplier||'Non renseigné'])});lines.push(`${caption} : ${rows.length} positions observées, ${chosen.length} affichées${u.stockComplete&&u.supplyComplete?' sur image complète':' sur image partielle : total non garanti'}. Stock nul, négatif et inconnu restent distincts. Vérifier réserve, unités et commandes avant transfert.`);
  }
  lines.push(`${caption} : magasin lu ${u.stockReadAt||'date inconnue'}, entrepôt lu ${u.warehouseReadAt||'date inconnue'}.`);
 }
 if(/impact|perte|manque a gagner/.test(text))lines.push('Aucun CA perdu ou effet causal des ruptures n’est chiffré à partir de cette seule image de stock.');
 if(q.filters.supplier||q.filters.category||q.filters.origin)lines.push('Filtres appliqués au fournisseur et au classement actuels connus ; les références non qualifiées ne permettent pas de garantir l’exhaustivité du sous-périmètre.');
 if(lines.length)sections.push({title:'Sources et limites',lines});
 return{answer:[...sections.flatMap(s=>[s.title,...(s.rows||[]).map(r=>r.map((v,i)=>s.columns[i]+' : '+v).join(' · '))]),...lines].join('\n\n'),sections,engine:'QUERY_GROUNDED',providerDataSent:false,queryPlan:plan,sources:[{id:'S4',name:'Stock et historiques préparés'}]};
}
