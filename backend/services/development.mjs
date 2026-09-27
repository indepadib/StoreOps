import { db,uid } from '../db.mjs';

const clean=v=>String(v??'').trim();
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v))?clean(v):null;
const numberOrNull=(v,{min=0,max=Infinity}={})=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null};
const money=v=>numberOrNull(v,{min:0});
const pct=v=>numberOrNull(v,{min:0,max:100});
const STAGES=['CRITERIA','SOURCING','QUALIFICATION','NEGOTIATION','COMMITTEE','BUSINESS_PLAN','LEGAL_TECHNICAL','FINAL_DECISION','CLOSING_HANDOVER'];
const STAGE_LABELS={
 CRITERIA:'Cadrage & critères',
 SOURCING:'Sourcing & remontée',
 QUALIFICATION:'Qualification & visite',
 NEGOTIATION:'Négociation locative',
 COMMITTEE:'Comité Expansion',
 BUSINESS_PLAN:'Business Plan & validations',
 LEGAL_TECHNICAL:'Sécurisation juridique & technique',
 FINAL_DECISION:'Décision finale & signature',
 CLOSING_HANDOVER:'Closing & passation'
};
const PROJECT_STATUSES=['ACTIVE','ON_HOLD','CANCELLED','OPENED'];
const DECISIONS=['PENDING','GO','HOLD','NO_GO'];
const PRIORITIES=['LOW','NORMAL','HIGH','CRITICAL'];
const MILESTONES=[
 {code:'CRITERIA_CONFIRMED',label:'Critères d’implantation et format confirmés',stage:'CRITERIA',required:true},
 {code:'CANNIBALIZATION_RULE_CHECKED',label:'Règle de distance / non-cannibalisation vérifiée',stage:'CRITERIA',required:true},

 {code:'OPPORTUNITY_REGISTERED',label:'Opportunité enregistrée dans le registre unique',stage:'SOURCING',required:true},
 {code:'SOURCE_AND_INTEREST_DECLARED',label:'Source du lead et lien d’intérêt déclarés',stage:'SOURCING',required:true},
 {code:'SITE_PACK_MINIMUM',label:'Fiche site minimale complétée (géolocalisation, surfaces, photos, loyer)',stage:'SOURCING',required:true},
 {code:'TITLE_DEED_PRECHECK',label:'Titre de propriété collecté ou indisponibilité tracée',stage:'SOURCING',required:true},

 {code:'DESK_SCREENING_DONE',label:'Étude préliminaire sur dossier réalisée',stage:'QUALIFICATION',required:true},
 {code:'WEIGHTED_SCORECARD_DONE',label:'Grille pondérée de qualification complétée',stage:'QUALIFICATION',required:true},
 {code:'QUALIFICATION_VISIT_DONE',label:'Visite de qualification réalisée',stage:'QUALIFICATION',required:true},
 {code:'SITE_ANALYSIS_COMPLETE',label:'Zone, visibilité, accès, concurrence et exploitabilité analysés',stage:'QUALIFICATION',required:true},

 {code:'RENTAL_TERMS_NEGOTIATED',label:'Conditions locatives négociées sans engagement',stage:'NEGOTIATION',required:true},
 {code:'NEGOTIATION_SHEET_COMPLETE',label:'Fiche de négociation complétée',stage:'NEGOTIATION',required:true},
 {code:'NO_PREMATURE_COMMITMENT',label:'Absence d’engagement / dépôt / avance avant validation confirmée',stage:'NEGOTIATION',required:true},

 {code:'COMMITTEE_PACK_COMPLETE',label:'Dossier standard Comité Expansion complet',stage:'COMMITTEE',required:true},
 {code:'COMMITTEE_OPINION_RECORDED',label:'Avis Comité Expansion tracé',stage:'COMMITTEE',required:true},
 {code:'COMMITTEE_RESERVATIONS_CLEARED',label:'Réserves du Comité levées ou non applicables',stage:'COMMITTEE',required:true},

 {code:'BP_INPUTS_COMPLETE',label:'Hypothèses Expansion / Exploitation / Technique transmises',stage:'BUSINESS_PLAN',required:true},
 {code:'OPERATIONS_OPINION_RECORDED',label:'Avis Exploitation sur les hypothèses opérationnelles obtenu',stage:'BUSINESS_PLAN',required:true},
 {code:'BP_CONTROL_APPROVED',label:'Business Plan établi et challengé par le Contrôle de Gestion',stage:'BUSINESS_PLAN',required:true},
 {code:'BP_DAF_REVIEWED',label:'Business Plan revu par la DAF',stage:'BUSINESS_PLAN',required:true},
 {code:'BP_DG_APPROVED',label:'Business Plan approuvé par la Direction Générale',stage:'BUSINESS_PLAN',required:true},

 {code:'LEGAL_DUE_DILIGENCE_DONE',label:'Titre, bailleur et projet de bail validés par le Juridique',stage:'LEGAL_TECHNICAL',required:true},
 {code:'TECHNICAL_FEASIBILITY_APPROVED',label:'Faisabilité technique et contraintes travaux validées',stage:'LEGAL_TECHNICAL',required:true},
 {code:'BLOCKING_RESERVATIONS_CLEARED',label:'Réserves juridiques / techniques bloquantes levées',stage:'LEGAL_TECHNICAL',required:true},

 {code:'FINAL_FILE_COMPLETE',label:'Dossier de décision finale complet',stage:'FINAL_DECISION',required:true},
 {code:'DG_COMMITMENT_AUTHORIZED',label:'Engagement final autorisé par la Direction Générale',stage:'FINAL_DECISION',required:true},
 {code:'CONTRACT_SIGNED',label:'Bail / contrat signé par le représentant habilité',stage:'FINAL_DECISION',required:true},
 {code:'QHSE_NOTIFIED',label:'QHSE / Moyens Généraux informés pour lancer les autorisations',stage:'FINAL_DECISION',required:true},

 {code:'KEYS_AND_CLOSING_COMPLETE',label:'Closing immobilier et remise des clés finalisés',stage:'CLOSING_HANDOVER',required:true},
 {code:'HANDOVER_PACK_COMPLETE',label:'Dossier de passation Projet / Travaux / Exploitation complet',stage:'CLOSING_HANDOVER',required:true},
 {code:'HANDOVER_DEADLINE_RESPECTED',label:'Délai de passation Franprix T-6 sem. / Monoprix T-10 sem. contrôlé',stage:'CLOSING_HANDOVER',required:true},
 {code:'ARCHIVE_COMPLETE',label:'Dossier final archivé avec traçabilité complète',stage:'CLOSING_HANDOVER',required:true}
];

function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}

db.exec(`
CREATE TABLE IF NOT EXISTS development_projects(
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 city TEXT NOT NULL,
 address TEXT NULL,
 zone TEXT NULL,
 source_lead TEXT NULL,
 surface_m2 REAL NULL,
 landlord TEXT NULL,
 monthly_rent REAL NULL,
 key_money REAL NULL,
 capex_budget REAL NULL,
 target_opening_date TEXT NULL,
 owner_user_id TEXT NULL REFERENCES users(id),
 stage TEXT NOT NULL DEFAULT 'SOURCING',
 status TEXT NOT NULL DEFAULT 'ACTIVE',
 notes TEXT NULL,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS development_milestones(
 project_id TEXT NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
 code TEXT NOT NULL,
 label TEXT NOT NULL,
 stage TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 due_date TEXT NULL,
 completed_at TEXT NULL,
 completed_by TEXT NULL REFERENCES users(id),
 note TEXT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(project_id,code)
);
CREATE TABLE IF NOT EXISTS development_history(
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES development_projects(id) ON DELETE CASCADE,
 event_type TEXT NOT NULL,
 stage TEXT NULL,
 detail TEXT NULL,
 user_id TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_development_projects_stage ON development_projects(status,stage,target_opening_date);
CREATE INDEX IF NOT EXISTS ix_development_history_project ON development_history(project_id,created_at);
`);
ensureColumn('development_projects','decision',"TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn('development_projects','priority',"TEXT NOT NULL DEFAULT 'NORMAL'");
ensureColumn('development_projects','site_score','REAL NULL');
ensureColumn('development_projects','economic_score','REAL NULL');
ensureColumn('development_projects','capex_committed','REAL NULL');
ensureColumn('development_projects','capex_actual','REAL NULL');
ensureColumn('development_projects','works_progress','REAL NOT NULL DEFAULT 0');
ensureColumn('development_projects','next_action','TEXT NULL');
ensureColumn('development_projects','next_action_due_date','TEXT NULL');
ensureColumn('development_projects','blocker','TEXT NULL');
ensureColumn('development_projects','contract_signed_date','TEXT NULL');
ensureColumn('development_projects','works_start_date','TEXT NULL');
ensureColumn('development_projects','works_end_date','TEXT NULL');
ensureColumn('development_projects','opening_date','TEXT NULL');
ensureColumn('development_projects','brand',"TEXT NOT NULL DEFAULT 'FRANPRIX'");
ensureColumn('development_projects','conflict_of_interest',"INTEGER NOT NULL DEFAULT 0");
ensureColumn('development_projects','conflict_details','TEXT NULL');
ensureColumn('development_projects','committee_opinion',"TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn('development_projects','bp_status',"TEXT NOT NULL DEFAULT 'NOT_STARTED'");
ensureColumn('development_projects','legal_status',"TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn('development_projects','technical_status',"TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn('development_projects','surface_ground_floor_m2','REAL NULL');
ensureColumn('development_projects','surface_mezzanine_m2','REAL NULL');
ensureColumn('development_projects','surface_basement_m2','REAL NULL');
ensureColumn('development_projects','parking_available','INTEGER NULL');
ensureColumn('development_projects','geolocation','TEXT NULL');
ensureColumn('development_projects','monthly_charges','REAL NULL');
ensureColumn('development_projects','lease_duration_months','REAL NULL');
ensureColumn('development_projects','rent_free_months','REAL NULL');
ensureColumn('development_projects','title_deed_status',"TEXT NOT NULL DEFAULT 'PENDING'");
ensureColumn('development_projects','committee_reservations','TEXT NULL');
ensureColumn('development_projects','legal_reservations','TEXT NULL');
ensureColumn('development_projects','technical_reservations','TEXT NULL');
ensureColumn('development_projects','handover_date','TEXT NULL');

db.prepare(`UPDATE development_projects SET stage=CASE stage
 WHEN 'CONTRACT' THEN 'FINAL_DECISION'
 WHEN 'WORKS' THEN 'CLOSING_HANDOVER'
 WHEN 'PREOPENING' THEN 'CLOSING_HANDOVER'
 WHEN 'OPEN' THEN 'CLOSING_HANDOVER'
 ELSE stage END
 WHERE stage IN ('CONTRACT','WORKS','PREOPENING','OPEN')`).run();

function projectRow(id){return db.prepare(`SELECT p.*,u.name owner_name FROM development_projects p LEFT JOIN users u ON u.id=p.owner_user_id WHERE p.id=?`).get(id)}
function log(projectId,user,eventType,stage,detail){db.prepare(`INSERT INTO development_history(id,project_id,event_type,stage,detail,user_id) VALUES(?,?,?,?,?,?)`).run(uid('devhist'),projectId,eventType,stage||null,clean(detail)||null,user?.id||null)}
function seedMilestones(projectId){const ins=db.prepare(`INSERT OR IGNORE INTO development_milestones(project_id,code,label,stage) VALUES(?,?,?,?)`);for(const m of MILESTONES)ins.run(projectId,m.code,m.label,m.stage)}
function stageIndex(stage){return STAGES.indexOf(stage)}
function requireStage(stage){const s=String(stage||'').toUpperCase();if(!STAGES.includes(s))throw Object.assign(new Error('Étape développement invalide.'),{status:400,code:'DEVELOPMENT_STAGE_INVALID'});return s}
function enumValue(value,allowed,label,defaultValue){const s=String(value??defaultValue).toUpperCase();if(!allowed.includes(s))throw Object.assign(new Error(`${label} invalide.`),{status:400,code:`DEVELOPMENT_${label.toUpperCase().replaceAll(' ','_')}_INVALID`});return s}
function requireStatus(v){return enumValue(v,PROJECT_STATUSES,'statut projet','ACTIVE')}
function requireDecision(v){return enumValue(v,DECISIONS,'décision','PENDING')}
function requirePriority(v){return enumValue(v,PRIORITIES,'priorité','NORMAL')}
function validateOwner(id){if(!id)return null;const row=db.prepare(`SELECT id,name,active,permissions_profile FROM users WHERE id=?`).get(id);if(!row||!row.active)throw Object.assign(new Error('Responsable projet introuvable ou inactif.'),{status:404,code:'DEVELOPMENT_OWNER_NOT_FOUND'});return row.id}
function safeDate(v,label){if(v===null||v===undefined||v==='')return null;const d=iso(v);if(!d)throw Object.assign(new Error(`${label} invalide.`),{status:400,code:'DEVELOPMENT_DATE_INVALID'});return d}
function milestoneDefinition(code){return MILESTONES.find(x=>x.code===code)||null}
function stageReadiness(row,milestones,targetStage=null){
 const currentIndex=stageIndex(row.stage),targetIndex=targetStage?stageIndex(targetStage):Math.min(currentIndex+1,STAGES.length-1);
 const required=milestones.filter(m=>{const def=milestoneDefinition(m.code);return def?.required&&stageIndex(m.stage)<targetIndex});
 const incomplete=required.filter(m=>m.status!=='DONE').map(m=>({code:m.code,label:m.label,stage:m.stage,status:m.status,dueDate:m.due_date||null}));
 const done=code=>milestones.some(m=>m.code===code&&m.status==='DONE');
 if(targetIndex>stageIndex('SOURCING')&&Number(row.conflict_of_interest||0)===1&&!clean(row.conflict_details))incomplete.unshift({code:'CONFLICT_MITIGATION_REQUIRED',label:'Lien d’intérêt : analyse / mitigation obligatoire avant poursuite',stage:'SOURCING',status:'BLOCKED',dueDate:null});
 if(targetIndex>stageIndex('COMMITTEE')){
  if(row.decision==='NO_GO')incomplete.unshift({code:'PROJECT_DECISION_NO_GO',label:'Le dossier est en NO GO',stage:'COMMITTEE',status:'NO_GO',dueDate:null});
  if(!['FAVORABLE','RESERVATIONS'].includes(String(row.committee_opinion||'PENDING')))incomplete.unshift({code:'COMMITTEE_FAVORABLE_REQUIRED',label:'Avis favorable du Comité Expansion requis',stage:'COMMITTEE',status:row.committee_opinion||'PENDING',dueDate:null});
  if(row.committee_opinion==='RESERVATIONS'&&!done('COMMITTEE_RESERVATIONS_CLEARED'))incomplete.unshift({code:'COMMITTEE_RESERVATIONS_OPEN',label:'Réserves Comité à lever formellement',stage:'COMMITTEE',status:'RESERVATIONS',dueDate:null});
 }
 if(targetIndex>stageIndex('BUSINESS_PLAN')&&row.bp_status!=='DG_APPROVED')incomplete.unshift({code:'BP_DG_STATUS_REQUIRED',label:'BP approuvé par la Direction Générale requis',stage:'BUSINESS_PLAN',status:row.bp_status||'NOT_STARTED',dueDate:null});
 if(targetIndex>stageIndex('LEGAL_TECHNICAL')){
  if(row.legal_status!=='APPROVED')incomplete.unshift({code:'LEGAL_APPROVAL_REQUIRED',label:'Validation Juridique requise',stage:'LEGAL_TECHNICAL',status:row.legal_status||'PENDING',dueDate:null});
  if(row.technical_status!=='APPROVED')incomplete.unshift({code:'TECHNICAL_APPROVAL_REQUIRED',label:'Validation Technique requise',stage:'LEGAL_TECHNICAL',status:row.technical_status||'PENDING',dueDate:null});
 }
 if(targetIndex>stageIndex('FINAL_DECISION')&&row.decision!=='GO')incomplete.unshift({code:'PROJECT_GO_DECISION',label:'Décision projet = GO avant closing',stage:'FINAL_DECISION',status:row.decision||'PENDING',dueDate:null});
 return{ready:incomplete.length===0,targetStage:STAGES[targetIndex]||null,incomplete,count:incomplete.length}
}
function dateDiffDays(date){if(!date)return null;const ms=new Date(`${date}T12:00:00Z`).getTime()-Date.now();return Number.isFinite(ms)?Math.ceil(ms/86400000):null}
function subtractDays(date,days){if(!date||!Number.isFinite(Number(days)))return null;const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-Number(days));return d.toISOString().slice(0,10)}
function formatCompliance(row){
 const brand=String(row.brand||'FRANPRIX').toUpperCase(),ground=row.surface_ground_floor_m2??row.surface_m2,total=row.surface_m2??([row.surface_ground_floor_m2,row.surface_mezzanine_m2,row.surface_basement_m2].filter(x=>x!=null).reduce((a,b)=>a+Number(b),0)||null);
 if(brand==='FRANPRIX'){if(ground==null)return{status:'UNKNOWN',label:'Surface RDC à renseigner',rules:['RDC 350–550 m²']};const ok=Number(ground)>=350&&Number(ground)<=550;return{status:ok?'COMPLIANT':'OUT_OF_RANGE',label:ok?'Format Franprix conforme':'Surface RDC hors cible Franprix',rules:['RDC 350–550 m²'],groundFloorM2:Number(ground)}}
 if(brand==='MONOPRIX'){const surfaceOk=total!=null&&Number(total)>=1800&&Number(total)<=3000,parkingKnown=row.parking_available!==null&&row.parking_available!==undefined,parkingOk=Number(row.parking_available)===1;if(total==null||!parkingKnown)return{status:'UNKNOWN',label:'Surface / parking Monoprix à compléter',rules:['1 800–3 000 m²','Parking obligatoire']};return{status:surfaceOk&&parkingOk?'COMPLIANT':'OUT_OF_RANGE',label:surfaceOk&&parkingOk?'Format Monoprix conforme':'Critère Monoprix non respecté',rules:['1 800–3 000 m²','Parking obligatoire'],totalM2:Number(total),parking:parkingOk}}
 return{status:'NOT_CONFIGURED',label:'Critères enseigne à définir par le Management',rules:[]}
}
function handoverView(row,milestones){
 const brand=String(row.brand||'').toUpperCase(),leadDays=brand==='MONOPRIX'?70:brand==='FRANPRIX'?42:null,dueDate=leadDays?subtractDays(row.target_opening_date,leadDays):null,done=milestones.some(m=>m.code==='HANDOVER_PACK_COMPLETE'&&m.status==='DONE'),days=dateDiffDays(dueDate);
 return{leadDays,dueDate,daysRemaining:days,status:done?'COMPLETE':days===null?'UNKNOWN':days<0?'LATE':days<=14?'DUE_SOON':'ON_TRACK'}
}
function riskView(row){
 if(row.status==='CANCELLED')return{code:'CANCELLED',label:'Annulé',severity:'neutral'};
 if(row.blocker)return{code:'BLOCKED',label:'Bloqué',severity:'danger'};
 const actionDays=dateDiffDays(row.next_action_due_date);if(actionDays!==null&&actionDays<0&&row.next_action)return{code:'ACTION_LATE',label:'Action en retard',severity:'danger'};
 const openingDays=dateDiffDays(row.target_opening_date);if(openingDays!==null&&openingDays<0&&row.stage!=='CLOSING_HANDOVER')return{code:'OPENING_LATE',label:'Ouverture en retard',severity:'danger'};
 if(openingDays!==null&&openingDays<=30&&row.stage!=='CLOSING_HANDOVER')return{code:'OPENING_SOON',label:'Ouverture ≤ 30 j',severity:'warn'};
 if(row.status==='ON_HOLD'||row.decision==='HOLD')return{code:'ON_HOLD',label:'En pause',severity:'warn'};
 return{code:'ON_TRACK',label:'Sous contrôle',severity:'ok'}
}
function hydrate(row){
 if(!row)return null;seedMilestones(row.id);
 const milestones=db.prepare(`SELECT * FROM development_milestones WHERE project_id=? ORDER BY CASE stage ${STAGES.map((s,i)=>`WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END,code`).all(row.id).filter(m=>milestoneDefinition(m.code)),history=db.prepare(`SELECT h.*,u.name user_name FROM development_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.project_id=? ORDER BY h.created_at DESC LIMIT 100`).all(row.id),done=milestones.filter(x=>x.status==='DONE').length,readiness=stageReadiness(row,milestones),capexVariance=row.capex_budget===null||row.capex_actual===null?null:Number(row.capex_actual)-Number(row.capex_budget);
 const format=formatCompliance(row),handover=handoverView(row,milestones);return{...row,parking_available:row.parking_available==null?null:!!row.parking_available,progress:milestones.length?Math.round(done*100/milestones.length):0,milestones,history,stageReadiness:readiness,risk:riskView(row),daysToOpening:dateDiffDays(row.target_opening_date),capexVariance,formatCompliance:format,handover}
}

export function developmentConfig(){return{stages:STAGES.map(code=>({code,label:STAGE_LABELS[code]})),statuses:PROJECT_STATUSES,decisions:DECISIONS,priorities:PRIORITIES,milestones:MILESTONES}}
export function listDevelopmentProjects({includeClosed=true}={}){const rows=db.prepare(`SELECT p.*,u.name owner_name FROM development_projects p LEFT JOIN users u ON u.id=p.owner_user_id ${includeClosed?'':"WHERE p.status IN ('ACTIVE','ON_HOLD')"} ORDER BY CASE p.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,CASE p.status WHEN 'ACTIVE' THEN 0 WHEN 'ON_HOLD' THEN 1 WHEN 'OPENED' THEN 2 ELSE 3 END,COALESCE(p.target_opening_date,'9999-12-31'),p.updated_at DESC`).all();return rows.map(hydrate)}
export function developmentProject(id){return hydrate(projectRow(id))}

function normalizedProjectInput(input,current={}){
 const name=input.name===undefined?current.name:clean(input.name),city=input.city===undefined?current.city:clean(input.city);if(!name||!city)throw Object.assign(new Error('Nom du projet et ville obligatoires.'),{status:400,code:'DEVELOPMENT_REQUIRED_FIELDS'});
 const dateField=(key,currentKey,label)=>input[key]===undefined?(current[currentKey]??null):safeDate(input[key],label);
 return{
  name,city,
  address:input.address===undefined?(current.address??null):clean(input.address)||null,
  zone:input.zone===undefined?(current.zone??null):clean(input.zone)||null,
  sourceLead:input.sourceLead===undefined?(current.source_lead??null):clean(input.sourceLead)||null,
  surfaceM2:input.surfaceM2===undefined?(current.surface_m2??null):numberOrNull(input.surfaceM2,{min:0}),
  landlord:input.landlord===undefined?(current.landlord??null):clean(input.landlord)||null,
  monthlyRent:input.monthlyRent===undefined?(current.monthly_rent??null):money(input.monthlyRent),
  keyMoney:input.keyMoney===undefined?(current.key_money??null):money(input.keyMoney),
  capexBudget:input.capexBudget===undefined?(current.capex_budget??null):money(input.capexBudget),
  capexCommitted:input.capexCommitted===undefined?(current.capex_committed??null):money(input.capexCommitted),
  capexActual:input.capexActual===undefined?(current.capex_actual??null):money(input.capexActual),
  targetOpeningDate:dateField('targetOpeningDate','target_opening_date','Date cible'),
  contractSignedDate:dateField('contractSignedDate','contract_signed_date','Date de signature'),
  worksStartDate:dateField('worksStartDate','works_start_date','Date de démarrage travaux'),
  worksEndDate:dateField('worksEndDate','works_end_date','Date de fin travaux'),
  openingDate:dateField('openingDate','opening_date','Date d’ouverture'),
  nextActionDueDate:dateField('nextActionDueDate','next_action_due_date','Date prochaine action'),
  ownerUserId:input.ownerUserId===undefined?(current.owner_user_id??null):validateOwner(input.ownerUserId||null),
  status:input.status===undefined?(current.status||'ACTIVE'):requireStatus(input.status),
  decision:input.decision===undefined?(current.decision||'PENDING'):requireDecision(input.decision),
  priority:input.priority===undefined?(current.priority||'NORMAL'):requirePriority(input.priority),
  siteScore:input.siteScore===undefined?(current.site_score??null):numberOrNull(input.siteScore,{min:0,max:100}),
  economicScore:input.economicScore===undefined?(current.economic_score??null):numberOrNull(input.economicScore,{min:0,max:100}),
  worksProgress:input.worksProgress===undefined?Number(current.works_progress||0):pct(input.worksProgress)??0,
  nextAction:input.nextAction===undefined?(current.next_action??null):clean(input.nextAction)||null,
  blocker:input.blocker===undefined?(current.blocker??null):clean(input.blocker)||null,
  notes:input.notes===undefined?(current.notes??null):clean(input.notes)||null,
  brand:input.brand===undefined?(current.brand||'FRANPRIX'):clean(input.brand||'FRANPRIX').toUpperCase(),
  conflictOfInterest:input.conflictOfInterest===undefined?Boolean(current.conflict_of_interest):Boolean(input.conflictOfInterest),
  conflictDetails:input.conflictDetails===undefined?(current.conflict_details??null):clean(input.conflictDetails)||null,
  committeeOpinion:input.committeeOpinion===undefined?(current.committee_opinion||'PENDING'):clean(input.committeeOpinion||'PENDING').toUpperCase(),
  bpStatus:input.bpStatus===undefined?(current.bp_status||'NOT_STARTED'):clean(input.bpStatus||'NOT_STARTED').toUpperCase(),
  legalStatus:input.legalStatus===undefined?(current.legal_status||'PENDING'):clean(input.legalStatus||'PENDING').toUpperCase(),
  technicalStatus:input.technicalStatus===undefined?(current.technical_status||'PENDING'):clean(input.technicalStatus||'PENDING').toUpperCase(),
  surfaceGroundFloorM2:input.surfaceGroundFloorM2===undefined?(current.surface_ground_floor_m2??null):numberOrNull(input.surfaceGroundFloorM2,{min:0}),
  surfaceMezzanineM2:input.surfaceMezzanineM2===undefined?(current.surface_mezzanine_m2??null):numberOrNull(input.surfaceMezzanineM2,{min:0}),
  surfaceBasementM2:input.surfaceBasementM2===undefined?(current.surface_basement_m2??null):numberOrNull(input.surfaceBasementM2,{min:0}),
  parkingAvailable:input.parkingAvailable===undefined?(current.parking_available==null?null:Boolean(current.parking_available)):(input.parkingAvailable===null||input.parkingAvailable===''?null:Boolean(input.parkingAvailable)),
  geolocation:input.geolocation===undefined?(current.geolocation??null):clean(input.geolocation)||null,
  monthlyCharges:input.monthlyCharges===undefined?(current.monthly_charges??null):money(input.monthlyCharges),
  leaseDurationMonths:input.leaseDurationMonths===undefined?(current.lease_duration_months??null):numberOrNull(input.leaseDurationMonths,{min:0}),
  rentFreeMonths:input.rentFreeMonths===undefined?(current.rent_free_months??null):numberOrNull(input.rentFreeMonths,{min:0}),
  titleDeedStatus:input.titleDeedStatus===undefined?(current.title_deed_status||'PENDING'):clean(input.titleDeedStatus||'PENDING').toUpperCase(),
  committeeReservations:input.committeeReservations===undefined?(current.committee_reservations??null):clean(input.committeeReservations)||null,
  legalReservations:input.legalReservations===undefined?(current.legal_reservations??null):clean(input.legalReservations)||null,
  technicalReservations:input.technicalReservations===undefined?(current.technical_reservations??null):clean(input.technicalReservations)||null,
  handoverDate:dateField('handoverDate','handover_date','Date de passation')
 }
}

export function createDevelopmentProject({user,input={}}){
 const n=normalizedProjectInput(input,{}),id=uid('devproj'),stage=requireStage(input.stage||'CRITERIA');
 db.prepare(`INSERT INTO development_projects(id,name,city,address,zone,source_lead,surface_m2,landlord,monthly_rent,key_money,capex_budget,capex_committed,capex_actual,target_opening_date,owner_user_id,stage,status,decision,priority,site_score,economic_score,works_progress,next_action,next_action_due_date,blocker,contract_signed_date,works_start_date,works_end_date,opening_date,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,n.name,n.city,n.address,n.zone,n.sourceLead,n.surfaceM2,n.landlord,n.monthlyRent,n.keyMoney,n.capexBudget,n.capexCommitted,n.capexActual,n.targetOpeningDate,n.ownerUserId,stage,n.status,n.decision,n.priority,n.siteScore,n.economicScore,n.worksProgress,n.nextAction,n.nextActionDueDate,n.blocker,n.contractSignedDate,n.worksStartDate,n.worksEndDate,n.openingDate,n.notes,user?.id||null,user?.id||null);
 db.prepare(`UPDATE development_projects SET brand=?,conflict_of_interest=?,conflict_details=?,committee_opinion=?,bp_status=?,legal_status=?,technical_status=?,surface_ground_floor_m2=?,surface_mezzanine_m2=?,surface_basement_m2=?,parking_available=?,geolocation=?,monthly_charges=?,lease_duration_months=?,rent_free_months=?,title_deed_status=?,committee_reservations=?,legal_reservations=?,technical_reservations=?,handover_date=? WHERE id=?`).run(n.brand,n.conflictOfInterest?1:0,n.conflictDetails,n.committeeOpinion,n.bpStatus,n.legalStatus,n.technicalStatus,n.surfaceGroundFloorM2,n.surfaceMezzanineM2,n.surfaceBasementM2,n.parkingAvailable==null?null:(n.parkingAvailable?1:0),n.geolocation,n.monthlyCharges,n.leaseDurationMonths,n.rentFreeMonths,n.titleDeedStatus,n.committeeReservations,n.legalReservations,n.technicalReservations,n.handoverDate,id);
 seedMilestones(id);log(id,user,'PROJECT_CREATED',stage,'Projet développement créé selon la procédure Expansion 2026');return developmentProject(id)
}

export function updateDevelopmentProject({user,id,input={}}){
 const current=projectRow(id);if(!current)throw Object.assign(new Error('Projet développement introuvable.'),{status:404,code:'DEVELOPMENT_PROJECT_NOT_FOUND'});const n=normalizedProjectInput(input,current);
 db.prepare(`UPDATE development_projects SET name=?,city=?,address=?,zone=?,source_lead=?,surface_m2=?,landlord=?,monthly_rent=?,key_money=?,capex_budget=?,capex_committed=?,capex_actual=?,target_opening_date=?,owner_user_id=?,status=?,decision=?,priority=?,site_score=?,economic_score=?,works_progress=?,next_action=?,next_action_due_date=?,blocker=?,contract_signed_date=?,works_start_date=?,works_end_date=?,opening_date=?,notes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(n.name,n.city,n.address,n.zone,n.sourceLead,n.surfaceM2,n.landlord,n.monthlyRent,n.keyMoney,n.capexBudget,n.capexCommitted,n.capexActual,n.targetOpeningDate,n.ownerUserId,n.status,n.decision,n.priority,n.siteScore,n.economicScore,n.worksProgress,n.nextAction,n.nextActionDueDate,n.blocker,n.contractSignedDate,n.worksStartDate,n.worksEndDate,n.openingDate,n.notes,user?.id||null,id);
 db.prepare(`UPDATE development_projects SET brand=?,conflict_of_interest=?,conflict_details=?,committee_opinion=?,bp_status=?,legal_status=?,technical_status=?,surface_ground_floor_m2=?,surface_mezzanine_m2=?,surface_basement_m2=?,parking_available=?,geolocation=?,monthly_charges=?,lease_duration_months=?,rent_free_months=?,title_deed_status=?,committee_reservations=?,legal_reservations=?,technical_reservations=?,handover_date=? WHERE id=?`).run(n.brand,n.conflictOfInterest?1:0,n.conflictDetails,n.committeeOpinion,n.bpStatus,n.legalStatus,n.technicalStatus,n.surfaceGroundFloorM2,n.surfaceMezzanineM2,n.surfaceBasementM2,n.parkingAvailable==null?null:(n.parkingAvailable?1:0),n.geolocation,n.monthlyCharges,n.leaseDurationMonths,n.rentFreeMonths,n.titleDeedStatus,n.committeeReservations,n.legalReservations,n.technicalReservations,n.handoverDate,id);
 log(id,user,'PROJECT_UPDATED',current.stage,'Fiche projet mise à jour');return developmentProject(id)
}

export function setDevelopmentStage({user,id,stage,note='',force=false}){
 const current=projectRow(id);if(!current)throw Object.assign(new Error('Projet développement introuvable.'),{status:404,code:'DEVELOPMENT_PROJECT_NOT_FOUND'});const next=requireStage(stage),currentIndex=stageIndex(current.stage),nextIndex=stageIndex(next);if(next===current.stage)return developmentProject(id);
 if(nextIndex>currentIndex){const hydrated=developmentProject(id),readiness=stageReadiness(current,hydrated.milestones,next);if(!readiness.ready&&!force)throw Object.assign(new Error(`${readiness.count} prérequis restent à terminer avant ${STAGE_LABELS[next]}.`),{status:409,code:'DEVELOPMENT_STAGE_GATE_BLOCKED',details:readiness});if(!readiness.ready&&force&&!clean(note))throw Object.assign(new Error('Un motif est obligatoire pour forcer le passage d’étape.'),{status:400,code:'DEVELOPMENT_STAGE_OVERRIDE_REASON_REQUIRED'});if(!readiness.ready&&force)log(id,user,'STAGE_GATE_OVERRIDDEN',next,`Override vers ${next} · ${clean(note)}`)}
 const status=current.status==='OPENED'?'ACTIVE':current.status;db.prepare(`UPDATE development_projects SET stage=?,status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next,status,user?.id||null,id);log(id,user,'STAGE_CHANGED',next,note||`${current.stage} → ${next}`);return developmentProject(id)
}

export function setDevelopmentMilestone({user,id,code,status='DONE',dueDate=undefined,note=''}){
 const project=projectRow(id);if(!project)throw Object.assign(new Error('Projet développement introuvable.'),{status:404,code:'DEVELOPMENT_PROJECT_NOT_FOUND'});seedMilestones(id);const row=db.prepare(`SELECT * FROM development_milestones WHERE project_id=? AND code=?`).get(id,String(code||'').toUpperCase());if(!row||!milestoneDefinition(row.code))throw Object.assign(new Error('Jalon développement introuvable.'),{status:404,code:'DEVELOPMENT_MILESTONE_NOT_FOUND'});const next=String(status||'DONE').toUpperCase();if(!['PENDING','IN_PROGRESS','DONE','BLOCKED'].includes(next))throw Object.assign(new Error('Statut jalon invalide.'),{status:400,code:'DEVELOPMENT_MILESTONE_STATUS_INVALID'});const due=dueDate===undefined?row.due_date:safeDate(dueDate,'Date de jalon');db.prepare(`UPDATE development_milestones SET status=?,due_date=?,completed_at=?,completed_by=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND code=?`).run(next,due,next==='DONE'?new Date().toISOString():null,next==='DONE'?user?.id||null:null,clean(note)||null,id,row.code);
 if(row.code==='CONTRACT_SIGNED'&&next==='DONE'&&!project.contract_signed_date)db.prepare(`UPDATE development_projects SET contract_signed_date=date('now') WHERE id=?`).run(id);
 if(row.code==='COMMITTEE_OPINION_RECORDED'&&next==='DONE'&&project.committee_opinion==='PENDING')db.prepare(`UPDATE development_projects SET committee_opinion='FAVORABLE' WHERE id=?`).run(id);
 if(row.code==='BP_DG_APPROVED'&&next==='DONE')db.prepare(`UPDATE development_projects SET bp_status='DG_APPROVED' WHERE id=?`).run(id);
 if(row.code==='LEGAL_DUE_DILIGENCE_DONE'&&next==='DONE')db.prepare(`UPDATE development_projects SET legal_status='APPROVED' WHERE id=?`).run(id);
 if(row.code==='TECHNICAL_FEASIBILITY_APPROVED'&&next==='DONE')db.prepare(`UPDATE development_projects SET technical_status='APPROVED' WHERE id=?`).run(id);
 if(row.code==='CONTRACT_SIGNED'&&next==='DONE')db.prepare(`UPDATE development_projects SET decision='GO' WHERE id=?`).run(id);
 log(id,user,'MILESTONE_UPDATED',row.stage,`${row.label} · ${next}${note?` · ${clean(note)}`:''}`);return developmentProject(id)
}

export function developmentUsers(){return db.prepare(`SELECT id,name,email,permissions_profile,active FROM users WHERE active=1 AND (permissions_profile='development' OR permissions_profile='platform_admin' OR id='u-admin') ORDER BY name`).all()}
