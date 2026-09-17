import { canAccessStore,canManageStore } from './permissions.mjs';
import { listProcessTemplates,saveProcessTemplate,setProcessTemplateActive,listProcessAssignments,saveProcessAssignment,ensureProcessRuns,processRun,completeProcessStep,setProcessGate,completeProcessRun } from './process-studio.mjs';
import { todayISO } from '../db.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>4e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('Requête JSON invalide.'),{status:400,code:'REQUEST_JSON_INVALID'}))}});req.on('error',reject)})}
function director(user){if(user.role!=='ops_director')throw Object.assign(new Error('Configuration réservée à la Direction / Administrateur.'),{status:403})}
function store(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function manage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou à la Direction.'),{status:403})}
function runAccess(user,id,{write=false}={}){const run=processRun(id);if(!run)throw Object.assign(new Error('Process du jour introuvable.'),{status:404});store(user,run.store_id);if(write)manage(user,run.store_id);return run}

const STARTER_TEMPLATES=[
 {code:'LIB_OPENING_STANDARD',name:'Ouverture magasin · standard',trigger:'DAILY',steps:[['team','Vérifier équipe et prises de poste',false],['cold','Valider la chaîne du froid',false],['cash','Préparer les caisses',false],['commercial','Traiter prix et promotions du jour',false],['surface','Valider propreté, remplissage et sécurité',true]]},
 {code:'LIB_RECEIVING_STANDARD',name:'Réception fournisseur · qualité',trigger:'EVENT',steps:[['po','Identifier le PO et le fournisseur',false],['quantity','Contrôler les quantités livrées',false],['quality','Contrôler température, emballage et qualité',true],['batch','Saisir lot et DLC/DDM si requis',false],['decision','Accepter, refuser ou réceptionner partiellement',false]]},
 {code:'LIB_PRICE_PROMO',name:'Prix & promotions · exécution magasin',trigger:'EVENT',steps:[['changes','Prendre connaissance des changements Dynamics',false],['shelf','Mettre à jour prix et signalétique',true],['check','Contrôler le prix réellement affiché',false],['close','Corriger tout écart détecté',true]]},
 {code:'LIB_DLC_FEFO',name:'DLC / DDM · contrôle FEFO',trigger:'DAILY',steps:[['scan','Contrôler les produits prioritaires',false],['expiry','Identifier les lots proches de la date',false],['action','Retirer, démarquer, donner ou retourner selon la règle',true],['fefo','Remettre le rayon en FEFO',false]]},
 {code:'LIB_CYCLE_COUNT',name:'Inventaire tournant',trigger:'MANUAL',steps:[['scope','Définir le périmètre à compter',false],['count','Effectuer le premier comptage',false],['recount','Recompter les écarts',false],['reason','Justifier les écarts significatifs',true],['validate','Valider le résultat avant intégration ERP',false]]},
 {code:'LIB_LOSS',name:'Démarque & pertes · fin de journée',trigger:'CLOSING',steps:[['capture','Saisir toutes les pertes du jour',false],['reason','Qualifier chaque motif',false],['evidence','Ajouter les preuves requises',true],['approve','Valider le pack démarque',false]]},
 {code:'LIB_CLOSING_STANDARD',name:'Fermeture magasin · standard',trigger:'CLOSING',steps:[['surface','Faire le tour surface et réserve',false],['dlc','Finaliser DLC et froid',false],['loss','Finaliser démarque et pertes',false],['cash','Rapprocher les caisses',false],['handover','Préparer la passation du lendemain',false],['security','Sécuriser le magasin et l’alarme',true]]},
 {code:'LIB_SAFETY_AUDIT',name:'Audit sécurité magasin',trigger:'MANUAL',steps:[['access','Contrôler accès et issues de secours',true],['equipment','Contrôler les équipements de sécurité',true],['hazards','Identifier les risques terrain',true],['actions','Créer les actions correctives',false]]}
];
function starterInput(t){return{code:t.code,name:t.name,version:'1',trigger:t.trigger,scope:'STORE',steps:t.steps.map(([code,title,evidenceRequired],i)=>({code,title,order:i+1,required:true,evidenceRequired,blockingLevel:'PROCESS'})),gates:[]}}
function ensureStarterTemplates(user){const existing=new Set(listProcessTemplates({includeInactive:true}).map(x=>x.code));for(const t of STARTER_TEMPLATES){if(existing.has(t.code))continue;const row=saveProcessTemplate({user,input:starterInput(t)});setProcessTemplateActive({id:row.id,user,active:false})}}

export async function handleProcessStudioApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/process-templates'){
  director(user);
  if(req.method==='GET'){ensureStarterTemplates(user);return{status:200,data:{items:listProcessTemplates({includeInactive:url.searchParams.get('all')==='1'}),starterCount:STARTER_TEMPLATES.length}}}
  if(req.method==='POST'){const b=await body(req);return{status:201,data:saveProcessTemplate({user,input:b})}}
 }
 p=route(path,'/api/admin/process-templates/:templateId');if(p){director(user);if(req.method==='PUT'||req.method==='PATCH'){const b=await body(req);return{status:200,data:saveProcessTemplate({user,id:p.templateId,input:b})}}}
 p=route(path,'/api/admin/process-templates/:templateId/active');if(p&&req.method==='POST'){director(user);const b=await body(req);return{status:200,data:setProcessTemplateActive({id:p.templateId,user,active:b.active!==false})}}
 if(path==='/api/admin/process-assignments'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listProcessAssignments({storeId:url.searchParams.get('storeId')||null,includeInactive:url.searchParams.get('all')==='1'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:saveProcessAssignment({user,templateId:b.templateId,storeId:b.storeId||null,mandatory:b.mandatory!==false,blockingLevel:b.blockingLevel,effectiveFrom:b.effectiveFrom,effectiveTo:b.effectiveTo,active:b.active!==false})}}
 }
 p=route(path,'/api/admin/process-assignments/:assignmentId');if(p&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:saveProcessAssignment({user,id:p.assignmentId,templateId:b.templateId,storeId:b.storeId||null,mandatory:b.mandatory!==false,blockingLevel:b.blockingLevel,effectiveFrom:b.effectiveFrom,effectiveTo:b.effectiveTo,active:b.active!==false})}}
 p=route(path,'/api/stores/:storeId/process-runs');if(p&&req.method==='GET'){store(user,p.storeId);return{status:200,data:{storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),items:ensureProcessRuns(p.storeId,url.searchParams.get('date')||todayISO())}}}
 p=route(path,'/api/process-runs/:runId');if(p&&req.method==='GET'){return{status:200,data:runAccess(user,p.runId)}}
 p=route(path,'/api/process-runs/:runId/steps/:stepCode/complete');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});const b=await body(req);return{status:200,data:completeProcessStep({runId:p.runId,stepCode:p.stepCode,user,value:b.value??null,evidenceRef:b.evidenceRef||null,evidenceKind:b.evidenceKind||'REFERENCE',evidenceNote:b.evidenceNote||''})}}
 p=route(path,'/api/process-runs/:runId/gates/:gateCode');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});const b=await body(req);return{status:200,data:setProcessGate({runId:p.runId,gateCode:p.gateCode,user,ok:b.ok===true,detail:b.detail||''})}}
 p=route(path,'/api/process-runs/:runId/complete');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});return{status:200,data:completeProcessRun({runId:p.runId,user})}}
 return null
}
