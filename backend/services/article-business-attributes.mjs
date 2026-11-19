import {db} from '../db.mjs';
const fields={
 lifecycle:['DEBUT_STOCK','RUPTURE_LONGUE','FIN_VIE','ACTIF'],
 articleType:['HYBRIDE','CLASSIQUE','GOURMET']
};
function schema(){db.exec(`CREATE TABLE IF NOT EXISTS article_business_attributes(product_number TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS article_business_attribute_events(id INTEGER PRIMARY KEY,product_number TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)`);}
export function articleBusinessAttributes(productNumber){
 schema();const row=db.prepare('SELECT * FROM article_business_attributes WHERE product_number=?').get(productNumber);
 return row?{...JSON.parse(row.payload),updatedBy:row.updated_by,updatedAt:row.updated_at,source:'STOREOPS'}:null;
}
export function saveArticleBusinessAttributes(productNumber,input,user){
 if(user?.role!=='ops_director'&&user?.permissions_profile!=='platform_admin')throw Object.assign(new Error('Modification réservée à la Direction.'),{status:403});
 if(!/^[A-Z0-9_-]{1,64}$/i.test(productNumber))throw Object.assign(new Error('Code article invalide.'),{status:400});
 schema();const before=articleBusinessAttributes(productNumber),payload={};
 for(const [key,allowed] of Object.entries(fields)){
  const value=String((Object.hasOwn(input,key)?input[key]:before?.[key])??'').trim();
  if(value&&!allowed.includes(value))throw Object.assign(new Error('Attribut article invalide.'),{status:400});
  payload[key]=value||null;
 }
 const updatedAt=new Date().toISOString();
 db.exec('SAVEPOINT article_attributes');
 try{
  db.prepare('INSERT INTO article_business_attributes VALUES(?,?,?,?) ON CONFLICT(product_number) DO UPDATE SET payload=excluded.payload,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(productNumber,JSON.stringify(payload),user.id,updatedAt);
  db.prepare('INSERT INTO article_business_attribute_events(product_number,before_json,after_json,updated_by,updated_at) VALUES(?,?,?,?,?)').run(productNumber,JSON.stringify(before),JSON.stringify(payload),user.id,updatedAt);
  db.exec('RELEASE article_attributes');
 }catch(error){db.exec('ROLLBACK TO article_attributes; RELEASE article_attributes');throw error;}
 return articleBusinessAttributes(productNumber);
}
export function supplierOrigin(vendorName){
 if(!String(vendorName??'').trim())return null;
 return String(vendorName).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes('EXTENC')?'IMPORT':'LOCAL';
}
