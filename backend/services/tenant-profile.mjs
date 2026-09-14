import { db,audit } from '../db.mjs';

const clean=v=>String(v??'').trim();
const MODULES=['OPERATIONS','SCANNER','WORKFORCE','REPLENISHMENT','MERCHANDISING','QUALITY','MAINTENANCE','CASH','DEVELOPMENT','ADMIN_STUDIO'];
const DEFAULT_VOCAB={store:'magasin',storePlural:'magasins',manager:'Responsable magasin',warehouse:'entrepôt',loss:'démarque',assortment:'assortiment',department:'rayon',category:'catégorie',family:'famille'};
const DEFAULT_MODULES=Object.fromEntries(MODULES.map(x=>[x,true]));

db.exec(`CREATE TABLE IF NOT EXISTS tenant_profile(
 id INTEGER PRIMARY KEY CHECK(id=1),
 tenant_key TEXT NOT NULL,
 brand_name TEXT NOT NULL,
 app_name TEXT NOT NULL,
 accent_color TEXT NOT NULL,
 locale TEXT NOT NULL,
 currency TEXT NOT NULL,
 country TEXT NOT NULL,
 vocabulary_json TEXT NOT NULL,
 modules_json TEXT NOT NULL,
 updated_by TEXT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
const exists=db.prepare(`SELECT id FROM tenant_profile WHERE id=1`).get();
if(!exists)db.prepare(`INSERT INTO tenant_profile(id,tenant_key,brand_name,app_name,accent_color,locale,currency,country,vocabulary_json,modules_json) VALUES(1,?,?,?,?,?,?,?,?,?)`).run('franprix-ma','Franprix','StoreOps','#e5004f','fr-MA','MAD','MA',JSON.stringify(DEFAULT_VOCAB),JSON.stringify(DEFAULT_MODULES));

function parse(raw,fallback){try{return{...fallback,...JSON.parse(raw||'{}')}}catch{return{...fallback}}}
function view(row){return{tenantKey:row.tenant_key,brandName:row.brand_name,appName:row.app_name,accentColor:row.accent_color,locale:row.locale,currency:row.currency,country:row.country,vocabulary:parse(row.vocabulary_json,DEFAULT_VOCAB),modules:parse(row.modules_json,DEFAULT_MODULES),availableModules:[...MODULES],updatedAt:row.updated_at}}
function validColor(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))}
export function tenantProfile(){return view(db.prepare(`SELECT * FROM tenant_profile WHERE id=1`).get())}
export function updateTenantProfile({actor,input={}}){
 const current=tenantProfile(),brandName=clean(input.brandName||current.brandName),appName=clean(input.appName||current.appName),accentColor=clean(input.accentColor||current.accentColor),locale=clean(input.locale||current.locale),currency=clean(input.currency||current.currency).toUpperCase(),country=clean(input.country||current.country).toUpperCase();
 if(!brandName||!appName)throw Object.assign(new Error('Nom enseigne et nom application obligatoires.'),{status:400,code:'TENANT_BRAND_REQUIRED'});if(!validColor(accentColor))throw Object.assign(new Error('Couleur principale invalide.'),{status:400,code:'TENANT_COLOR_INVALID'});
 const vocabulary={...DEFAULT_VOCAB,...current.vocabulary,...Object.fromEntries(Object.entries(input.vocabulary||{}).map(([k,v])=>[k,clean(v)]).filter(([,v])=>v))};
 const modules={...DEFAULT_MODULES,...current.modules};for(const code of MODULES)if(input.modules&&Object.hasOwn(input.modules,code))modules[code]=!!input.modules[code];
 db.prepare(`UPDATE tenant_profile SET brand_name=?,app_name=?,accent_color=?,locale=?,currency=?,country=?,vocabulary_json=?,modules_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(brandName,appName,accentColor,locale,currency,country,JSON.stringify(vocabulary),JSON.stringify(modules),actor?.id||null);
 const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;if(storeId)audit({storeId,userId:actor?.id||null,action:'TENANT_PROFILE_UPDATED',entityType:'TENANT_PROFILE',entityId:'1',details:{brandName,appName,accentColor,locale,currency,country}});return tenantProfile()
}
