import {db,audit} from '../db.mjs';
import {validateExportTemplate,compileExport} from './export-template.mjs';

const clean=v=>String(v??'').trim();
const STATES=['DRAFT','VALIDATED','LIVE','DISABLED'];
export const LOSS_EXPORT_SOURCE_FIELDS=Object.freeze([
 {key:'business_date',label:'Date métier',type:'date'},
 {key:'store_id',label:'Magasin / Store',type:'string'},
 {key:'ean',label:'EAN / code-barres',type:'string'},
 {key:'product_number',label:'Code article',type:'string'},
 {key:'product_name',label:'Libellé article',type:'string'},
 {key:'category',label:'Catégorie',type:'string'},
 {key:'reason_code',label:'Motif de démarque',type:'string'},
 {key:'quantity',label:'Quantité',type:'number'},
 {key:'unit',label:'Unité',type:'string'},
 {key:'unit_retail_value',label:'Valeur unitaire vente',type:'number'},
 {key:'total_retail_value',label:'Valeur totale vente',type:'number'},
 {key:'note',label:'Commentaire',type:'string'}
]);
const ALLOWED_SOURCES=new Set(LOSS_EXPORT_SOURCE_FIELDS.map(x=>x.key));
const SAMPLE_ROW=Object.freeze({
 business_date:'2026-09-19',store_id:'FRP0001',ean:'5449000206770',product_number:'HS-004873',
 product_name:'Article témoin StoreOps',category:'Épicerie',reason_code:'CASSE',quantity:2,unit:'PC',
 unit_retail_value:12.75,total_retail_value:25.5,note:'Validation template StoreOps'
});

db.exec(`
CREATE TABLE IF NOT EXISTS loss_export_mapping_settings(
 id TEXT PRIMARY KEY,
 template_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'DRAFT',
 preview_json TEXT NULL,
 validation_reference TEXT NULL,
 validated_at TEXT NULL,
 validated_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback=null){try{const x=JSON.parse(raw||'');return x??fallback}catch{return fallback}}
function managedTemplate(input={}){
 const t=validateExportTemplate(input);
 if(t.columns.length>40)throw Object.assign(new Error('Le template démarque ne peut pas dépasser 40 colonnes.'),{status:400,code:'LOSS_EXPORT_TEMPLATE_TOO_WIDE'});
 const invalid=t.columns.filter(c=>!ALLOWED_SOURCES.has(c.source));
 if(invalid.length)throw Object.assign(new Error(`Sources StoreOps non autorisées : ${invalid.map(x=>x.source).join(', ')}`),{status:400,code:'LOSS_EXPORT_TEMPLATE_SOURCE_INVALID',details:{invalid:invalid.map(x=>x.source),allowed:[...ALLOWED_SOURCES]}});
 return t
}
function rowToSettings(row){
 if(!row)return null;
 return{
  template:managedTemplate(safeJson(row.template_json,{})),
  state:STATES.includes(row.state)?row.state:'DRAFT',
  preview:safeJson(row.preview_json,null),
  validationReference:row.validation_reference||null,
  validatedAt:row.validated_at||null,
  validatedBy:row.validated_by||null,
  updatedBy:row.updated_by||null,
  updatedAt:row.updated_at||null
 }
}
function auditMapping(actor,action,details={}){
 const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;
 if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'LOSS_EXPORT_MAPPING',entityId:'default',details})
}

export function lossExportMappingSettings(){return rowToSettings(db.prepare(`SELECT * FROM loss_export_mapping_settings WHERE id='default'`).get())}
export function lossExportMappingConfig(){return{mapping:lossExportMappingSettings(),sourceFields:LOSS_EXPORT_SOURCE_FIELDS,sample:SAMPLE_ROW}}
export function effectiveLossExportTemplate(){const x=lossExportMappingSettings();return x?.state==='LIVE'?x.template:null}

export function saveLossExportMappingDraft({actor,input={}}){
 const template=managedTemplate(input);
 db.prepare(`INSERT INTO loss_export_mapping_settings(id,template_json,state,preview_json,validation_reference,validated_at,validated_by,updated_by,updated_at)
 VALUES('default',?,'DRAFT',NULL,NULL,NULL,NULL,?,CURRENT_TIMESTAMP)
 ON CONFLICT(id) DO UPDATE SET template_json=excluded.template_json,state='DRAFT',preview_json=NULL,validation_reference=NULL,validated_at=NULL,validated_by=NULL,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
 .run(JSON.stringify(template),actor?.id||null);
 auditMapping(actor,'LOSS_EXPORT_MAPPING_DRAFT_SAVED',{code:template.code,target:template.target,version:template.version,columnCount:template.columns.length});
 return lossExportMappingSettings()
}

export function previewLossExportMapping({actor,input=null}={}){
 const template=input?managedTemplate(input):lossExportMappingSettings()?.template;
 if(!template)throw Object.assign(new Error('Aucun template Closing Pack à tester.'),{status:404,code:'LOSS_EXPORT_MAPPING_NOT_FOUND'});
 if(input)saveLossExportMappingDraft({actor,input:template});
 const result=compileExport(template,[SAMPLE_ROW],{storeId:'FRP0001',businessDate:'2026-09-19'});
 const preview={status:result.ready?'PASSED':'FAILED',checkedAt:new Date().toISOString(),fileName:result.fileName,rowCount:result.rowCount,errors:result.errors,header:result.content?result.content.split(/\r?\n/)[0]:'',sampleContent:result.content||''};
 db.prepare(`UPDATE loss_export_mapping_settings SET state=?,preview_json=?,validation_reference=NULL,validated_at=?,validated_by=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`)
 .run(result.ready?'VALIDATED':'DRAFT',JSON.stringify(preview),result.ready?preview.checkedAt:null,result.ready?actor?.id||null:null,actor?.id||null);
 auditMapping(actor,result.ready?'LOSS_EXPORT_MAPPING_VALIDATED':'LOSS_EXPORT_MAPPING_VALIDATION_FAILED',{fileName:preview.fileName,errors:preview.errors});
 return lossExportMappingSettings()
}

export function activateLossExportMapping({actor,reference}={}){
 const current=lossExportMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun template Closing Pack enregistré.'),{status:404,code:'LOSS_EXPORT_MAPPING_NOT_FOUND'});
 if(current.state!=='VALIDATED'||current.preview?.status!=='PASSED')throw Object.assign(new Error('Le template doit réussir le preview avant activation.'),{status:409,code:'LOSS_EXPORT_MAPPING_NOT_VALIDATED'});
 const ref=clean(reference);if(!ref)throw Object.assign(new Error('Référence d’import ERP de validation obligatoire.'),{status:400,code:'LOSS_EXPORT_VALIDATION_REFERENCE_REQUIRED'});
 db.prepare(`UPDATE loss_export_mapping_settings SET state='LIVE',validation_reference=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(ref,actor?.id||null);
 auditMapping(actor,'LOSS_EXPORT_MAPPING_ACTIVATED',{code:current.template.code,target:current.template.target,reference:ref});
 return lossExportMappingSettings()
}

export function disableLossExportMapping({actor}={}){
 const current=lossExportMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun template Closing Pack enregistré.'),{status:404,code:'LOSS_EXPORT_MAPPING_NOT_FOUND'});
 db.prepare(`UPDATE loss_export_mapping_settings SET state='DISABLED',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'LOSS_EXPORT_MAPPING_DISABLED',{code:current.template.code});
 return lossExportMappingSettings()
}
