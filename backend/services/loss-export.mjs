import { createHash } from 'node:crypto';
import { db,uid,audit,todayISO } from '../db.mjs';
import { compileExport,validateExportTemplate } from './export-template.mjs';
import { listLossRecords,ensureLossPostable,markLossPosted } from './loss.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS loss_export_runs(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 template_code TEXT NOT NULL,
 target TEXT NOT NULL,
 file_name TEXT NOT NULL,
 checksum TEXT NOT NULL,
 line_ids_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('GENERATED','CONFIRMED','CANCELLED')),
 confirmable INTEGER NOT NULL DEFAULT 0,
 generated_by TEXT NOT NULL REFERENCES users(id),
 generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 confirmed_by TEXT NULL REFERENCES users(id),
 confirmed_at TEXT NULL,
 external_reference TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_loss_export_store_date ON loss_export_runs(store_id,business_date,generated_at DESC);
`);

const GENERIC_TEMPLATE={
 code:'STOREOPS_LOSS_AUDIT',name:'StoreOps — Démarque du jour',target:'STOREOPS_AUDIT',version:'1',delimiter:';',extension:'csv',encoding:'utf-8',includeHeader:true,fileNamePattern:'demarque_{storeId}_{businessDate}.{extension}',
 columns:[
  {name:'Date',source:'business_date',required:true,type:'date'},
  {name:'Magasin',source:'store_id',required:true},
  {name:'EAN',source:'ean',required:true},
  {name:'Article',source:'product_number'},
  {name:'Libellé',source:'product_name',required:true},
  {name:'Motif',source:'reason_code',required:true},
  {name:'Quantité',source:'quantity',required:true,type:'number',decimals:3},
  {name:'Unité',source:'unit',required:true},
  {name:'Valeur_Unitaire_Vente',source:'unit_retail_value',type:'number',decimals:2},
  {name:'Valeur_Totale_Vente',source:'total_retail_value',type:'number',decimals:2},
  {name:'Commentaire',source:'note'}
 ]
};

function configuredErpTemplate(){
 const raw=String(process.env.STOREOPS_LOSS_EXPORT_TEMPLATE_JSON||'').trim();if(!raw)return null;
 try{return validateExportTemplate(JSON.parse(raw))}catch(error){throw Object.assign(new Error(`Template export démarque invalide : ${error.message}`),{status:503,code:'LOSS_EXPORT_TEMPLATE_INVALID'})}
}
function activeRows(storeId,businessDate){return listLossRecords(storeId,businessDate,'ALL').filter(x=>!['POSTED','CANCELLED'].includes(x.status))}
function blockerFor(row){try{ensureLossPostable(row.id);return null}catch(error){return{id:row.id,productName:row.product_name,status:row.status,code:error.code||'LOSS_NOT_POSTABLE',message:error.message}}}
function sha256(content){return createHash('sha256').update(String(content||''),'utf8').digest('hex')}
function hydrateRun(row){if(!row)return null;return{...row,lineIds:JSON.parse(row.line_ids_json||'[]'),confirmable:!!row.confirmable}}
export function lossExportRun(id){return hydrateRun(db.prepare(`SELECT * FROM loss_export_runs WHERE id=?`).get(id))}

export function lossExportStatus(storeId,businessDate=todayISO()){
 const rows=activeRows(storeId,businessDate),blockers=rows.map(blockerFor).filter(Boolean),erpTemplate=configuredErpTemplate(),last=hydrateRun(db.prepare(`SELECT * FROM loss_export_runs WHERE store_id=? AND business_date=? ORDER BY generated_at DESC LIMIT 1`).get(storeId,businessDate));
 return{storeId,businessDate,openLines:rows.length,ready:rows.length>0&&blockers.length===0,blockers,erpTemplateConfigured:!!erpTemplate,erpTemplate:erpTemplate?{code:erpTemplate.code,name:erpTemplate.name,target:erpTemplate.target,version:erpTemplate.version}:null,lastExport:last?{id:last.id,status:last.status,fileName:last.file_name,target:last.target,confirmable:last.confirmable,generatedAt:last.generated_at,confirmedAt:last.confirmed_at,reference:last.external_reference}:null};
}

export function generateLossClosingPack({storeId,businessDate=todayISO(),user}){
 const rows=activeRows(storeId,businessDate);if(!rows.length)throw Object.assign(new Error('Aucune démarque à exporter pour cette journée.'),{status:409,code:'LOSS_EXPORT_EMPTY'});
 const blockers=rows.map(blockerFor).filter(Boolean);if(blockers.length)throw Object.assign(new Error(`${blockers.length} ligne(s) de démarque ne sont pas prêtes pour le fichier final.`),{status:409,code:'LOSS_EXPORT_BLOCKED',details:{blockers}});
 const erpTemplate=configuredErpTemplate(),template=erpTemplate||validateExportTemplate(GENERIC_TEMPLATE),result=compileExport(template,rows,{storeId,businessDate});
 if(!result.ready)throw Object.assign(new Error('Le fichier de démarque contient des données obligatoires manquantes.'),{status:409,code:'LOSS_EXPORT_NOT_READY',details:{errors:result.errors}});
 const id=uid('loss_export'),checksum=sha256(result.content),lineIds=rows.map(x=>x.id),confirmable=!!erpTemplate;
 db.prepare(`INSERT INTO loss_export_runs(id,store_id,business_date,template_code,target,file_name,checksum,line_ids_json,status,confirmable,generated_by) VALUES(?,?,?,?,?,?,?,?, 'GENERATED',?,?)`).run(id,storeId,businessDate,template.code,template.target,result.fileName,checksum,JSON.stringify(lineIds),confirmable?1:0,user.id);
 audit({storeId,businessDate,userId:user.id,action:'LOSS_CLOSING_PACK_GENERATED',entityType:'LOSS_EXPORT',entityId:id,details:{templateCode:template.code,target:template.target,fileName:result.fileName,rowCount:rows.length,checksum,confirmable}});
 return{run:lossExportRun(id),file:{fileName:result.fileName,mimeType:result.mimeType,encoding:result.encoding,rowCount:result.rowCount,content:result.content,checksum},erpTemplateConfigured:!!erpTemplate,confirmable,message:erpTemplate?'Fichier ERP généré. Importe-le puis confirme la référence d’import pour débloquer la fermeture.':'Template ERP exact non configuré : fichier d’audit généré uniquement. Il ne peut pas être confirmé comme import ERP.'}
}

export function confirmLossClosingPackImport({exportId,user,reference}){
 const run=lossExportRun(exportId);if(!run)throw Object.assign(new Error('Export démarque introuvable.'),{status:404,code:'LOSS_EXPORT_NOT_FOUND'});
 if(run.status==='CONFIRMED')return run;if(run.status!=='GENERATED')throw Object.assign(new Error('Cet export ne peut plus être confirmé.'),{status:409,code:'LOSS_EXPORT_NOT_CONFIRMABLE'});
 if(!run.confirmable)throw Object.assign(new Error('Le template ERP exact n’est pas configuré : cet export d’audit ne peut pas valider un import ERP.'),{status:409,code:'LOSS_ERP_TEMPLATE_NOT_CONFIGURED'});
 const ref=String(reference||'').trim();if(!ref)throw Object.assign(new Error('Référence / preuve d’import ERP obligatoire.'),{status:400,code:'LOSS_IMPORT_REFERENCE_REQUIRED'});
 const ids=run.lineIds||[];for(const id of ids){const row=db.prepare(`SELECT id,status,store_id,business_date FROM loss_records WHERE id=?`).get(id);if(!row||row.store_id!==run.store_id||row.business_date!==run.business_date)throw Object.assign(new Error('Une ligne du fichier n’est plus cohérente avec la journée.'),{status:409,code:'LOSS_EXPORT_LINE_MISMATCH',details:{id}});if(row.status!=='POSTED')markLossPosted({id,user,method:'FILE_IMPORT',reference:ref})}
 db.prepare(`UPDATE loss_export_runs SET status='CONFIRMED',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP,external_reference=? WHERE id=?`).run(user.id,ref,exportId);
 audit({storeId:run.store_id,businessDate:run.business_date,userId:user.id,action:'LOSS_CLOSING_PACK_CONFIRMED',entityType:'LOSS_EXPORT',entityId:exportId,details:{reference:ref,lineCount:ids.length,checksum:run.checksum}});
 return lossExportRun(exportId)
}

export const genericLossExportTemplate=()=>validateExportTemplate(GENERIC_TEMPLATE);
