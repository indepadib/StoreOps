import { db, audit } from '../db.mjs';

// Governance tables live here so the V1.4.3 migration is safe on existing SQLite databases.
db.exec(`
CREATE TABLE IF NOT EXISTS sla_policies (
  criticality TEXT PRIMARY KEY CHECK(criticality IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  response_minutes INTEGER NOT NULL CHECK(response_minutes > 0),
  resolution_minutes INTEGER NOT NULL CHECK(resolution_minutes > 0),
  escalation_minutes INTEGER NOT NULL CHECK(escalation_minutes > 0),
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults=[
  ['LOW',240,480,480],
  ['MEDIUM',120,240,180],
  ['HIGH',60,120,90],
  ['CRITICAL',15,30,15]
];
const ins=db.prepare(`INSERT OR IGNORE INTO sla_policies(criticality,response_minutes,resolution_minutes,escalation_minutes) VALUES(?,?,?,?)`);
for(const d of defaults) ins.run(...d);

export function listQualityProfiles(){
  return db.prepare(`SELECT * FROM quality_profiles ORDER BY CASE category WHEN 'Frais' THEN 1 WHEN 'Surgelé' THEN 2 WHEN 'F&L' THEN 3 WHEN 'Épicerie' THEN 4 ELSE 5 END,category`).all();
}

export function updateQualityProfile({category,user,payload}){
  const current=db.prepare(`SELECT * FROM quality_profiles WHERE category=?`).get(category);
  if(!current) throw Object.assign(new Error('Profil qualité introuvable.'),{status:404});
  const bool=(v,def)=>v===undefined?def:(v?1:0);
  const next={
    label:String(payload.label??current.label).trim()||current.label,
    temperature_required:bool(payload.temperatureRequired,current.temperature_required),
    temp_min:payload.tempMin===undefined?current.temp_min:(payload.tempMin===''||payload.tempMin===null?null:Number(payload.tempMin)),
    temp_max:payload.tempMax===undefined?current.temp_max:(payload.tempMax===''||payload.tempMax===null?null:Number(payload.tempMax)),
    packaging_required:bool(payload.packagingRequired,current.packaging_required),
    appearance_required:bool(payload.appearanceRequired,current.appearance_required),
    expiry_required:bool(payload.expiryRequired,current.expiry_required),
    lot_required:bool(payload.lotRequired,current.lot_required),
    photo_on_nonconform:bool(payload.photoOnNonconform,current.photo_on_nonconform),
    active:bool(payload.active,current.active)
  };
  if(next.temperature_required && next.temp_min!=null && next.temp_max!=null && next.temp_min>next.temp_max) throw Object.assign(new Error('La température minimale ne peut pas dépasser la maximale.'),{status:400});
  db.prepare(`UPDATE quality_profiles SET label=?,temperature_required=?,temp_min=?,temp_max=?,packaging_required=?,appearance_required=?,expiry_required=?,lot_required=?,photo_on_nonconform=?,active=? WHERE category=?`)
    .run(next.label,next.temperature_required,next.temp_min,next.temp_max,next.packaging_required,next.appearance_required,next.expiry_required,next.lot_required,next.photo_on_nonconform,next.active,category);
  audit({storeId:user.store_id||'val-fleuri',userId:user.id,action:'QUALITY_PROFILE_UPDATED',entityType:'QUALITY_PROFILE',entityId:category,details:next});
  return db.prepare(`SELECT * FROM quality_profiles WHERE category=?`).get(category);
}

export function listSlaPolicies(){return db.prepare(`SELECT * FROM sla_policies ORDER BY CASE criticality WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END`).all()}
export function slaPolicyFor(criticality){return db.prepare(`SELECT * FROM sla_policies WHERE criticality=? AND active=1`).get(criticality)||db.prepare(`SELECT * FROM sla_policies WHERE criticality='MEDIUM'`).get()}

export function updateSlaPolicy({criticality,user,payload}){
  const allowed=['LOW','MEDIUM','HIGH','CRITICAL'];if(!allowed.includes(criticality))throw Object.assign(new Error('Criticité invalide.'),{status:400});
  const current=db.prepare(`SELECT * FROM sla_policies WHERE criticality=?`).get(criticality);if(!current)throw Object.assign(new Error('Politique SLA introuvable.'),{status:404});
  const n=(v,def)=>v===undefined?def:Number(v);
  const response=n(payload.responseMinutes,current.response_minutes),resolution=n(payload.resolutionMinutes,current.resolution_minutes),escalation=n(payload.escalationMinutes,current.escalation_minutes),active=payload.active===undefined?current.active:(payload.active?1:0);
  if(![response,resolution,escalation].every(x=>Number.isFinite(x)&&x>0))throw Object.assign(new Error('Les délais SLA doivent être des minutes positives.'),{status:400});
  db.prepare(`UPDATE sla_policies SET response_minutes=?,resolution_minutes=?,escalation_minutes=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE criticality=?`).run(Math.round(response),Math.round(resolution),Math.round(escalation),active,user.id,criticality);
  audit({storeId:user.store_id||'val-fleuri',userId:user.id,action:'SLA_POLICY_UPDATED',entityType:'SLA_POLICY',entityId:criticality,details:{responseMinutes:response,resolutionMinutes:resolution,escalationMinutes:escalation,active}});
  return db.prepare(`SELECT * FROM sla_policies WHERE criticality=?`).get(criticality);
}
