import { db,uid,audit } from '../db.mjs';
import { config } from '../config.mjs';

const clean=v=>String(v??'').trim();
const email=v=>clean(v).toLowerCase();
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
ensureColumn('users','dynamics_email','TEXT NULL');
ensureColumn('users','permissions_profile','TEXT NULL');
ensureColumn('users','linked_employee_id','TEXT NULL');
ensureColumn('users','identity_provider','TEXT NULL');
ensureColumn('users','identity_subject','TEXT NULL');
ensureColumn('users','access_note','TEXT NULL');
ensureColumn('users','updated_at','TEXT NULL');

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_users_identity_provider_subject ON users(identity_provider,identity_subject) WHERE identity_provider IS NOT NULL AND identity_subject IS NOT NULL;`);

const PROFILE_DEFS=Object.freeze({
 PLATFORM_ADMIN:{code:'PLATFORM_ADMIN',label:'Administrateur StoreOps',description:'Configuration complète du tenant, accès, intégrations et réseau.',role:'ops_director',permissionsProfile:'platform_admin',scope:'NETWORK',sensitive:true},
 OPS_DIRECTOR:{code:'OPS_DIRECTOR',label:'Direction d’exploitation',description:'Pilotage de tous les magasins et opérations réseau.',role:'ops_director',permissionsProfile:null,scope:'NETWORK',sensitive:true},
 QUALITY_AUDIT:{code:'QUALITY_AUDIT',label:'Qualité & audit réseau',description:'Gestion réseau des contrôles qualité et des DLC/DDM, sans droits opérationnels généraux ni posting ERP.',role:'employee',permissionsProfile:'quality_audit',scope:'NETWORK',sensitive:false},
 DEVELOPMENT:{code:'DEVELOPMENT',label:'Développement réseau',description:'Sourcing de locaux, négociation, contrats, travaux et ouvertures.',role:'employee',permissionsProfile:'development',scope:'NETWORK',sensitive:false},
 STORE_MANAGER:{code:'STORE_MANAGER',label:'Responsable magasin',description:'Pilotage opérationnel complet de son magasin uniquement.',role:'store_manager',permissionsProfile:null,scope:'STORE',sensitive:false},
 STORE_USER:{code:'STORE_USER',label:'Utilisateur magasin',description:'Accès terrain à son magasin sans droits de Responsable.',role:'employee',permissionsProfile:'store_user',scope:'STORE',sensitive:false}
});

export const accessProfiles=()=>Object.values(PROFILE_DEFS).map(x=>({...x}));
export const isPlatformAdmin=user=>!!user&&(user.permissions_profile==='platform_admin'||user.id==='u-admin');
export const isNetworkDirector=user=>!!user&&user.role==='ops_director';

function profileFromUser(row){
 if(!row)return null;
 if(row.permissions_profile==='platform_admin'||row.id==='u-admin')return PROFILE_DEFS.PLATFORM_ADMIN;
 if(row.role==='ops_director')return PROFILE_DEFS.OPS_DIRECTOR;
 if(row.permissions_profile==='quality_audit')return PROFILE_DEFS.QUALITY_AUDIT;
 if(row.permissions_profile==='development')return PROFILE_DEFS.DEVELOPMENT;
 if(row.role==='store_manager')return PROFILE_DEFS.STORE_MANAGER;
 return PROFILE_DEFS.STORE_USER
}
function userRow(id){return db.prepare(`SELECT * FROM users WHERE id=?`).get(id)}
function employeeRow(id){return id?db.prepare(`SELECT * FROM employees WHERE id=?`).get(id):null}
function storeRow(id){return id?db.prepare(`SELECT * FROM stores WHERE id=? AND active=1`).get(id):null}
function accountView(row){
 if(!row)return null;const profile=profileFromUser(row),employee=employeeRow(row.linked_employee_id),store=storeRow(row.store_id);
 return {id:row.id,name:row.name,email:row.email||null,dynamicsEmail:row.dynamics_email||null,entraOid:row.entra_oid||null,identityProvider:row.identity_provider||'ENTRA',identitySubject:row.identity_subject||null,profileCode:profile.code,profileLabel:profile.label,scope:profile.scope,storeId:row.store_id||null,storeName:store?.name||null,linkedEmployeeId:row.linked_employee_id||null,linkedEmployeeName:employee?.display_name||null,linkedEmployeeStatus:employee?.status||null,active:!!row.active,note:row.access_note||null,updatedAt:row.updated_at||null}
}
function requireProfile(code){const p=PROFILE_DEFS[String(code||'').toUpperCase()];if(!p)throw Object.assign(new Error('Profil d’accès invalide.'),{status:400,code:'ACCESS_PROFILE_INVALID'});return p}
function ensureActorCanManage(actor,targetProfile,current=null){
 if(!isNetworkDirector(actor))throw Object.assign(new Error('Gestion des accès réservée à la Direction.'),{status:403,code:'ACCESS_ADMIN_REQUIRED'});
 const currentProfile=current?profileFromUser(current):null;
 if((targetProfile.sensitive||currentProfile?.sensitive)&&!isPlatformAdmin(actor))throw Object.assign(new Error('Ce profil sensible est réservé à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'});
}
function validateStoreAndEmployee({profile,storeId,linkedEmployeeId}){
 const employee=employeeRow(linkedEmployeeId),store=profile.scope==='STORE'?storeRow(storeId):null;
 if(profile.scope==='STORE'&&!store)throw Object.assign(new Error('Un magasin actif est obligatoire pour ce profil.'),{status:400,code:'ACCESS_STORE_REQUIRED'});
 if(linkedEmployeeId&&!employee)throw Object.assign(new Error('Collaborateur introuvable.'),{status:404,code:'ACCESS_EMPLOYEE_NOT_FOUND'});
 if(employee?.status==='ENDED')throw Object.assign(new Error('Impossible de rattacher un compte à un contrat terminé.'),{status:409,code:'ACCESS_EMPLOYEE_ENDED'});
 if(employee&&profile.scope==='STORE'&&employee.store_id!==storeId)throw Object.assign(new Error('Le collaborateur et le compte doivent appartenir au même magasin.'),{status:409,code:'ACCESS_EMPLOYEE_STORE_MISMATCH'});
 return{employee,store}
}
function normalizeProvider(v){const p=String(v||'ENTRA').toUpperCase();if(!['ENTRA','EXTERNAL'].includes(p))throw Object.assign(new Error('Fournisseur d’identité invalide.'),{status:400,code:'ACCESS_IDP_INVALID'});return p}
function countActivePlatformAdmins(){return Number(db.prepare(`SELECT COUNT(*) n FROM users WHERE active=1 AND (permissions_profile='platform_admin' OR id='u-admin')`).get()?.n||0)}
function auditAccess(actor,target,action,details={}){const storeId=target.store_id||actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'USER_ACCESS',entityId:target.id,details})}

export function accessIntegrationStatus(){return{authMode:config.authMode,providers:[{code:'ENTRA',label:'Microsoft Entra ID',runtimeSupported:config.authMode==='entra',provisioning:'Email/UPN ou Object ID'},{code:'EXTERNAL',label:'Autre fournisseur OIDC / SSO',runtimeSupported:false,provisioning:'Contrat prêt, adapter à connecter'}]}}
export function listAccessAccounts({includeInactive=true}={}){return db.prepare(`SELECT * FROM users ${includeInactive?'':`WHERE active=1`} ORDER BY CASE WHEN permissions_profile='platform_admin' THEN 0 WHEN role='ops_director' THEN 1 WHEN role='store_manager' THEN 2 ELSE 3 END,name`).all().map(accountView)}
export function listAccessEmployees({storeId=null,includeEnded=false}={}){const where=[];const args=[];if(storeId){where.push('e.store_id=?');args.push(storeId)}if(!includeEnded)where.push(`e.status!='ENDED'`);return db.prepare(`SELECT e.*,s.name store_name,u.id linked_user_id,u.active linked_user_active FROM employees e JOIN stores s ON s.id=e.store_id LEFT JOIN users u ON u.linked_employee_id=e.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.name,e.display_name`).all(...args).map(x=>({...x,linked_user_active:x.linked_user_id?!!x.linked_user_active:null}))}

export function createAccessAccount({actor,name,emailAddress,profileCode,storeId=null,linkedEmployeeId=null,identityProvider='ENTRA',identitySubject=null,note=null}){
 const profile=requireProfile(profileCode);ensureActorCanManage(actor,profile);const person=clean(name),mail=email(emailAddress),provider=normalizeProvider(identityProvider),subject=clean(identitySubject)||null;
 if(!person)throw Object.assign(new Error('Nom du compte obligatoire.'),{status:400,code:'ACCESS_NAME_REQUIRED'});
 if(provider==='ENTRA'&&!mail&&!subject)throw Object.assign(new Error('Email/UPN ou Object ID Entra obligatoire.'),{status:400,code:'ACCESS_ENTRA_IDENTITY_REQUIRED'});
 validateStoreAndEmployee({profile,storeId,linkedEmployeeId});
 if(mail&&db.prepare(`SELECT id FROM users WHERE lower(email)=? OR lower(dynamics_email)=?`).get(mail,mail))throw Object.assign(new Error('Cet email est déjà utilisé par un compte StoreOps.'),{status:409,code:'ACCESS_EMAIL_EXISTS'});
 if(linkedEmployeeId&&db.prepare(`SELECT id FROM users WHERE linked_employee_id=?`).get(linkedEmployeeId))throw Object.assign(new Error('Ce collaborateur possède déjà un compte StoreOps.'),{status:409,code:'ACCESS_EMPLOYEE_ALREADY_LINKED'});
 const id=uid('uacc'),primaryStore=profile.scope==='STORE'?storeId:null,entraOid=provider==='ENTRA'&&subject?subject:null;
 try{db.prepare(`INSERT INTO users(id,name,email,entra_oid,role,store_id,active,dynamics_email,permissions_profile,linked_employee_id,identity_provider,identity_subject,access_note,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(id,person,mail||null,entraOid,profile.role,primaryStore,1,null,profile.permissionsProfile,linkedEmployeeId||null,provider,subject,clean(note)||null)}catch(error){if(String(error?.message||'').includes('UNIQUE'))throw Object.assign(new Error('Cette identité est déjà utilisée.'),{status:409,code:'ACCESS_IDENTITY_EXISTS'});throw error}
 const row=userRow(id);auditAccess(actor,row,'USER_ACCESS_CREATED',{profile:profile.code,storeId:primaryStore,linkedEmployeeId:linkedEmployeeId||null,provider});return accountView(row)
}

export function updateAccessAccount({actor,userId,name,emailAddress,profileCode,storeId=null,linkedEmployeeId=null,identityProvider='ENTRA',identitySubject=null,note=null}){
 const current=userRow(userId);if(!current)throw Object.assign(new Error('Compte StoreOps introuvable.'),{status:404,code:'ACCESS_ACCOUNT_NOT_FOUND'});const profile=requireProfile(profileCode),currentProfile=profileFromUser(current);ensureActorCanManage(actor,profile,current);
 if(actor?.id===userId&&currentProfile.code==='PLATFORM_ADMIN'&&profile.code!=='PLATFORM_ADMIN')throw Object.assign(new Error('Vous ne pouvez pas retirer votre propre rôle Administrateur.'),{status:409,code:'ACCESS_SELF_DEMOTION_FORBIDDEN'});
 const person=clean(name),mail=email(emailAddress),provider=normalizeProvider(identityProvider),subject=clean(identitySubject)||null;if(!person)throw Object.assign(new Error('Nom du compte obligatoire.'),{status:400});if(provider==='ENTRA'&&!mail&&!subject)throw Object.assign(new Error('Email/UPN ou Object ID Entra obligatoire.'),{status:400});validateStoreAndEmployee({profile,storeId,linkedEmployeeId});
 if(mail&&db.prepare(`SELECT id FROM users WHERE (lower(email)=? OR lower(dynamics_email)=?) AND id<>?`).get(mail,mail,userId))throw Object.assign(new Error('Cet email est déjà utilisé par un autre compte.'),{status:409,code:'ACCESS_EMAIL_EXISTS'});
 if(linkedEmployeeId&&db.prepare(`SELECT id FROM users WHERE linked_employee_id=? AND id<>?`).get(linkedEmployeeId,userId))throw Object.assign(new Error('Ce collaborateur possède déjà un autre compte StoreOps.'),{status:409,code:'ACCESS_EMPLOYEE_ALREADY_LINKED'});
 const primaryStore=profile.scope==='STORE'?storeId:null,entraOid=provider==='ENTRA'&&subject?subject:(provider==='ENTRA'?current.entra_oid:null);
 db.prepare(`UPDATE users SET name=?,email=?,entra_oid=?,role=?,store_id=?,permissions_profile=?,linked_employee_id=?,identity_provider=?,identity_subject=?,access_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(person,mail||null,entraOid,profile.role,primaryStore,profile.permissionsProfile,linkedEmployeeId||null,provider,subject,clean(note)||null,userId);
 const row=userRow(userId);auditAccess(actor,row,'USER_ACCESS_UPDATED',{fromProfile:currentProfile.code,toProfile:profile.code,storeId:primaryStore,linkedEmployeeId:linkedEmployeeId||null,provider});return accountView(row)
}

export function setAccessAccountActive({actor,userId,active}){
 const row=userRow(userId);if(!row)throw Object.assign(new Error('Compte StoreOps introuvable.'),{status:404,code:'ACCESS_ACCOUNT_NOT_FOUND'});const profile=profileFromUser(row);ensureActorCanManage(actor,profile,row);
 if(actor?.id===userId&&!active)throw Object.assign(new Error('Vous ne pouvez pas désactiver votre propre compte.'),{status:409,code:'ACCESS_SELF_DEACTIVATION_FORBIDDEN'});
 if(profile.code==='PLATFORM_ADMIN'&&!active&&countActivePlatformAdmins()<=1)throw Object.assign(new Error('Le dernier Administrateur StoreOps actif ne peut pas être désactivé.'),{status:409,code:'ACCESS_LAST_ADMIN_REQUIRED'});
 db.prepare(`UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(active?1:0,userId);const next=userRow(userId);auditAccess(actor,next,active?'USER_ACCESS_ACTIVATED':'USER_ACCESS_DEACTIVATED',{profile:profile.code});return accountView(next)
}

export function deactivateAccountsForEmployee({actor,employeeId,reason='CONTRACT_ENDED'}={}){
 const rows=db.prepare(`SELECT * FROM users WHERE linked_employee_id=? AND active=1`).all(employeeId);for(const row of rows){if(profileFromUser(row).code==='PLATFORM_ADMIN')continue;db.prepare(`UPDATE users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(row.id);auditAccess(actor,row,'USER_ACCESS_AUTO_DEACTIVATED',{employeeId,reason})}return{employeeId,deactivated:rows.filter(x=>profileFromUser(x).code!=='PLATFORM_ADMIN').map(x=>x.id)}
}
