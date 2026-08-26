import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, productionMisconfig } from './config.mjs';
import { db, ensureStoreDay, todayISO, uid, audit } from './db.mjs';
import { sessionFromRequest } from './auth/session.mjs';
import { canAccessStore, canManageQuality, canManageStore } from './services/permissions.mjs';
import { getProductByEan, getDynamicsHealth, postReceiptToDynamics, listDataEntities } from './services/dynamics.mjs';
import { processProgress, takeOwnership, validateProcess } from './services/workflow.mjs';
import { getTaskForm, submitTaskForm } from './services/task-forms.mjs';
import { evaluateQuality, qualityProfileFor } from './services/quality.mjs';
import { listIncidents, incidentById, createIncident, addAction, completeAction, addEvidence, mediaById, resolveIncident, reopenIncident, incidentStats } from './services/incidents.mjs';
import { listQualityProfiles, updateQualityProfile, listSlaPolicies, updateSlaPolicy } from './services/governance.mjs';

const PORT=config.port;
const FRONTEND=fileURLToPath(new URL('../frontend',import.meta.url));
const CORS_ORIGINS=String(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);

function cors(req,res){
  const origin=req.headers.origin;
  if(origin&&(CORS_ORIGINS.includes(origin)||(config.nodeEnv!=='production'&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))){
    res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-headers','authorization,content-type,x-demo-user');res.setHeader('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
}
function json(req,res,status,data){cors(req,res);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>8e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function dlcStage(expiry){const d=Math.ceil((new Date(expiry+'T23:59:59')-new Date())/86400000);if(d<0)return{stage:'EXPIRED',label:'Expirée',severity:'CRITICAL'};if(d<=1)return{stage:'J1',label:`J-${Math.max(d,0)}`,severity:'CRITICAL'};if(d<=3)return{stage:'J3',label:`J-${d}`,severity:'HIGH'};if(d<=7)return{stage:'J7',label:`J-${d}`,severity:'MEDIUM'};return{stage:'OK',label:`J-${d}`,severity:'LOW'}}
function ensureManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function ensureQuality(user,storeId){if(!canManageQuality(user,storeId))throw Object.assign(new Error('Qualité réservée au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function ensureDirector(user){if(user.role!=='ops_director')throw Object.assign(new Error('Réservé au Directeur d’exploitation'),{status:403})}

async function api(req,res,url){
  if(req.method==='OPTIONS'){cors(req,res);res.writeHead(204);return res.end()}
  const path=url.pathname;
  if(path==='/api/health')return json(req,res,200,{ok:true,service:'StoreOps API',version:'1.4.3',authMode:config.authMode,dynamicsMode:config.dynamics.mode,configurationIssues:productionMisconfig()});

  const session=await sessionFromRequest(req),user=session.user;
  if(path==='/api/session')return json(req,res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role,store_id:user.store_id},authMode:session.mode,availableDemoUsers:session.mode==='demo'?db.prepare(`SELECT id,name,role,store_id FROM users WHERE active=1 ORDER BY role,name`).all():[]});
  if(path==='/api/config')return json(req,res,200,{authMode:config.authMode,dynamicsMode:config.dynamics.mode,version:'1.4.3'});
  if(path==='/api/dynamics/health'){ensureDirector(user);return json(req,res,200,await getDynamicsHealth())}
  if(path==='/api/dynamics/entities'){ensureDirector(user);return json(req,res,200,await listDataEntities(url.searchParams.get('q')||''))}

  let p;
  if(path==='/api/stores'){
    const rows=user.role==='ops_director'?db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all():db.prepare(`SELECT * FROM stores WHERE id=? AND active=1`).all(user.store_id);return json(req,res,200,rows);
  }
  p=route(path,'/api/stores/:storeId/assignees');if(p){requireStore(user,p.storeId);ensureManage(user,p.storeId);return json(req,res,200,db.prepare(`SELECT id,name,role,store_id FROM users WHERE active=1 AND (role='ops_director' OR (role='store_manager' AND store_id=?)) ORDER BY role,name`).all(p.storeId))}

  p=route(path,'/api/products/:ean');if(p){const product=await getProductByEan(p.ean);return product?json(req,res,200,{...product,qualityProfile:qualityProfileFor(product.category||'Autre')}):json(req,res,404,{error:'Article introuvable'})}
  if(path==='/api/quality-profiles'&&req.method==='GET')return json(req,res,200,listQualityProfiles());
  p=route(path,'/api/quality-profiles/:category');if(p){
    if(req.method==='GET')return json(req,res,200,qualityProfileFor(p.category));
    if(req.method==='PUT'||req.method==='PATCH'){ensureDirector(user);return json(req,res,200,updateQualityProfile({category:p.category,user,payload:await body(req)}))}
  }
  if(path==='/api/sla-policies'&&req.method==='GET'){ensureDirector(user);return json(req,res,200,listSlaPolicies())}
  p=route(path,'/api/sla-policies/:criticality');if(p&&(req.method==='PUT'||req.method==='PATCH')){ensureDirector(user);return json(req,res,200,updateSlaPolicy({criticality:p.criticality,user,payload:await body(req)}))}

  p=route(path,'/api/stores/:storeId/incidents');if(p){
    requireStore(user,p.storeId);
    if(req.method==='GET'){const status=(url.searchParams.get('status')||'OPEN').toUpperCase();return json(req,res,200,{stats:incidentStats(p.storeId),items:listIncidents(p.storeId,status)})}
    if(req.method==='POST'){ensureManage(user,p.storeId);const b=await body(req);return json(req,res,201,createIncident({storeId:p.storeId,user,title:b.title,description:b.description,category:b.category,criticality:b.criticality,blockingLevel:b.blockingLevel,assignedTo:b.assignedTo,dueAt:b.dueAt,requiresEvidence:!!b.requiresEvidence}))}
  }
  p=route(path,'/api/incidents/:incidentId');if(p&&req.method==='GET'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);return json(req,res,200,incident)}
  p=route(path,'/api/incidents/:incidentId/actions');if(p&&req.method==='POST'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);ensureManage(user,incident.store_id);const b=await body(req);return json(req,res,201,addAction({incidentId:p.incidentId,user,title:b.title,note:b.note,assignedTo:b.assignedTo,dueAt:b.dueAt}))}
  p=route(path,'/api/incidents/:incidentId/actions/:actionId/complete');if(p&&req.method==='POST'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);ensureManage(user,incident.store_id);const b=await body(req);return json(req,res,200,completeAction({incidentId:p.incidentId,actionId:p.actionId,user,note:b.note}))}
  p=route(path,'/api/incidents/:incidentId/evidence');if(p&&req.method==='POST'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);ensureManage(user,incident.store_id);const b=await body(req);return json(req,res,201,addEvidence({incidentId:p.incidentId,user,dataUrl:b.dataUrl,fileName:b.fileName,caption:b.caption}))}
  p=route(path,'/api/incidents/:incidentId/resolve');if(p&&req.method==='POST'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);ensureManage(user,incident.store_id);const b=await body(req);return json(req,res,200,resolveIncident({incidentId:p.incidentId,user,resolutionNote:b.resolutionNote}))}
  p=route(path,'/api/incidents/:incidentId/reopen');if(p&&req.method==='POST'){const incident=incidentById(p.incidentId);if(!incident)return json(req,res,404,{error:'Incident introuvable'});requireStore(user,incident.store_id);ensureManage(user,incident.store_id);const b=await body(req);return json(req,res,200,reopenIncident({incidentId:p.incidentId,user,note:b.note}))}
  p=route(path,'/api/media/:mediaId');if(p&&req.method==='GET'){const media=mediaById(p.mediaId);if(!media)return json(req,res,404,{error:'Preuve introuvable'});requireStore(user,media.store_id);cors(req,res);res.writeHead(200,{'content-type':media.mime_type,'content-disposition':`inline; filename="${String(media.file_name||'preuve').replaceAll('"','')}"`,'cache-control':'private, max-age=300'});return res.end(media.bytes)}

  p=route(path,'/api/stores/:storeId/dashboard');if(p){
    requireStore(user,p.storeId);const day=ensureStoreDay(p.storeId,url.searchParams.get('date')||todayISO()),opening=processProgress(day.id,'opening'),closing=processProgress(day.id,'closing');
    const dlcs=db.prepare(`SELECT * FROM dlc_records WHERE store_id=? AND status='ACTIVE' ORDER BY expiry_date`).all(p.storeId).map(x=>({...x,risk:dlcStage(x.expiry_date)})),incidentSummary=incidentStats(p.storeId),quality=db.prepare(`SELECT COUNT(*) n,COALESCE(SUM(rejected_qty),0) rejected FROM quality_controls WHERE store_id=? AND date(created_at)=?`).get(p.storeId,day.business_date);
    return json(req,res,200,{day,opening,closing,dlcAtRisk:dlcs.filter(x=>x.risk.stage!=='OK').length,incidents:incidentSummary.open,criticalIncidents:incidentSummary.critical,overdueIncidents:incidentSummary.overdue,escalatedIncidents:incidentSummary.escalated,watchIncidents:incidentSummary.watch,qualityControls:quality.n,qualityRejected:quality.rejected,health:Math.max(0,100-incidentSummary.open*6-incidentSummary.escalated*8-opening.blockers*4),lastActions:db.prepare(`SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.store_id=? ORDER BY a.id DESC LIMIT 12`).all(p.storeId)})
  }

  p=route(path,'/api/stores/:storeId/tasks');if(p){
    requireStore(user,p.storeId);const day=ensureStoreDay(p.storeId,url.searchParams.get('date')||todayISO()),group=url.searchParams.get('group'),sqlBase=`SELECT t.*,u.name completed_by_name FROM tasks t LEFT JOIN users u ON u.id=t.completed_by WHERE t.store_day_id=?`,rows=group?db.prepare(`${sqlBase} AND t.group_name=? ORDER BY t.step_order`).all(day.id,group):db.prepare(`${sqlBase} ORDER BY t.group_name,t.step_order`).all(day.id),openingOwner=day.opening_owner_id?db.prepare(`SELECT id,name FROM users WHERE id=?`).get(day.opening_owner_id):null,closingOwner=day.closing_owner_id?db.prepare(`SELECT id,name FROM users WHERE id=?`).get(day.closing_owner_id):null,processBlock=group==='opening'?'STORE_OPENING':group==='closing'?'STORE_CLOSING':null,incidents=processBlock?db.prepare(`SELECT i.*,u.name created_by_name FROM incidents i LEFT JOIN users u ON u.id=i.created_by WHERE i.store_id=? AND i.status='OPEN' AND (i.blocking_level=? OR i.source_type='TASK') ORDER BY i.created_at DESC`).all(p.storeId,processBlock):[],timeline=db.prepare(`SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.store_id=? AND a.business_date=? ORDER BY a.id DESC LIMIT 40`).all(p.storeId,day.business_date);
    return json(req,res,200,{day:{...day,opening_owner_name:openingOwner?.name||null,closing_owner_name:closingOwner?.name||null},tasks:rows,incidents,timeline,opening:processProgress(day.id,'opening'),closing:processProgress(day.id,'closing')})
  }
  p=route(path,'/api/tasks/:taskId/form');if(p){const form=getTaskForm(p.taskId);if(!form)return json(req,res,404,{error:'Tâche introuvable'});requireStore(user,form.task.store_id);return json(req,res,200,form)}
  p=route(path,'/api/tasks/:taskId/submit');if(p&&req.method==='POST'){const form=getTaskForm(p.taskId);if(!form)return json(req,res,404,{error:'Tâche introuvable'});requireStore(user,form.task.store_id);ensureManage(user,form.task.store_id);const b=await body(req),result=submitTaskForm({taskId:p.taskId,user,values:b.values||{}});return json(req,res,result.ok?200:409,result)}
  p=route(path,'/api/stores/:storeId/process/:group/take');if(p&&req.method==='POST'){requireStore(user,p.storeId);ensureManage(user,p.storeId);takeOwnership({storeDay:ensureStoreDay(p.storeId),user,group:p.group});return json(req,res,200,{ok:true})}
  p=route(path,'/api/stores/:storeId/process/:group/validate');if(p&&req.method==='POST'){requireStore(user,p.storeId);ensureManage(user,p.storeId);const day=ensureStoreDay(p.storeId),progress=validateProcess({storeDay:day,user,group:p.group});return json(req,res,200,{ok:true,progress})}

  p=route(path,'/api/stores/:storeId/dlc');if(p){
    requireStore(user,p.storeId);
    if(req.method==='GET')return json(req,res,200,db.prepare(`SELECT d.*,u.name created_by_name FROM dlc_records d JOIN users u ON u.id=d.created_by WHERE d.store_id=? ORDER BY d.expiry_date`).all(p.storeId).map(x=>({...x,risk:dlcStage(x.expiry_date)})));
    if(req.method==='POST'){ensureManage(user,p.storeId);const b=await body(req),product=await getProductByEan(b.ean);if(!product)return json(req,res,400,{error:'EAN inconnu Dynamics'});if(!b.expiryDate||!(Number(b.quantity)>0))return json(req,res,400,{error:'DLC et quantité obligatoires'});const id=uid('dlc');db.prepare(`INSERT INTO dlc_records(id,store_id,ean,product_name,expiry_date,quantity,zone,lot_ref,comment,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,p.storeId,b.ean,product.name,b.expiryDate,Number(b.quantity),b.zone||'Rayon',b.lotRef||null,b.comment||null,user.id);audit({storeId:p.storeId,userId:user.id,action:'DLC_CREATED',entityType:'DLC',entityId:id,details:{ean:b.ean,expiryDate:b.expiryDate,quantity:b.quantity}});return json(req,res,201,{id,product})}
  }

  p=route(path,'/api/stores/:storeId/quality');if(p){
    requireStore(user,p.storeId);
    if(req.method==='GET')return json(req,res,200,db.prepare(`SELECT q.*,u.name controlled_by_name FROM quality_controls q JOIN users u ON u.id=q.controlled_by WHERE q.store_id=? ORDER BY q.created_at DESC`).all(p.storeId));
    if(req.method==='POST'){
      ensureQuality(user,p.storeId);const b=await body(req),delivered=Number(b.deliveredQty),accepted=Number(b.acceptedQty),rejected=Number(b.rejectedQty);if(!Number.isFinite(delivered)||!Number.isFinite(accepted)||!Number.isFinite(rejected)||delivered<0||accepted<0||rejected<0)return json(req,res,400,{error:'Quantités invalides'});if(Math.abs(accepted+rejected-delivered)>0.0001)return json(req,res,400,{error:'Accepté + refusé doit être égal au livré'});
      const product=await getProductByEan(b.ean);if(!product)return json(req,res,400,{error:'EAN inconnu Dynamics'});const evaluation=evaluateQuality({product,temperature:b.temperature,packagingStatus:b.packagingStatus||'NA',appearanceStatus:b.appearanceStatus||'NA',expiryDate:b.expiryDate||null});if(evaluation.issues.length&&rejected===0)return json(req,res,409,{error:'Contrôle non conforme : une quantité refusée ou une correction est nécessaire.',issues:evaluation.issues,qualityProfile:evaluation.profile});
      const decision=rejected===0?'ACCEPT':accepted===0?'REJECT':'PARTIAL',id=uid('qc');db.prepare(`INSERT INTO quality_controls(id,store_id,context,po_number,ean,product_name,category,ordered_qty,delivered_qty,accepted_qty,rejected_qty,temperature,temperature_status,packaging_status,appearance_status,expiry_date,lot_ref,decision,comment,controlled_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,p.storeId,b.context||'Contrôle ponctuel',b.poNumber||null,b.ean,product.name,product.category||'Autre',b.orderedQty??null,delivered,accepted,rejected,b.temperature??null,evaluation.temperatureStatus,b.packagingStatus||'NA',b.appearanceStatus||'NA',b.expiryDate||null,b.lotRef||null,decision,b.comment||null,user.id);
      if(b.expiryDate&&accepted>0){const did=uid('dlc');db.prepare(`INSERT INTO dlc_records(id,store_id,ean,product_name,expiry_date,quantity,zone,lot_ref,comment,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(did,p.storeId,b.ean,product.name,b.expiryDate,accepted,b.zone||'Réserve',b.lotRef||null,`Créée depuis contrôle qualité ${id}`,user.id)}
      if(decision!=='ACCEPT'||evaluation.issues.length){const inc=createIncident({storeId:p.storeId,user,title:`Non-conformité qualité · ${product.name}`,description:evaluation.issues.join(' · ')||b.comment||'Contrôle qualité non conforme',category:'QUALITY',criticality:evaluation.temperatureStatus==='NOK'?'CRITICAL':'HIGH',blockingLevel:'NONE',sourceType:'QUALITY_CONTROL',sourceId:id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:true});addAction({incidentId:inc.id,user,title:'Traiter la non-conformité qualité',note:b.comment||'',assignedTo:user.role==='store_manager'?user.id:null})}
      audit({storeId:p.storeId,userId:user.id,action:'QUALITY_CONTROL_CREATED',entityType:'QUALITY_CONTROL',entityId:id,details:{ean:b.ean,decision,issues:evaluation.issues,delivered,accepted,rejected}});return json(req,res,201,{id,decision,issues:evaluation.issues,qualityProfile:evaluation.profile})
    }
  }

  p=route(path,'/api/stores/:storeId/receipts');if(p){requireStore(user,p.storeId);return json(req,res,200,db.prepare(`SELECT * FROM receipts WHERE store_id=? ORDER BY eta`).all(p.storeId).map(r=>({...r,lines:db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=?`).all(r.id)})))}
  p=route(path,'/api/receipts/:po/lines/:lineId/quality');if(p&&req.method==='POST'){
    const r=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(p.po);if(!r)return json(req,res,404,{error:'PO introuvable'});requireStore(user,r.store_id);ensureQuality(user,r.store_id);const line=db.prepare(`SELECT * FROM receipt_lines WHERE id=? AND receipt_id=?`).get(p.lineId,r.id);if(!line)return json(req,res,404,{error:'Ligne introuvable'});const b=await body(req),delivered=Number(b.deliveredQty),accepted=Number(b.acceptedQty),rejected=Number(b.rejectedQty);if(!Number.isFinite(delivered)||!Number.isFinite(accepted)||!Number.isFinite(rejected)||Math.abs(accepted+rejected-delivered)>0.0001)return json(req,res,400,{error:'Accepté + refusé doit être égal au livré'});
    const product={ean:line.ean,name:line.product_name,category:line.category||'Autre'},evaluation=evaluateQuality({product,temperature:b.temperature,packagingStatus:b.packagingStatus||'NA',appearanceStatus:b.appearanceStatus||'NA',expiryDate:b.expiryDate||null});if(evaluation.issues.length&&rejected===0)return json(req,res,409,{error:'Non-conformité détectée : renseigner la quantité refusée.',issues:evaluation.issues,qualityProfile:evaluation.profile});
    const decision=rejected===0?'ACCEPT':accepted===0?'REJECT':'PARTIAL',id=uid('qc');db.prepare(`INSERT INTO quality_controls(id,store_id,context,po_number,ean,product_name,category,ordered_qty,delivered_qty,accepted_qty,rejected_qty,temperature,temperature_status,packaging_status,appearance_status,expiry_date,lot_ref,decision,comment,controlled_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,r.store_id,'Réception',r.po_number,line.ean,line.product_name,line.category||'Autre',line.ordered_qty,delivered,accepted,rejected,b.temperature??null,evaluation.temperatureStatus,b.packagingStatus||'NA',b.appearanceStatus||'NA',b.expiryDate||null,b.lotRef||null,decision,b.comment||null,user.id);db.prepare(`UPDATE receipt_lines SET delivered_qty=?,accepted_qty=?,rejected_qty=?,quality_control_id=? WHERE id=?`).run(delivered,accepted,rejected,id,line.id);
    if(b.expiryDate&&accepted>0){const did=uid('dlc');db.prepare(`INSERT INTO dlc_records(id,store_id,ean,product_name,expiry_date,quantity,zone,lot_ref,comment,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(did,r.store_id,line.ean,line.product_name,b.expiryDate,accepted,'Réserve',b.lotRef||null,`Réception ${r.po_number}`,user.id)}
    if(decision!=='ACCEPT'||evaluation.issues.length){const inc=createIncident({storeId:r.store_id,user,title:`Non-conformité réception · ${line.product_name}`,description:evaluation.issues.join(' · ')||b.comment||'Réception non conforme',category:'RECEPTION',criticality:evaluation.temperatureStatus==='NOK'?'CRITICAL':'HIGH',blockingLevel:'NONE',sourceType:'QUALITY_CONTROL',sourceId:id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:true});addAction({incidentId:inc.id,user,title:'Décider du traitement fournisseur / produit',note:b.comment||'',assignedTo:user.role==='store_manager'?user.id:null})}
    audit({storeId:r.store_id,userId:user.id,action:'RECEIPT_LINE_CONTROLLED',entityType:'RECEIPT_LINE',entityId:line.id,details:{decision,issues:evaluation.issues,delivered,accepted,rejected}});return json(req,res,201,{id,decision,issues:evaluation.issues,qualityProfile:evaluation.profile})
  }
  p=route(path,'/api/receipts/:po/post');if(p&&req.method==='POST'){const r=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(p.po);if(!r)return json(req,res,404,{error:'PO introuvable'});requireStore(user,r.store_id);ensureQuality(user,r.store_id);const lines=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=?`).all(r.id);if(lines.some(l=>!l.quality_control_id))return json(req,res,409,{error:'Toutes les lignes doivent avoir un contrôle qualité avant réception système'});const dyn=await postReceiptToDynamics(r.po_number,{lines});db.prepare(`UPDATE receipts SET status='POSTED',posted_at=CURRENT_TIMESTAMP WHERE id=?`).run(r.id);audit({storeId:r.store_id,userId:user.id,action:'RECEIPT_POSTED',entityType:'RECEIPT',entityId:r.id,details:dyn});return json(req,res,200,dyn)}

  if(path==='/api/network'){
    ensureDirector(user);const stores=db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all();
    const rows=stores.map(s=>{const day=ensureStoreDay(s.id),opening=processProgress(day.id,'opening'),closing=processProgress(day.id,'closing'),incidentSummary=incidentStats(s.id),last=db.prepare(`SELECT a.action,a.created_at,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.store_id=? ORDER BY a.id DESC LIMIT 1`).get(s.id),qc=db.prepare(`SELECT COUNT(*) n,COALESCE(SUM(rejected_qty),0) rejected FROM quality_controls WHERE store_id=? AND date(created_at)=?`).get(s.id,day.business_date),openingOwner=day.opening_owner_id?db.prepare(`SELECT name FROM users WHERE id=?`).get(day.opening_owner_id)?.name:null,closingOwner=day.closing_owner_id?db.prepare(`SELECT name FROM users WHERE id=?`).get(day.closing_owner_id)?.name:null;return{...s,day:{...day,opening_owner_name:openingOwner,closing_owner_name:closingOwner},opening,closing,openIncidents:incidentSummary.open,criticalIncidents:incidentSummary.critical,overdueIncidents:incidentSummary.overdue,escalatedIncidents:incidentSummary.escalated,watchIncidents:incidentSummary.watch,qualityControls:qc.n,qualityRejected:qc.rejected,lastAction:last||null}});
    return json(req,res,200,rows)
  }
  return json(req,res,404,{error:'Route API inconnue'});
}

function staticFile(req,res,url){let path=url.pathname==='/'?'/index.html':url.pathname;path=normalize(path).replace(/^\.\.(\/|\\|$)/,'');const file=join(FRONTEND,path);if(!file.startsWith(FRONTEND)||!existsSync(file)){res.writeHead(404);return res.end('Not found')}const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':path==='/index.html'?'no-cache':'public, max-age=3600'});res.end(readFileSync(file))}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);return staticFile(req,res,url)}catch(e){console.error(e);return json(req,res,e.status||500,{error:e.message||'Erreur serveur',code:e.code||undefined,details:e.details||undefined})}});
server.listen(PORT,()=>console.log(`StoreOps V1.4.3 running on http://localhost:${PORT} · auth=${config.authMode} · dynamics=${config.dynamics.mode}`));
