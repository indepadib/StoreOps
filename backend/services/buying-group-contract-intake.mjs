import {createHash} from 'node:crypto';
import {analyzePdf,workflowValidation} from './buying-group-contract-workflow.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITIES=new Set(['GROUP','FRANPRIX','VENEZIA','FLORMAR','DAHAB','INTERSPORT','PRIMOR','BEAUTY_FOR_YOU']);
const MAX_BYTES=5*1024*1024;
const safe=(v,max=240)=>String(v??'').trim().slice(0,max);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const reject=(message,status=400,code='INVALID_INPUT')=>reply({error:message,code},status);
const err=(message,httpStatus=422)=>Object.assign(Error(message),{httpStatus});
const normalized=v=>safe(v,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function filenameFromRequest(req){
  const raw=safe(req.headers.get('x-file-name'),700);
  let decoded;try{decoded=decodeURIComponent(raw)}catch{throw err('Nom de fichier invalide.')}
  const name=decoded.replace(/[/\\\x00-\x1f]/g,'_').slice(0,240);
  if(name.length<5)throw err('Nom de fichier manquant.');
  return name;
}
function detectMime(name,bytes){
  if(/\.pdf$/i.test(name)&&bytes.toString('ascii',0,5)==='%PDF-')return'application/pdf';
  if(/\.docx$/i.test(name)&&bytes.toString('ascii',0,2)==='PK')
    return'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  throw err('Le document doit être un vrai PDF ou DOCX (nom et signature cohérents).');
}
const datesValid=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
  !Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
function validateRegistration(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw err('Formulaire de contrat invalide.');
  const supplierId=safe(input.supplierId,36)||null,supplierName=safe(input.supplierName,200);
  if(supplierId&&!UUID.test(supplierId))throw err('Identifiant fournisseur invalide.');
  if(!supplierId&&supplierName.length<3)throw err('Indique le nom du fournisseur (minimum 3 caractères).');
  const scope=safe(input.scope,12).toUpperCase(),entityCode=safe(input.entityCode,30).toUpperCase();
  if(!['GROUP','LOCAL'].includes(scope)||!ENTITIES.has(entityCode)||
    (scope==='GROUP'&&entityCode!=='GROUP')||(scope==='LOCAL'&&entityCode==='GROUP'))
    throw err('Choisis un contrat Groupe ou une enseigne locale cohérente.');
  const title=safe(input.title,240),effectiveFrom=safe(input.effectiveFrom,10),
    effectiveTo=safe(input.effectiveTo,10);
  if(title.length<3)throw err('Le titre du contrat est obligatoire.');
  if(!datesValid(effectiveFrom)||!datesValid(effectiveTo)||effectiveFrom>effectiveTo)
    throw err('Dates contractuelles non confirmées. Vérifie-les dans le document avant de créer le dossier.');
  const rebateBase=safe(input.rebateBase||'NET_PURCHASES',25),
    rebateMode=safe(input.rebateMode||'RETROACTIVE',15);
  if(!['NET_PURCHASES','NET_INVOICED'].includes(rebateBase)||
    !['RETROACTIVE','MARGINAL'].includes(rebateMode))throw err('Assiette ou mode RFA invalide.');
  const tiers=input.rebateTiers??[];
  if(!Array.isArray(tiers)||tiers.length>12)throw err('Maximum 12 paliers RFA.');
  let last=-1;
  const cleanTiers=tiers.map(t=>{
    const threshold=safe(t?.threshold,32),rateBps=Number(t?.rateBps),n=Number(threshold);
    if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(threshold)||!Number.isFinite(n)||
      !Number.isSafeInteger(rateBps)||rateBps<0||rateBps>10000||n<=last)throw err('Paliers RFA incohérents.');
    last=n;return{threshold,rateBps};
  });
  const payment=input.paymentTermsDays==null||input.paymentTermsDays===''?null:Number(input.paymentTermsDays);
  if(payment!=null&&(!Number.isSafeInteger(payment)||payment<0||payment>365))
    throw err('Délai de paiement invalide.');
  if(input.confirmReview!==true)throw err('Confirme la vérification de l’original avant création du contrat.');
  return{supplierId,supplierName,scope,entityCode,title,effectiveFrom,effectiveTo,
    rebateBase,rebateMode,tiers:cleanTiers,payment,notes:safe(input.notes,4000)};
}
async function audit(c,user,action,type,id,details={}){
  await c.query('INSERT INTO hs_buying.audit_events(actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
    [user.id,action,type,id,JSON.stringify(details)]);
}
async function transact(db,fn){
  const c=await db.pool.connect();
  try{await c.query('BEGIN');const output=await fn(c);await c.query('COMMIT');return output;}
  catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{c.release();}
}
async function listIntakes(db){
  const res=await db.pool.query("SELECT id,file_name,content_type,byte_size,sha256,status,ai_analysis,ai_model,analyzed_at,created_by,created_at,contract_id,registered_at FROM hs_buying.contract_intakes ORDER BY created_at DESC LIMIT 50");
  return reply({items:res.rows,canUpload:true,maxBytes:MAX_BYTES,source:'H&S private PostgreSQL'});
}
async function upload(req,db,user){
  const size=Number(req.headers.get('content-length')||0);
  if(size>MAX_BYTES)return reject('Fichier de plus de 5 Mo. Compresse le PDF ou divise le contrat.',413,'FILE_TOO_LARGE');
  const bytes=Buffer.from(await req.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_BYTES)return reject('Fichier vide ou supérieur à 5 Mo.',413,'FILE_TOO_LARGE');
  const name=filenameFromRequest(req),mime=detectMime(name,bytes),sha=createHash('sha256').update(bytes).digest('hex');
  const result=await transact(db,async c=>{
    const previous=await c.query("SELECT id,file_name,status,created_at FROM hs_buying.contract_intakes WHERE created_by=$1 AND sha256=$2 AND status IN ('UPLOADED','ANALYZED') ORDER BY created_at DESC LIMIT 1",[user.id,sha]);
    if(previous.rows.length)return{...previous.rows[0],reused:true};
    const count=await c.query("SELECT count(*)::int AS count FROM hs_buying.contract_intakes WHERE created_by=$1 AND status IN ('UPLOADED','ANALYZED')",[user.id]);
    if(count.rows[0].count>=35)throw err('35 documents en attente maximum. Finalise un ancien dossier.',409);
    const inserted=await c.query("INSERT INTO hs_buying.contract_intakes(file_name,content_type,byte_size,sha256,file_bytes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,file_name,status,created_at",
      [name,mime,bytes.length,sha,bytes,user.id]);
    await audit(c,user,'CONTRACT_INTAKE_UPLOADED','contract_intake',inserted.rows[0].id,
      {name,mime,sha256:sha,size:bytes.length});
    return{...inserted.rows[0],reused:false};
  });
  return reply({item:result},result.reused?200:201);
}
async function download(db,id){
  const res=await db.pool.query('SELECT file_name,content_type,byte_size,file_bytes,status FROM hs_buying.contract_intakes WHERE id=$1',[id]);
  if(!res.rows.length)return reject('Import introuvable.',404);
  const document=res.rows[0];
  if(!document.file_bytes)return reject('Document déjà versé au contrat. Ouvre le dossier contractuel.',409);
  const pdf=document.content_type==='application/pdf';
  return new Response(new Uint8Array(document.file_bytes),{headers:{
    'Content-Type':document.content_type,'Content-Length':String(document.byte_size),
    'Content-Disposition':(pdf?'inline':'attachment')+"; filename=\"contrat\"; filename*=UTF-8''"+encodeURIComponent(document.file_name),
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox"
  }});
}
async function analyze(req,db,user,id){
  const body=await req.json().catch(()=>null);
  if(body?.consent!==true)return reject('Autorisation explicite indispensable avant transmission au prestataire IA.',422,'CONSENT_REQUIRED');
  const status=workflowValidation.configAI();
  if(!status.enabled)return reject('Service IA indisponible. Le contrat peut être enregistré et contrôlé manuellement.',503,'AI_NOT_CONFIGURED');
  const res=await db.pool.query('SELECT id,status,content_type,file_bytes,sha256 FROM hs_buying.contract_intakes WHERE id=$1',[id]);
  if(!res.rows.length)return reject('Import introuvable.',404);
  const entry=res.rows[0];
  if(entry.status==='REGISTERED')return reject('Document déjà enregistré comme contrat.',409);
  if(entry.status==='ANALYZED'&&body.reanalyze!==true)return reject('Lecture déjà disponible. Confirme une nouvelle lecture pour comparer.',409);
  if(entry.content_type!=='application/pdf')return reject('Lecture IA disponible pour les PDF uniquement.',422);
  const bytes=Buffer.from(entry.file_bytes),digest=createHash('sha256').update(bytes).digest('hex');
  if(digest!==entry.sha256)return reject('Intégrité du document non vérifiée.',409);
  const findings=await analyzePdf(bytes,{model:status.model});
  await transact(db,async c=>{
    const check=await c.query('SELECT status,sha256 FROM hs_buying.contract_intakes WHERE id=$1 FOR UPDATE',[id]);
    if(!['UPLOADED','ANALYZED'].includes(check.rows[0]?.status)||check.rows[0]?.sha256!==digest)throw err('Document modifié pendant l’analyse.',409);
    await c.query('INSERT INTO hs_buying.contract_intake_analysis_runs(intake_id,source_sha256,model,findings,requested_by) VALUES($1,$2,$3,$4::jsonb,$5)',
      [id,digest,status.model,JSON.stringify(findings),user.id]);
    await c.query("UPDATE hs_buying.contract_intakes SET status='ANALYZED',ai_analysis=$2::jsonb,ai_model=$3,analyzed_by=$4,analyzed_at=now() WHERE id=$1",
      [id,JSON.stringify(findings),status.model,user.id]);
    await audit(c,user,entry.status==='ANALYZED'?'CONTRACT_INTAKE_REANALYZED':'CONTRACT_INTAKE_ANALYZED',
      'contract_intake',id,{model:status.model,sha256:digest,readingPasses:findings.quality?.passCount||1});
  });
  return reply({item:{status:'ANALYZED',findings},autoApplied:false,reviewRequired:true});
}
async function register(req,db,user,id){
  const raw=await req.text();
  if(raw.length>85000)return reject('Formulaire trop volumineux.',413);
  let payload;try{payload=JSON.parse(raw)}catch{return reject('Formulaire JSON invalide.')}
  const details=validateRegistration(payload);
  const result=await transact(db,async c=>{
    const found=await c.query('SELECT * FROM hs_buying.contract_intakes WHERE id=$1 FOR UPDATE',[id]);
    if(!found.rows.length)throw err('Document introuvable.',404);
    const intake=found.rows[0];
    if(intake.status==='REGISTERED')throw err('Ce document a déjà été transformé en contrat.',409);
    if(!intake.file_bytes)throw err('Contenu du document indisponible.',409);
    let supplierId=details.supplierId,supplierName=details.supplierName;
    if(supplierId){
      const sup=await c.query("SELECT id,name FROM hs_buying.suppliers WHERE id=$1 AND status<>'INACTIVE'",[supplierId]);
      if(!sup.rows.length)throw err('Fournisseur inconnu ou inactif.',404);
      supplierName=sup.rows[0].name;
    }else{
      const key=normalized(supplierName);
      const existing=await c.query('SELECT id,name FROM hs_buying.suppliers WHERE normalized_name=$1',[key]);
      if(existing.rows.length){supplierId=existing.rows[0].id;supplierName=existing.rows[0].name;}
      else{
        const inserted=await c.query("INSERT INTO hs_buying.suppliers(name,normalized_name,created_by) VALUES($1,$2,$3) ON CONFLICT(normalized_name) DO UPDATE SET name=hs_buying.suppliers.name RETURNING id,name",
          [supplierName,key,user.id]);
        supplierId=inserted.rows[0].id;supplierName=inserted.rows[0].name;
      }
    }
    const contract=await c.query("INSERT INTO hs_buying.contracts(supplier_id,title,scope,entity_code,effective_from,effective_to,rebate_base,rebate_mode,rebate_tiers,payment_terms_days,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12) RETURNING id,title,status",
      [supplierId,details.title,details.scope,details.entityCode,details.effectiveFrom,
        details.effectiveTo,details.rebateBase,details.rebateMode,JSON.stringify(details.tiers),
        details.payment,details.notes||null,user.id]);
    const contractId=contract.rows[0].id;
    const doc=await c.query("INSERT INTO hs_buying.contract_documents(contract_id,file_name,content_type,byte_size,sha256,file_bytes,version,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,1,$7) RETURNING id",
      [contractId,intake.file_name,intake.content_type,intake.byte_size,intake.sha256,
        intake.file_bytes,user.id]);
    let stage='DRAFT',analysisId=null;
    if(intake.status==='ANALYZED'&&intake.ai_analysis){
      const inserted=await c.query("INSERT INTO hs_buying.contract_analyses(contract_id,document_id,source_sha256,model,findings,consent_by,requested_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id",
        [contractId,doc.rows[0].id,intake.sha256,intake.ai_model||'not_recorded',
          JSON.stringify(intake.ai_analysis),intake.analyzed_by||intake.created_by,
          intake.analyzed_by||intake.created_by]);
      stage='EXTRACTED';analysisId=inserted.rows[0].id;
    }
    await c.query("INSERT INTO hs_buying.contract_workflows(contract_id,stage,analysis_id,updated_by) VALUES($1,$2,$3,$4)",
      [contractId,stage,analysisId,user.id]);
    await c.query("UPDATE hs_buying.contract_intakes SET status='REGISTERED',contract_id=$2,registered_by=$3,registered_at=now(),file_bytes=NULL WHERE id=$1",
      [id,contractId,user.id]);
    await audit(c,user,'CONTRACT_INTAKE_REGISTERED','contract_intake',id,
      {contractId,supplierId,supplierName,analysisId});
    await audit(c,user,'CONTRACT_CREATED_FROM_IMPORT','contract',contractId,
      {sourceIntakeId:id,documentId:doc.rows[0].id,supplierId,scope:details.scope,entity:details.entityCode});
    return{contractId,supplierId,supplierName,stage,title:details.title};
  });
  return reply({item:result},201);
}
export async function serveContractIntakes(req,db,user){
  const path=new URL(req.url).pathname,method=req.method;
  try{
    if(path==='/api/buying-group/intakes'&&method==='GET')return await listIntakes(db);
    if(path==='/api/buying-group/intakes'&&method==='POST')return await upload(req,db,user);
    const match=path.match(/^\/api\/buying-group\/intakes\/([^/]+)\/(analyze|register|download)$/);
    if(!match||!UUID.test(match[1]))return reject('Route import inconnue.',404);
    const [,id,action]=match;
    if(action==='download'&&method==='GET')return await download(db,id);
    if(action==='analyze'&&method==='POST')return await analyze(req,db,user,id);
    if(action==='register'&&method==='POST')return await register(req,db,user,id);
    return reject('Méthode non autorisée.',405);
  }catch(error){
    if(error?.httpStatus)return reject(error.message,error.httpStatus);
    if(error?.code==='23505')return reject('Doublon détecté : actualise les dossiers.',409);
    console.error('H&S contract direct intake failure',error);
    return reject("L'import du contrat n'a pas abouti. Aucune donnée contractuelle n'a été validée.",503,'IMPORT_FAILED');
  }
}
export const contractIntakeValidation={filenameFromRequest,detectMime,validateRegistration};
