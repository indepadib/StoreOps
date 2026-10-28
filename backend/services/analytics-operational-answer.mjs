import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
import {lossInventoryReport} from './analytics-loss-inventory.mjs';
const normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export async function operationalAnswer(stores,input,{read=readAnalyticsCache,lossReport=lossInventoryReport}={}){
 const q=normalize(input.question);if(!/demarque|inventaire|reappro|entrepot|stock negatif/.test(q))return null;
 if(/demarque|inventaire/.test(q)){
  const r=lossReport(stores,input),s=r.summary,lines=[`DÉMARQUE ET INVENTAIRE · ${input.start} → ${input.end} [S4]`,r.basis];
  if(/demarque/.test(q))lines.push(r.available.losses?`${s.losses} déclarations actives, dont ${s.posted} comptabilisées et ${s.pending} en attente. Valeur de vente connue : ${s.valuedRetail==null?'non mesurée':s.valuedRetail.toFixed(2)+' DH'} ; ${s.unknownRetail} lignes sans valeur. Coût connu : ${s.valuedCost==null?'non mesuré':s.valuedCost.toFixed(2)+' DH'} ; ${s.unknownCost} lignes sans coût.`:'Registre de démarque non disponible sur cette lecture.');
  if(/inventaire/.test(q))lines.push(r.available.inventory?`${s.sessions} sessions, ${s.lines} lignes, ${s.toCount} à compter, ${s.recount} à recompter ; ${s.negativeVariance} écarts finaux négatifs et ${s.unknownVariance} non arrêtés.`:'Registre des inventaires non disponible sur cette lecture.');
  lines.push('Décision : traiter les déclarations en attente et les recomptages avant toute régularisation ; ouvrir Stock pour examiner les lignes. Aucune perte comptable n’est déduite des seuls écarts de quantité.');
  return{answer:lines.join('\n\n'),engine:'OPERATIONS_GROUNDED',sources:[{id:'S4',name:'Registres StoreOps · démarque et inventaire'}],providerDataSent:false};
 }
 const codes=[...new Set((String(input.question).toUpperCase().match(/\b[A-Z]{1,8}-[A-Z0-9_.-]{1,48}\b/g)||[]))],lines=['PRIORITÉS DE DISPONIBILITÉ [S4]'];
 for(const store of stores){const u=await read(analyticsCacheKey('detention-universe-v3',[store.id]));if(!u){lines.push(`${store.name} : stocks non préparés. Ouvrir Détention avant de conclure.`);continue;}
  let rows=(u.rows||[]).filter(r=>!codes.length||codes.includes(r.productNumber));
  const namedVendors=[...new Set(rows.map(r=>r.vendorName).filter(Boolean))].filter(v=>q.includes(normalize(v)));if(namedVendors.length)rows=rows.filter(r=>namedVendors.includes(r.vendorName));
  const negative=/negatif/.test(q),actionable=rows.filter(r=>negative?r.storeAvailable<0:r.expected===true&&r.storeAvailable===0&&r.warehouseAvailable>0),unknown=rows.filter(r=>r.storeAvailable==null||r.warehouseAvailable==null).length;
  lines.push(`${store.name} · lecture magasin ${u.stockReadAt||'date inconnue'} ; entrepôt ${u.warehouseReadAt||'date inconnue'}. ${actionable.length} positions ${negative?'négatives à compter':'attendues absentes en magasin et disponibles en entrepôt'} observées${u.referenceComplete&&u.stockComplete&&u.supplyComplete?' sur lecture complète':' sur lecture partielle : total non garanti'}. ${unknown} positions à quantité inconnue.`);
  lines.push(...actionable.sort((a,b)=>a.productNumber.localeCompare(b.productNumber)).slice(0,8).map(r=>`• ${r.productNumber} · ${r.productName||''} · magasin ${r.storeAvailable} / entrepôt ${r.warehouseAvailable??'inconnu'} ${r.unit||'unité à vérifier'}${r.vendorName?' · '+r.vendorName:''}`));
 }
 lines.push('Action : vérifier unités, réserve et commandes en cours avant transfert ; compter les négatifs. Les premières références sont affichées par code, sans classement de manque à gagner inventé. Une quantité inconnue ne vaut pas zéro.');return{answer:lines.join('\n\n'),engine:'OPERATIONS_GROUNDED',sources:[{id:'S4',name:'Stocks préparés magasin et entrepôt'}],providerDataSent:false};
}
