import { db,uid,audit } from '../db.mjs';
import { canAccessStore,canManageStore,canManageDlc,canRespondIncidents,canControlReceivingQuality } from './permissions.mjs';
import { getProductByEan } from './dynamics.mjs';
import { createDlcRecord,addDlcTreatment,recheckDlc } from './dlc.mjs';
import { incidentById,addAction,completeAction,addEvidence,resolveIncident,reopenIncident } from './incidents.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
const forbidden=(message='Vous n’avez pas ce droit dans StoreOps.')=>({status:403,data:{error:message,code:'CAPABILITY_REQUIRED'}});
function requireAccess(user,storeId){return canAccessStore(user,storeId)}

export async function handleQualityCollaborationApi({req,url,user}){
 const path=url.pathname;let p;

 // Posting dans l’ERP reste un droit opérationnel Responsable/Direction, même si la personne contrôle la qualité.
 p=route(path,'/api/receipts/:po/post');
 if(p&&req.method==='POST'&&!canManageStore(user,db.prepare(`SELECT store_id FROM receipts WHERE po_number=?`).get(p.po)?.store_id))return forbidden('Le contrôle qualité est autorisé, mais le posting ERP de la réception reste réservé au Responsable magasin ou à la Direction.');

 // DLC / DDM : lecture continue d’être servie par le routeur canonique ; ici on ouvre seulement les actions autorisées.
 p=route(path,'/api/stores/:storeId/dlc');
 if(p&&req.method==='POST'&&!canManageStore(user,p.storeId)){
  if(!requireAccess(user,p.storeId)||!canManageDlc(user,p.storeId))return forbidden('Droit « DLC / DDM · agir » requis.');
  const b=await body(req),product=await getProductByEan(b.ean);if(!product)return{status:400,data:{error:'EAN inconnu Dynamics'}};
  const row=createDlcRecord({storeId:p.storeId,user,product,expiryDate:b.expiryDate,quantity:b.quantity,zone:b.zone,lotRef:b.lotRef,comment:b.comment,expiryType:b.expiryType,department:b.department,family:b.family,unit:b.unit,sourceType:b.sourceType||'MANUAL'});
  return{status:201,data:row}
 }
 p=route(path,'/api/dlc/:dlcId/treatments');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(p.dlcId);if(!row)return null;
  if(!canManageStore(user,row.store_id)){
   if(!requireAccess(user,row.store_id)||!canManageDlc(user,row.store_id))return forbidden('Droit « DLC / DDM · agir » requis.');
   const b=await body(req);return{status:201,data:addDlcTreatment({id:p.dlcId,user,actionType:b.actionType,quantity:b.quantity,note:b.note,dataUrl:b.dataUrl,fileName:b.fileName,caption:b.caption})}
  }
 }
 p=route(path,'/api/dlc/:dlcId/recheck');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(p.dlcId);if(!row)return null;
  if(!canManageStore(user,row.store_id)){
   if(!requireAccess(user,row.store_id)||!canManageDlc(user,row.store_id))return forbidden('Droit « DLC / DDM · agir » requis.');
   const b=await body(req);return{status:200,data:recheckDlc({id:p.dlcId,user,quantity:b.quantity,note:b.note})}
  }
 }

 // Répondre aux demandes / incidents sans donner les droits d’administration du magasin.
 p=route(path,'/api/incidents/:incidentId/actions');
 if(p&&req.method==='POST'){
  const incident=incidentById(p.incidentId);if(!incident)return null;
  if(!canManageStore(user,incident.store_id)){
   if(!requireAccess(user,incident.store_id)||!canRespondIncidents(user,incident.store_id))return forbidden('Droit « Demandes & incidents · répondre » requis.');
   const b=await body(req);return{status:201,data:addAction({incidentId:p.incidentId,user,title:b.title,note:b.note,assignedTo:b.assignedTo,dueAt:b.dueAt})}
  }
 }
 p=route(path,'/api/incidents/:incidentId/actions/:actionId/complete');
 if(p&&req.method==='POST'){
  const incident=incidentById(p.incidentId);if(!incident)return null;
  if(!canManageStore(user,incident.store_id)){
   if(!requireAccess(user,incident.store_id)||!canRespondIncidents(user,incident.store_id))return forbidden();
   const b=await body(req);return{status:200,data:completeAction({incidentId:p.incidentId,actionId:p.actionId,user,note:b.note})}
  }
 }
 p=route(path,'/api/incidents/:incidentId/evidence');
 if(p&&req.method==='POST'){
  const incident=incidentById(p.incidentId);if(!incident)return null;
  if(!canManageStore(user,incident.store_id)){
   if(!requireAccess(user,incident.store_id)||!canRespondIncidents(user,incident.store_id))return forbidden();
   const b=await body(req);return{status:201,data:addEvidence({incidentId:p.incidentId,user,dataUrl:b.dataUrl,fileName:b.fileName,caption:b.caption})}
  }
 }
 p=route(path,'/api/incidents/:incidentId/resolve');
 if(p&&req.method==='POST'){
  const incident=incidentById(p.incidentId);if(!incident)return null;
  if(!canManageStore(user,incident.store_id)){
   if(!requireAccess(user,incident.store_id)||!canRespondIncidents(user,incident.store_id))return forbidden();
   const b=await body(req);return{status:200,data:resolveIncident({incidentId:p.incidentId,user,resolutionNote:b.resolutionNote})}
  }
 }
 p=route(path,'/api/incidents/:incidentId/reopen');
 if(p&&req.method==='POST'){
  const incident=incidentById(p.incidentId);if(!incident)return null;
  if(!canManageStore(user,incident.store_id)){
   if(!requireAccess(user,incident.store_id)||!canRespondIncidents(user,incident.store_id))return forbidden();
   const b=await body(req);return{status:200,data:reopenIncident({incidentId:p.incidentId,user,note:b.note})}
  }
 }

 // Réception : la saisie qualité est gérée par ensureQuality du routeur canonique.
 // Ce garde explicite évite qu’un profil sans capacité utilise le contrôle réception grâce à son seul périmètre réseau.
 p=route(path,'/api/receipts/:po/lines/:lineId/quality');
 if(p&&req.method==='POST'){
  const receipt=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(p.po);if(receipt&&!canControlReceivingQuality(user,receipt.store_id)&&!canManageStore(user,receipt.store_id))return forbidden('Droit « Réception · contrôler la qualité » requis.');
 }
 return null
}
