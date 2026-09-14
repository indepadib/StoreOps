import { db,uid } from '../db.mjs';

const clean=v=>String(v??'').trim();
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v))?clean(v):null;
const money=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const STAGES=['SOURCING','QUALIFICATION','NEGOTIATION','CONTRACT','WORKS','PREOPENING','OPEN'];
const PROJECT_STATUSES=['ACTIVE','ON_HOLD','CANCELLED','OPENED'];
const MILESTONES=[
 {code:'SITE_SOURCED',label:'Local sourcé',stage:'SOURCING'},
 {code:'FEASIBILITY_APPROVED',label:'Étude de faisabilité validée',stage:'QUALIFICATION'},
 {code:'DEAL_AGREED',label:'Conditions commerciales négociées',stage:'NEGOTIATION'},
 {code:'CONTRACT_SIGNED',label:'Contrat signé',stage:'CONTRACT'},
 {code:'WORKS_STARTED',label:'Travaux démarrés',stage:'WORKS'},
 {code:'WORKS_COMPLETED',label:'Travaux terminés',stage:'WORKS'},
 {code:'OPENING_READY',label:'Pré-ouverture validée',stage:'PREOPENING'},
 {code:'STORE_OPENED',label:'Magasin ouvert',stage:'OPEN'}
];

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

function projectRow(id){return db.prepare(`SELECT p.*,u.name owner_name FROM development_projects p LEFT JOIN users u ON u.id=p.owner_user_id WHERE p.id=?`).get(id)}
function log(projectId,user,eventType,stage,detail){db.prepare(`INSERT INTO development_history(id,project_id,event_type,stage,detail,user_id) VALUES(?,?,?,?,?,?)`).run(uid('devhist'),projectId,eventType,stage||null,clean(detail)||null,user?.id||null)}
function seedMilestones(projectId){const ins=db.prepare(`INSERT OR IGNORE INTO development_milestones(project_id,code,label,stage) VALUES(?,?,?,?)`);for(const m of MILESTONES)ins.run(projectId,m.code,m.label,m.stage)}
function hydrate(row){if(!row)return null;const milestones=db.prepare(`SELECT * FROM development_milestones WHERE project_id=? ORDER BY CASE stage ${STAGES.map((s,i)=>`WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END,code`).all(row.id),history=db.prepare(`SELECT h.*,u.name user_name FROM development_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.project_id=? ORDER BY h.created_at DESC LIMIT 80`).all(row.id),done=milestones.filter(x=>x.status==='DONE').length;return{...row,progress:milestones.length?Math.round(done*100/milestones.length):0,milestones,history}}
function requireStage(stage){const s=String(stage||'').toUpperCase();if(!STAGES.includes(s))throw Object.assign(new Error('Étape développement invalide.'),{status:400,code:'DEVELOPMENT_STAGE_INVALID'});return s}
function requireStatus(status){const s=String(status||'ACTIVE').toUpperCase();if(!PROJECT_STATUSES.includes(s))throw Object.assign(new Error('Statut projet invalide.'),{status:400,code:'DEVELOPMENT_STATUS_INVALID'});return s}
function validateOwner(id){if(!id)return null;const row=db.prepare(`SELECT id,name,active,permissions_profile FROM users WHERE id=?`).get(id);if(!row||!row.active)throw Object.assign(new Error('Responsable projet introuvable ou inactif.'),{status:404,code:'DEVELOPMENT_OWNER_NOT_FOUND'});return row.id}

export function developmentConfig(){return{stages:STAGES.map(code=>({code,label:{SOURCING:'Sourcing local',QUALIFICATION:'Étude & validation',NEGOTIATION:'Négociation',CONTRACT:'Contrat',WORKS:'Travaux',PREOPENING:'Pré-ouverture',OPEN:'Ouvert'}[code]})),statuses:PROJECT_STATUSES,milestones:MILESTONES}}
export function listDevelopmentProjects({includeClosed=true}={}){const rows=db.prepare(`SELECT p.*,u.name owner_name FROM development_projects p LEFT JOIN users u ON u.id=p.owner_user_id ${includeClosed?'':"WHERE p.status IN ('ACTIVE','ON_HOLD')"} ORDER BY CASE p.status WHEN 'ACTIVE' THEN 0 WHEN 'ON_HOLD' THEN 1 WHEN 'OPENED' THEN 2 ELSE 3 END,COALESCE(p.target_opening_date,'9999-12-31'),p.updated_at DESC`).all();return rows.map(r=>{const m=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='DONE' THEN 1 ELSE 0 END) done FROM development_milestones WHERE project_id=?`).get(r.id);return{...r,progress:Number(m.total)?Math.round(Number(m.done||0)*100/Number(m.total)):0}})}
export function developmentProject(id){return hydrate(projectRow(id))}

export function createDevelopmentProject({user,input={}}){
 const name=clean(input.name),city=clean(input.city);if(!name||!city)throw Object.assign(new Error('Nom du projet et ville obligatoires.'),{status:400,code:'DEVELOPMENT_REQUIRED_FIELDS'});const id=uid('devproj'),stage=requireStage(input.stage||'SOURCING'),status=requireStatus(input.status||'ACTIVE'),owner=validateOwner(input.ownerUserId||null),target=input.targetOpeningDate?iso(input.targetOpeningDate):null;if(input.targetOpeningDate&&!target)throw Object.assign(new Error('Date cible invalide.'),{status:400});
 db.prepare(`INSERT INTO development_projects(id,name,city,address,zone,source_lead,surface_m2,landlord,monthly_rent,key_money,capex_budget,target_opening_date,owner_user_id,stage,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,name,city,clean(input.address)||null,clean(input.zone)||null,clean(input.sourceLead)||null,money(input.surfaceM2),clean(input.landlord)||null,money(input.monthlyRent),money(input.keyMoney),money(input.capexBudget),target,owner,stage,status,clean(input.notes)||null,user?.id||null,user?.id||null);seedMilestones(id);log(id,user,'PROJECT_CREATED',stage,'Projet développement créé');return developmentProject(id)
}

export function updateDevelopmentProject({user,id,input={}}){
 const current=projectRow(id);if(!current)throw Object.assign(new Error('Projet développement introuvable.'),{status:404,code:'DEVELOPMENT_PROJECT_NOT_FOUND'});const name=input.name===undefined?current.name:clean(input.name),city=input.city===undefined?current.city:clean(input.city);if(!name||!city)throw Object.assign(new Error('Nom et ville obligatoires.'),{status:400});const target=input.targetOpeningDate===undefined?current.target_opening_date:(input.targetOpeningDate?iso(input.targetOpeningDate):null);if(input.targetOpeningDate&& !target)throw Object.assign(new Error('Date cible invalide.'),{status:400});const owner=input.ownerUserId===undefined?current.owner_user_id:validateOwner(input.ownerUserId||null),status=input.status===undefined?current.status:requireStatus(input.status);
 db.prepare(`UPDATE development_projects SET name=?,city=?,address=?,zone=?,source_lead=?,surface_m2=?,landlord=?,monthly_rent=?,key_money=?,capex_budget=?,target_opening_date=?,owner_user_id=?,status=?,notes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,city,input.address===undefined?current.address:clean(input.address)||null,input.zone===undefined?current.zone:clean(input.zone)||null,input.sourceLead===undefined?current.source_lead:clean(input.sourceLead)||null,input.surfaceM2===undefined?current.surface_m2:money(input.surfaceM2),input.landlord===undefined?current.landlord:clean(input.landlord)||null,input.monthlyRent===undefined?current.monthly_rent:money(input.monthlyRent),input.keyMoney===undefined?current.key_money:money(input.keyMoney),input.capexBudget===undefined?current.capex_budget:money(input.capexBudget),target,owner,status,input.notes===undefined?current.notes:clean(input.notes)||null,user?.id||null,id);log(id,user,'PROJECT_UPDATED',current.stage,'Fiche projet mise à jour');return developmentProject(id)
}

export function setDevelopmentStage({user,id,stage,note=''}){const current=projectRow(id);if(!current)throw Object.assign(new Error('Projet développement introuvable.'),{status:404});const next=requireStage(stage),status=next==='OPEN'?'OPENED':current.status==='OPENED'?'ACTIVE':current.status;db.prepare(`UPDATE development_projects SET stage=?,status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next,status,user?.id||null,id);log(id,user,'STAGE_CHANGED',next,note||`${current.stage} → ${next}`);return developmentProject(id)}

export function setDevelopmentMilestone({user,id,code,status='DONE',dueDate=undefined,note=''}){const row=db.prepare(`SELECT * FROM development_milestones WHERE project_id=? AND code=?`).get(id,String(code||'').toUpperCase());if(!row)throw Object.assign(new Error('Jalon développement introuvable.'),{status:404,code:'DEVELOPMENT_MILESTONE_NOT_FOUND'});const next=String(status||'DONE').toUpperCase();if(!['PENDING','IN_PROGRESS','DONE','BLOCKED'].includes(next))throw Object.assign(new Error('Statut jalon invalide.'),{status:400});const due=dueDate===undefined?row.due_date:(dueDate?iso(dueDate):null);if(dueDate&& !due)throw Object.assign(new Error('Date de jalon invalide.'),{status:400});db.prepare(`UPDATE development_milestones SET status=?,due_date=?,completed_at=?,completed_by=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE project_id=? AND code=?`).run(next,due,next==='DONE'?new Date().toISOString():null,next==='DONE'?user?.id||null:null,clean(note)||null,id,row.code);log(id,user,'MILESTONE_UPDATED',row.stage,`${row.label} · ${next}${note?` · ${clean(note)}`:''}`);return developmentProject(id)}

export function developmentUsers(){return db.prepare(`SELECT id,name,email,permissions_profile,active FROM users WHERE active=1 AND (permissions_profile='development' OR permissions_profile='platform_admin' OR id='u-admin') ORDER BY name`).all()}
