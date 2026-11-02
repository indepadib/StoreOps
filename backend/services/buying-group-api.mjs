import {createHash} from 'node:crypto';

// Private H&S procurement backend. The caller must authenticate via StoreOps first.
const VALID_ENTITIES=new Set(['GROUP','FRANPRIX','VENEZIA','FLORMAR','DAHAB','INTERSPORT','PRIMOR','BEAUTY_FOR_YOU']);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail=(msg,status=400)=>respond({error:msg},status);
const string=(x,n=240)=>String(x??'').trim().slice(0,n);
const normalized=s=>string(s,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const goodDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().startsWith(s);
function toCents(input){
  const s=String(input??'').trim();
  if(!/^\d{1,12}(\.\d{1,2})?$/.test(s))throw Error('Montant MAD invalide.');
  const a=s.split('.');
  return BigInt(a[0])*100n+BigInt((a[1]||'').padEnd(2,'0'));
}
function fromCents(v){
  const sign=v<0n?'-':'',n=v<0n?-v:v;
  return sign+(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
}
function tiersCheck(input){
  if(!Array.isArray(input)||input.length>12)throw Error('Paliers RFA invalides (0 à 12).');
  let last=-1n;
  return input.map(row=>{
    const threshold=string(row?.threshold,32),rateBps=Number(row?.rateBps),c=toCents(threshold);
    if(c<=last||!Number.isSafeInteger(rateBps)||rateBps<0||rateBps>10000)throw Error('Seuils croissants et taux entre 0 et 100 % exigés.');
    last=c;return{threshold,rateBps};
  });
}
export function calculateRebate(spend,rawTiers,mode){
  const base=toCents(spend),tiers=tiersCheck(rawTiers).map(t=>({threshold:toCents(t.threshold),rateBps:BigInt(t.rateBps)}));
  if(!['MARGINAL','RETROACTIVE'].includes(mode))throw Error('Méthode RFA inconnue.');
  let rebate=0n,applied=null;
  if(mode==='RETROACTIVE'){
    for(const t of tiers)if(base>=t.threshold)applied=t;
    if(applied)rebate=(base*applied.rateBps+5000n)/10000n;
  }else{
    for(let i=0;i<tiers.length;i++){
      const current=tiers[i],upper=tiers[i+1]?tiers[i+1].threshold:base;
      if(base<=current.threshold)break;
      const segment=(base<upper?base:upper)-current.threshold;
      if(segment>0n){rebate+=(segment*current.rateBps+5000n)/10000n;applied=current;}
    }
  }
  return{spend:fromCents(base),rebate:fromCents(rebate),ratePct:base?Number((rebate*10000n)/base)/100:0,
    tier:applied?{threshold:fromCents(applied.threshold),rateBps:Number(applied.rateBps)}:null,mode,
    disclaimer:'Simulation théorique, non comptabilisée. D365 reste la source des achats facturés.'};
}
const entity=(v,scope)=>{
  const e=string(v,30).toUpperCase();
  if(!VALID_ENTITIES.has(e)||(scope==='GROUP'&&e!=='GROUP')||(scope==='LOCAL'&&e==='GROUP'))throw Error('Enseigne ou périmètre non valide.');
  return e;
};
async function json(req){
  if(Number(req.headers.get('content-length')||0)>75000)throw Error('Requête trop volumineuse.');
  const raw=await req.text();if(raw.length>75000)throw Error('Requête trop volumineuse.');
  let obj;try{obj=JSON.parse(raw)}catch{throw Error('JSON invalide.')}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Objet JSON attendu.');
  return obj;
}
async function tx(db,fn){
  const c=await db.pool.connect();
  try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}
  catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
}
async function log(c,user,action,type,id,detail={}){
  await c.query('INSERT INTO hs_buying.audit_events(actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
    [user.id,action,type,id,JSON.stringify(detail)]);
}
function supplierData(input){
  const name=string(input.name,200);
  if(name.length<3)throw Error('Nom du fournisseur trop court.');
  const mappings={};
  if(input.accountMappings!=null){
    if(!input.accountMappings||typeof input.accountMappings!=='object'||Array.isArray(input.accountMappings))throw Error('Mappings fournisseur invalides.');
    for(const [k,v] of Object.entries(input.accountMappings)){
      const key=entity(k,'LOCAL'),value=string(v,75);
      if(value)mappings[key]=value;
    }
  }
  return{name,key:normalized(name),category:string(input.category,100),tax:string(input.taxIdentifier,80),
    notes:string(input.notes,3000),mappings};
}
function contractData(input){
  const supplierId=string(input.supplierId,36),title=string(input.title);
  const scope=string(input.scope,12).toUpperCase();
  if(!ID.test(supplierId)||title.length<3||!['GROUP','LOCAL'].includes(scope))throw Error('Contrat ou fournisseur invalide.');
  const entityCode=entity(input.entityCode,scope);
  const from=string(input.effectiveFrom,10),to=string(input.effectiveTo,10);
  if(!goodDate(from)||!goodDate(to)||from>to)throw Error('Dates du contrat invalides.');
  const mode=string(input.rebateMode||'RETROACTIVE',15).toUpperCase();
  const base=string(input.rebateBase||'NET_PURCHASES',30).toUpperCase();
  if(!['MARGINAL','RETROACTIVE'].includes(mode)||!['NET_PURCHASES','NET_INVOICED'].includes(base))throw Error('Règle RFA invalide.');
  const parent=string(input.parentContractId,36)||null;
  if(parent&&!ID.test(parent))throw Error('Accord parent invalide.');
  const payment=input.paymentTermsDays==null||input.paymentTermsDays===''?null:Number(input.paymentTermsDays);
  if(payment!==null&&(!Number.isSafeInteger(payment)||payment<0||payment>365))throw Error('Délai de paiement invalide.');
  return{supplierId,title,scope,entityCode,from,to,mode,base,
    tiers:tiersCheck(input.rebateTiers||[]),parent,payment,notes:string(input.notes,4000)};
}
async function getSuppliers(db){
  const {rows}=await db.pool.query("SELECT s.id,s.name,s.category,s.tax_identifier,s.status,s.account_mappings,s.notes,s.created_at,(SELECT count(*)::int FROM hs_buying.contracts c WHERE c.supplier_id=s.id) AS contracts_count FROM hs_buying.suppliers s ORDER BY s.name LIMIT 500");
  return respond({items:rows,live:true,source:'H&S PostgreSQL'});
}
async function getContracts(db){
  const {rows}=await db.pool.query("SELECT c.id,c.title,c.scope,c.entity_code,c.status,c.effective_from,c.effective_to,c.rebate_mode,c.rebate_base,c.rebate_tiers,c.parent_contract_id,c.payment_terms_days,c.notes,c.supplier_id,c.approved_by,c.approved_at,s.name supplier_name,(SELECT count(*)::int FROM hs_buying.contract_documents d WHERE d.contract_id=c.id) documents_count FROM hs_buying.contracts c JOIN hs_buying.suppliers s ON s.id=c.supplier_id ORDER BY c.created_at DESC LIMIT 500");
  return respond({items:rows,live:true,source:'H&S PostgreSQL'});
}
async function overview(db){
  const [a,b,c]=await Promise.all([
    db.pool.query('SELECT count(*)::int total FROM hs_buying.suppliers'),
    db.pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='ACTIVE')::int active,count(*) FILTER(WHERE status='DRAFT')::int drafts,count(*) FILTER(WHERE status='ACTIVE' AND effective_to BETWEEN current_date AND current_date+60)::int expiring FROM hs_buying.contracts"),
    db.pool.query('SELECT count(*)::int total FROM hs_buying.contract_documents')]);
  return respond({suppliers:a.rows[0].total,contracts:b.rows[0],documents:c.rows[0].total,live:true,erpConnected:false});
}
async function addSupplier(req,db,user){
  const d=supplierData(await json(req));
  try{
    const record=await tx(db,async c=>{
      const res=await c.query('INSERT INTO hs_buying.suppliers(name,normalized_name,category,tax_identifier,account_mappings,notes,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id,name,status,category,account_mappings,created_at',[d.name,d.key,d.category||null,d.tax||null,JSON.stringify(d.mappings),d.notes||null,user.id]);
      await log(c,user,'SUPPLIER_CREATED','supplier',res.rows[0].id,{name:d.name});
      return res.rows[0];
    });return respond({item:record},201);
  }catch(error){if(error.code==='23505')return fail('Fournisseur déjà enregistré.',409);throw error;}
}
async function addContract(req,db,user){
  const d=contractData(await json(req));
  const record=await tx(db,async c=>{
    const sup=await c.query("SELECT id FROM hs_buying.suppliers WHERE id=$1 AND status<>'INACTIVE'",[d.supplierId]);
    if(!sup.rows.length)throw Object.assign(Error('Fournisseur introuvable.'),{status:404});
    if(d.parent){
      const p=await c.query("SELECT id FROM hs_buying.contracts WHERE id=$1 AND supplier_id=$2 AND scope='GROUP'",[d.parent,d.supplierId]);
      if(!p.rows.length||d.scope!=='LOCAL')throw Object.assign(Error('Accord Groupe parent invalide.'),{status:422});
    }
    const res=await c.query('INSERT INTO hs_buying.contracts(supplier_id,title,scope,entity_code,parent_contract_id,effective_from,effective_to,rebate_base,rebate_mode,rebate_tiers,payment_terms_days,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) RETURNING id,title,status,scope,entity_code,created_at',[d.supplierId,d.title,d.scope,d.entityCode,d.parent,d.from,d.to,d.base,d.mode,JSON.stringify(d.tiers),d.payment,d.notes||null,user.id]);
    await log(c,user,'CONTRACT_CREATED','contract',res.rows[0].id,{scope:d.scope,entity:d.entityCode});
    return res.rows[0];
  });return respond({item:record},201);
}
const sizeCap=5*1024*1024;
async function attach(req,db,user,id){
  const mime=string(req.headers.get('content-type'),110).split(';')[0].toLowerCase();
  let name;try{name=decodeURIComponent(string(req.headers.get('x-file-name'),600));}catch{return fail('Nom de fichier invalide.');}
  name=name.replace(/[\/\\\x00-\x1f]/g,'_').slice(0,240);
  const pdf=mime==='application/pdf'&&/\.pdf$/i.test(name);
  const docx=mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&&/\.docx$/i.test(name);
  if(!pdf&&!docx)return fail('Accepte uniquement PDF ou DOCX.');
  if(Number(req.headers.get('content-length')||0)>sizeCap)return fail('Fichier trop volumineux (max 5 Mo).',413);
  const bytes=Buffer.from(await req.arrayBuffer());
  if(!bytes.length||bytes.length>sizeCap)return fail('Fichier vide ou supérieur à 5 Mo.',413);
  if(pdf&&bytes.toString('ascii',0,5)!=='%PDF-')return fail('Signature PDF incorrecte.');
  if(docx&&bytes.toString('ascii',0,2)!=='PK')return fail('Signature DOCX incorrecte.');
  const hash=createHash('sha256').update(bytes).digest('hex');
  const record=await tx(db,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
    const check=await c.query('SELECT id,status FROM hs_buying.contracts WHERE id=$1 FOR UPDATE',[id]);
    if(!check.rows.length)throw Object.assign(Error('Contrat introuvable.'),{status:404});
    if(check.rows[0].status==='CANCELLED')throw Object.assign(Error('Contrat annulé.'),{status:409});
    const previous=await c.query('SELECT coalesce(max(version),0)::int+1 AS next FROM hs_buying.contract_documents WHERE contract_id=$1',[id]);
    const version=previous.rows[0].next;
    const res=await c.query('INSERT INTO hs_buying.contract_documents(contract_id,file_name,content_type,byte_size,sha256,file_bytes,version,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,contract_id,file_name,content_type,byte_size,sha256,version,uploaded_at',[id,name,mime,bytes.length,hash,bytes,version,user.id]);
    await log(c,user,'DOCUMENT_UPLOADED','document',res.rows[0].id,{contractId:id,name,version,sha256:hash});
    return res.rows[0];
  });return respond({item:record},201);
}
async function documents(db,id){
  const res=await db.pool.query('SELECT id,contract_id,file_name,content_type,byte_size,sha256,version,uploaded_by,uploaded_at FROM hs_buying.contract_documents WHERE contract_id=$1 ORDER BY version DESC',[id]);
  return respond({items:res.rows});
}
async function download(db,id){
  const r=await db.pool.query('SELECT file_name,content_type,file_bytes,byte_size FROM hs_buying.contract_documents WHERE id=$1',[id]);
  if(!r.rows.length)return fail('Document introuvable.',404);
  const file=r.rows[0];
  return new Response(new Uint8Array(file.file_bytes),{headers:{
    'Content-Type':file.content_type,'Content-Length':String(file.byte_size),
    'Content-Disposition':"attachment; filename=\"contrat\"; filename*=UTF-8''"+encodeURIComponent(file.file_name),
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',"Content-Security-Policy":"default-src 'none'; sandbox"
  }});
}
async function activate(db,user,id){
  const record=await tx(db,async c=>{
    const res=await c.query('SELECT status,effective_to::text AS effective_to FROM hs_buying.contracts WHERE id=$1 FOR UPDATE',[id]);
    if(!res.rows.length)throw Object.assign(Error('Contrat introuvable.'),{status:404});
    if(res.rows[0].status!=='DRAFT')throw Object.assign(Error('Seul un brouillon peut être validé.'),{status:409});
    if(String(res.rows[0].effective_to).slice(0,10)<new Date().toISOString().slice(0,10))throw Object.assign(Error('Contrat expiré.'),{status:422});
    const doc=await c.query('SELECT count(*)::int n FROM hs_buying.contract_documents WHERE contract_id=$1',[id]);
    if(!doc.rows[0].n)throw Object.assign(Error('Joindre une pièce contractuelle avant validation.'),{status:422});
    const updated=await c.query("UPDATE hs_buying.contracts SET status='ACTIVE',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1 RETURNING id,status,approved_at",[id,user.id]);
    await log(c,user,'CONTRACT_ACTIVATED','contract',id,{documents:doc.rows[0].n});return updated.rows[0];
  });return respond({item:record});
}
async function simulate(req,db){
  const payload=await json(req),id=string(payload.contractId,36);
  if(!ID.test(id))return fail('Contrat invalide.');
  const res=await db.pool.query('SELECT title,status,entity_code,rebate_base,rebate_mode,rebate_tiers FROM hs_buying.contracts WHERE id=$1',[id]);
  if(!res.rows.length)return fail('Contrat introuvable.',404);
  const c=res.rows[0],result=calculateRebate(payload.spend,c.rebate_tiers,c.rebate_mode);
  return respond({result,contract:{id,title:c.title,status:c.status,entity:c.entity_code,base:c.rebate_base},saved:false});
}
async function auditLog(db){
  const r=await db.pool.query('SELECT actor_id,action,object_type,object_id,details,created_at FROM hs_buying.audit_events ORDER BY created_at DESC LIMIT 100');
  return respond({items:r.rows});
}
export async function serveBuyingGroup(req,db,user){
  const path=new URL(req.url).pathname,method=req.method;
  try{
    if(path==='/api/buying-group/overview'&&method==='GET')return overview(db);
    if(path==='/api/buying-group/suppliers'&&method==='GET')return getSuppliers(db);
    if(path==='/api/buying-group/suppliers'&&method==='POST')return addSupplier(req,db,user);
    if(path==='/api/buying-group/contracts'&&method==='GET')return getContracts(db);
    if(path==='/api/buying-group/contracts'&&method==='POST')return addContract(req,db,user);
    if(path==='/api/buying-group/simulate'&&method==='POST')return simulate(req,db);
    if(path==='/api/buying-group/audit'&&method==='GET')return auditLog(db);
    let m=path.match(/^\/api\/buying-group\/contracts\/([^/]+)\/files$/);
    if(m&&ID.test(m[1])&&method==='GET')return documents(db,m[1]);
    if(m&&ID.test(m[1])&&method==='POST')return attach(req,db,user,m[1]);
    m=path.match(/^\/api\/buying-group\/contracts\/([^/]+)\/activate$/);
    if(m&&ID.test(m[1])&&method==='POST')return activate(db,user,m[1]);
    m=path.match(/^\/api\/buying-group\/documents\/([^/]+)\/download$/);
    if(m&&ID.test(m[1])&&method==='GET')return download(db,m[1]);
    return fail('Route achats inconnue.',404);
  }catch(error){
    if(error?.status&&error.status<500)return fail(error.message,error.status);
    if(error?.message&&/^(Montant|Paliers|Seuils|Méthode|Enseigne|Requête|Objet JSON|JSON invalide|Nom du fournisseur|Mappings|Contrat ou fournisseur|Dates du contrat|Règle RFA|Accord parent|Délai de paiement)/.test(error.message))return fail(error.message,422);
    console.error('H&S Buying Group error',error);
    return fail('Service Centrale d’achat indisponible.',503);
  }
}
