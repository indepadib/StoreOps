import { db,audit,todayISO } from '../db.mjs';
import { listLossRecords,lossSummary,LOSS_REASONS } from './loss.mjs';
import { inventorySession,INVENTORY_REASON_CODES } from './inventory.mjs';
import { excelWorkbook } from './excel-workbook.mjs';
import { LOSS_VALUATION_VERSION } from './loss-valuation.mjs';

const reason=(list,code)=>list.find(x=>x.code===code)?.label||code||'';
const n=v=>v===null||v===undefined||v===''?null:Number(v);
const num=v=>[n(v),'Number'];
const txt=v=>[v??'','String'];
const safeFile=v=>String(v||'export').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-');
function storeName(storeId){return db.prepare(`SELECT name FROM stores WHERE id=?`).get(storeId)?.name||storeId}

export function buildLossExcel({storeId,businessDate=todayISO(),user}){
 const rows=listLossRecords(storeId,businessDate,'ALL').filter(x=>x.status!=='CANCELLED');
 if(!rows.length)throw Object.assign(new Error('Aucune démarque à exporter pour cette journée.'),{status:409,code:'LOSS_EXCEL_EMPTY'});
 const summary=lossSummary(storeId,businessDate),workbook=excelWorkbook({sheets:[
  {name:'Synthese',headers:['Indicateur','Valeur'],widths:[210,150],rows:[
   [txt('Date'),txt(businessDate)],[txt('Magasin'),txt(storeName(storeId))],[txt('Lignes'),num(rows.length)],
   [txt('Valeur totale au coût (DH)'),num(summary.costValue)],[txt('Couverture coût (%)'),num(summary.costCoverage)],[txt('Valeur totale prix vente (DH)'),num(summary.retailValue)],[txt('Couverture prix vente (%)'),num(summary.retailCoverage)],
   [txt('Lignes coût non valorisé'),num(summary.costUnvaluedRecords)],[txt('Lignes prix vente non valorisé'),num(summary.retailUnvaluedRecords)],
   [txt('Règle de valorisation'),txt('Conversion explicite unité démarque → unité coût / unité prix. Aucune multiplication brute entre g et DH/kg.')]
  ]},
  {name:'Demarque',headers:['Date','Magasin','EAN','Code article','Libellé','Catégorie','Motif','Quantité démarquée','Unité démarque','Qté équivalente coût','Unité coût','Coût par unité coût (DH)','Valeur au coût (DH)','État valorisation coût','Qté équivalente vente','Unité prix vente','Qté de prix vente','Prix de vente de référence (DH)','Valeur prix vente (DH)','État valorisation vente','Statut','Preuve','Validation Direction','Commentaire','Source'],widths:[85,100,115,105,210,120,150,90,80,95,80,110,105,110,100,90,90,120,110,115,120,100,125,240,110],rows:rows.map(x=>{
   const trusted=x.valuation_version===LOSS_VALUATION_VERSION;
   return[
    txt(x.business_date),txt(storeName(x.store_id)),txt(x.ean),txt(x.product_number),txt(x.product_name),txt(x.category),txt(reason(LOSS_REASONS,x.reason_code)),num(x.quantity),txt(x.unit),
    trusted?num(x.cost_equivalent_qty):num(null),txt(trusted?x.cost_unit:''),trusted?num(x.unit_cost_value):num(null),trusted?num(x.total_cost_value):num(null),txt(trusted?(x.cost_valuation_state||''):'LEGACY_NON_FIABILISÉE'),
    trusted?num(x.retail_equivalent_qty):num(null),txt(trusted?x.retail_price_unit:''),trusted?num(x.retail_price_quantity):num(null),trusted?num(x.unit_retail_value):num(null),trusted?num(x.total_retail_value):num(null),txt(trusted?(x.retail_valuation_state||''):'LEGACY_NON_FIABILISÉE'),
    txt(x.status),txt(x.requires_evidence?(x.evidence_satisfied?'OK':'REQUISE'):'NON REQUISE'),txt(x.approved_at?'APPROUVÉE':x.status==='APPROVAL_REQUIRED'?'À VALIDER':'NON REQUISE'),txt(x.note),txt(x.source_type)
   ]
  })}
 ]});
 const fileName=`demarque_${safeFile(storeId)}_${businessDate}.xls`;
 audit({storeId,businessDate,userId:user?.id||null,action:'LOSS_EXCEL_EXPORTED',entityType:'LOSS_EXPORT',entityId:fileName,details:{rowCount:rows.length,costCoverage:summary.costCoverage}});
 return{file:{...workbook,fileName,rowCount:rows.length},summary,message:'Export Excel démarque généré. Aucune écriture D365 n’a été effectuée.'}
}

export function buildInventoryExcel({sessionId,user}){
 const inv=inventorySession(sessionId);if(!inv)throw Object.assign(new Error('Inventaire introuvable.'),{status:404,code:'INVENTORY_NOT_FOUND'});
 if(!inv.lines?.length)throw Object.assign(new Error('Cet inventaire ne contient aucun article.'),{status:409,code:'INVENTORY_EXCEL_EMPTY'});
 const finalLines=inv.lines.filter(x=>x.final_qty!==null&&x.final_qty!==undefined),adjustments=finalLines.filter(x=>Number(x.final_variance||0)!==0);
 const workbook=excelWorkbook({sheets:[
  {name:'Synthese',headers:['Indicateur','Valeur'],widths:[210,170],rows:[
   [txt('Date'),txt(inv.business_date)],[txt('Magasin'),txt(storeName(inv.store_id))],[txt('Session'),txt(inv.id)],[txt('Type'),txt(inv.inventory_type)],[txt('Zone'),txt(inv.zone||'')],
   [txt('Statut StoreOps'),txt(inv.status)],[txt('Articles'),num(inv.metrics?.lines||0)],[txt('Articles comptés'),num(inv.metrics?.counted||0)],
   [txt('Lignes avec écart'),num(inv.metrics?.varianceLines||0)],[txt('Agrégation des quantités'),txt('Non agrégée entre unités différentes (g / kg / pièce / etc.)')]
  ]},
  {name:'Ajustements',headers:['Date','Magasin','Session','EAN','Code article','Libellé','Catégorie','Unité stock','Stock théorique','Stock compté final','Ajustement à saisir','Motif','Commentaire'],widths:[85,100,135,115,105,210,120,80,95,105,105,160,240],rows:adjustments.map(x=>[
   txt(inv.business_date),txt(inv.store_id),txt(inv.id),txt(x.ean),txt(x.product_number),txt(x.product_name),txt(x.category),txt(x.stock_unit),num(x.theoretical_qty),num(x.final_qty),num(x.final_variance),txt(reason(INVENTORY_REASON_CODES,x.reason_code)),txt(x.note)
  ])},
  {name:'Comptage complet',headers:['Date','Magasin','Session','EAN','Code article','Libellé','Catégorie','Unité stock','Stock théorique','1er comptage','2e comptage','Stock final','Écart final','Motif','Commentaire','Statut'],widths:[85,100,135,115,105,210,120,80,95,95,95,95,90,160,240,100],rows:inv.lines.map(x=>[
   txt(inv.business_date),txt(inv.store_id),txt(inv.id),txt(x.ean),txt(x.product_number),txt(x.product_name),txt(x.category),txt(x.stock_unit),num(x.theoretical_qty),num(x.count1_qty),num(x.count2_qty),num(x.final_qty),num(x.final_variance),txt(reason(INVENTORY_REASON_CODES,x.reason_code)),txt(x.note),txt(x.status)
  ])}
 ]});
 const fileName=`inventaire_${safeFile(inv.store_id)}_${inv.business_date}_${safeFile(inv.id)}.xls`;
 audit({storeId:inv.store_id,businessDate:inv.business_date,userId:user?.id||null,action:'INVENTORY_EXCEL_EXPORTED',entityType:'INVENTORY_SESSION',entityId:inv.id,details:{rowCount:inv.lines.length,adjustmentLines:adjustments.length}});
 return{session:inv,file:{...workbook,fileName,rowCount:inv.lines.length},adjustmentLines:adjustments.length,message:'Export Excel inventaire généré. Aucune écriture D365 n’a été effectuée.'}
}
