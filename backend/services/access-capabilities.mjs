import { db } from '../db.mjs';

const CAPABILITIES=Object.freeze([
 {code:'today.view',label:'Aujourd’hui',group:'Pilotage',description:'Voir le cockpit opérationnel et les priorités.'},
 {code:'network.view',label:'Réseau',group:'Pilotage',description:'Voir et superviser les magasins du réseau.'},
 {code:'quality.view',label:'Qualité · consulter',group:'Qualité & conformité',description:'Voir les contrôles qualité et non-conformités.'},
 {code:'quality.manage',label:'Qualité · agir',group:'Qualité & conformité',description:'Créer des contrôles qualité et traiter les non-conformités.'},
 {code:'dlc.view',label:'DLC / DDM · consulter',group:'Qualité & conformité',description:'Voir les lots, risques, échéances et traitements.'},
 {code:'dlc.manage',label:'DLC / DDM · agir',group:'Qualité & conformité',description:'Créer, recontrôler et traiter les lots DLC / DDM.'},
 {code:'receiving.view',label:'Réception · consulter',group:'Qualité & conformité',description:'Voir les réceptions et les lignes à contrôler.'},
 {code:'receiving.quality',label:'Réception · contrôler la qualité',group:'Qualité & conformité',description:'Réaliser les contrôles qualité de réception sans donner le droit de poster dans l’ERP.'},
 {code:'incidents.view',label:'Demandes & incidents · consulter',group:'Actions & demandes',description:'Voir les incidents, demandes et actions correctives.'},
 {code:'incidents.respond',label:'Demandes & incidents · répondre',group:'Actions & demandes',description:'Ajouter/réaliser des actions, preuves et réponses.'},
 {code:'inventory.view',label:'Stock & inventaire · consulter',group:'Opérations',description:'Voir les stocks, inventaires et écarts.'},
 {code:'commercial.view',label:'Prix & promos · consulter',group:'Opérations',description:'Voir les changements prix et promotions.'},
 {code:'losses.view',label:'Démarque · consulter',group:'Opérations',description:'Voir les pertes et la démarque.'},
 {code:'maintenance.view',label:'Maintenance · consulter',group:'Opérations',description:'Voir les pannes, équipements et SLA.'},
 {code:'development.view',label:'Développement réseau',group:'Espaces spécialisés',description:'Accéder au pipeline de développement.'},
 {code:'admin.studio',label:'Admin Studio',group:'Administration',description:'Accéder à la configuration StoreOps.'},
 {code:'system.view',label:'Système & intégrations',group:'Administration',description:'Voir les diagnostics et intégrations.'}
]);
const CODES=new Set(CAPABILITIES.map(x=>x.code));

db.exec(`
CREATE TABLE IF NOT EXISTS user_capability_overrides(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 capability TEXT NOT NULL,
 enabled INTEGER NOT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,capability)
);
CREATE INDEX IF NOT EXISTS ix_user_capability_overrides_user ON user_capability_overrides(user_id);
`);

const allFalse=()=>Object.fromEntries(CAPABILITIES.map(x=>[x.code,false]));
const allTrue=()=>Object.fromEntries(CAPABILITIES.map(x=>[x.code,true]));
function profileCode(user){
 if(!user)return'ANONYMOUS';
 if(user.permissions_profile==='platform_admin'||user.id==='u-admin')return'PLATFORM_ADMIN';
 if(user.role==='ops_director')return'OPS_DIRECTOR';
 if(user.permissions_profile==='quality_audit')return'QUALITY_AUDIT';
 if(user.permissions_profile==='development')return'DEVELOPMENT';
 if(user.role==='store_manager')return'STORE_MANAGER';
 return'STORE_USER'
}
function defaultsForProfile(profile){
 if(profile==='PLATFORM_ADMIN'||profile==='OPS_DIRECTOR')return allTrue();
 const x=allFalse();
 if(profile==='STORE_MANAGER'){
  for(const c of ['today.view','quality.view','quality.manage','dlc.view','dlc.manage','receiving.view','receiving.quality','incidents.view','incidents.respond','inventory.view','commercial.view','losses.view','maintenance.view'])x[c]=true;
 }
 if(profile==='STORE_USER'){
  for(const c of ['today.view','quality.view','dlc.view','receiving.view','incidents.view','inventory.view','commercial.view','losses.view','maintenance.view'])x[c]=true;
 }
 if(profile==='QUALITY_AUDIT'){
  for(const c of ['today.view','network.view','quality.view','quality.manage','dlc.view','dlc.manage','receiving.view','receiving.quality','incidents.view','incidents.respond','inventory.view','losses.view','maintenance.view'])x[c]=true;
 }
 if(profile==='DEVELOPMENT')x['development.view']=true;
 return x
}
function normalizeDependencies(caps){
 const x={...caps};
 if(x['quality.manage'])x['quality.view']=true;
 if(x['dlc.manage'])x['dlc.view']=true;
 if(x['receiving.quality'])x['receiving.view']=true;
 if(x['incidents.respond'])x['incidents.view']=true;
 return x
}
export function capabilityCatalog(){return CAPABILITIES.map(x=>({...x}))}
export function profileCapabilityDefaults(profile){return normalizeDependencies(defaultsForProfile(String(profile||'').toUpperCase()))}
export function capabilityOverrides(userId){return Object.fromEntries(db.prepare(`SELECT capability,enabled FROM user_capability_overrides WHERE user_id=?`).all(userId).filter(x=>CODES.has(x.capability)).map(x=>[x.capability,!!x.enabled]))}
export function effectiveCapabilities(user){
 const base=defaultsForProfile(profileCode(user)),overrides=user?.id?capabilityOverrides(user.id):{};
 return normalizeDependencies({...base,...overrides})
}
export function hasCapability(user,capability){return !!effectiveCapabilities(user)[capability]}
export function capabilityView(user){return{profile:profileCode(user),effective:effectiveCapabilities(user),overrides:capabilityOverrides(user?.id),catalog:capabilityCatalog()}}
export function setCapabilityOverrides({actor,userId,overrides={},replace=true}={}){
 const target=db.prepare(`SELECT * FROM users WHERE id=?`).get(userId);if(!target)throw Object.assign(new Error('Compte StoreOps introuvable.'),{status:404,code:'ACCESS_ACCOUNT_NOT_FOUND'});
 if(actor?.permissions_profile!=='platform_admin'&&actor?.id!=='u-admin')throw Object.assign(new Error('Les droits fins sont réservés à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'});
 if(replace)db.prepare(`DELETE FROM user_capability_overrides WHERE user_id=?`).run(userId);
 const upsert=db.prepare(`INSERT INTO user_capability_overrides(user_id,capability,enabled,updated_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,capability) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`);
 for(const [code,value] of Object.entries(overrides||{})){
  if(!CODES.has(code))continue;
  if(value===null||value===undefined){db.prepare(`DELETE FROM user_capability_overrides WHERE user_id=? AND capability=?`).run(userId,code);continue}
  upsert.run(userId,code,value?1:0,actor?.id||null)
 }
 return capabilityView(target)
}
