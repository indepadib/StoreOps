import {calculateRebate} from './buying-group-api.mjs';

// Human-authorized accounting evidence. Importing a D365 export does not create a live ERP sync.
const ENTITIES=new Set(['FRANPRIX','VENEZIA','FLORMAR','DAHAB','INTERSPORT','PRIMOR','BEAUTY_FOR_YOU']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const bad=(error,status=400,code='INVALID_INPUT')=>json({error,code},status);
const str=(s,max)=>String(s??'').trim().slice(0,max);
const asDate=v=>v instanceof Date?v.toISOString().slice(0,10):String(v??'').slice(0,10);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&asDate(new Date(s+'T00:00:00Z'))===s;
const fmtCents=n=>{
  const v=BigInt(n),abs=v<0n?-v:v;
  return (v<0n?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
};
function parseMoney(value){
  const input=String(value??'').trim();
  if(!/^-?\d{1,11}(?:\.\d{1,2})?$/.test(input))throw Error('Montant net HT MAD invalide (utiliser le point décimal).');
  const negative=input.startsWith('-'),s=negative?input.slice(1):input,parts=s.split('.');
  const cents=BigInt(parts[0])*100n+BigInt((parts[1]||'').padEnd(2,'0'));
  if(cents===0n)throw Error('Les lignes à montant nul ne sont pas importées.');
  return (negative?-cents:cents).toString();
}
function normalizeRow(raw,i){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('La ligne '+(i+1)+' est invalide.');
  const reference=str(raw.reference,100).toUpperCase(),line=str(raw.line||'0',60).toUpperCase();
  const documentDate=str(raw.date,10),amountCents=parseMoney(raw.netAmount);
  const vendorAccount=str(raw.vendorAccount,75),description=str(raw.description,240);
  if(reference.length<2||!line||!validDate(documentDate))throw Error('Référence, ligne ou date invalide à la ligne '+(i+1)+'.');
  return{reference,line,documentDate,amountCents,vendorAccount,description};
}
async function parseJSON(req){
  const size=Number(req.headers.get('content-length')||0);
  if(size>140000)throw Error('Fichier trop volumineux : 200 lignes maximum.');
  const body=await req.text();
  if(body.length>140000)throw Error('Fichier trop volumineux : 200 lignes maximum.');
  try{return JSON.parse(body)}catch{throw Error('Données JSON invalides.')}
}
function key(row){return row.reference+'\x1f'+row.line;}
async function insertBatch(req,db,user){
  const body=await parseJSON(req);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Import invalide.');
  const entity=str(body.entityCode,30).toUpperCase(),supplierId=str(body.supplierId,36);
  const source=str(body.sourceKind,20),dataArea=str(body.dataAreaId,20).toLowerCase();
  if(!ENTITIES.has(entity)||!UUID.test(supplierId))throw Error('Enseigne ou fournisseur invalide.');
  if(!['D365_EXPORT','MANUAL_CSV'].includes(source))throw Error('Origine des données non prise en charge.');
  if(source==='D365_EXPORT'&&!/^[a-z0-9_-]{2,20}$/.test(dataArea))throw Error('Préciser la société Dynamics dataAreaId figurant dans l’export.');
  if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>200)throw Error('Une importation doit contenir entre 1 et 200 lignes.');
  const rows=body.rows.map(normalizeRow),keys=new Set();
  for(const row of rows){
    if(keys.has(key(row)))throw Error('Doublon de référence/ligne dans le fichier : '+row.reference+' / '+row.line);
    keys.add(key(row));
  }
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const supplier=await client.query('SELECT id,name,status,account_mappings FROM hs_buying.suppliers WHERE id=$1 FOR SHARE',[supplierId]);
    if(!supplier.rows.length||supplier.rows[0].status==='INACTIVE')throw Object.assign(Error('Fournisseur inconnu ou inactif.'),{status:404});
    const mapping=str(supplier.rows[0].account_mappings?.[entity],75);
    if(source==='D365_EXPORT'&&!mapping)throw Object.assign(Error('Renseigner d’abord le compte fournisseur D365 de cette enseigne.'),{status:422});
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      if(source==='D365_EXPORT'&&(!row.vendorAccount||row.vendorAccount.toUpperCase()!==mapping.toUpperCase()))
        throw Object.assign(Error('Compte D365 non concordant à la ligne '+(i+1)+' : attendu '+mapping+'.'),{status:422});
      if(source==='MANUAL_CSV'&&row.vendorAccount&&mapping&&row.vendorAccount.toUpperCase()!==mapping.toUpperCase())
        throw Object.assign(Error('Compte fournisseur incohérent à la ligne '+(i+1)+'.'),{status:422});
    }
    const existing=await client.query('SELECT external_reference,line_key,document_date::text AS document_date,amount_cents::text AS amount_cents,erp_vendor_account,data_area_id,source_kind FROM hs_buying.purchase_entries WHERE supplier_id=$1 AND entity_code=$2 AND external_reference=ANY($3::text[])',
      [supplierId,entity,[...new Set(rows.map(x=>x.reference))]]);
    const byKey=new Map(existing.rows.map(x=>[x.external_reference+'\x1f'+x.line_key,x]));
    let skipped=0;
    const fresh=[];
    for(const row of rows){
      const old=byKey.get(key(row));
      if(!old){fresh.push(row);continue;}
      const same=old.document_date===row.documentDate&&String(old.amount_cents)===row.amountCents&&
        str(old.erp_vendor_account,75)===row.vendorAccount&&str(old.data_area_id,20)===(dataArea||'');
      if(!same)throw Object.assign(Error('Une référence déjà importée présente des valeurs différentes : '+row.reference+' / '+row.line+'. Corriger la source avant réimport.'),{status:409});
      skipped++;
    }
    const batch=await client.query('INSERT INTO hs_buying.purchase_batches(source_kind,entity_code,supplier_id,data_area_id,imported_by,inserted_count,skipped_count) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at',
      [source,entity,supplierId,dataArea||null,user.id,fresh.length,skipped]);
    const batchId=batch.rows[0].id;
    for(const row of fresh){
      await client.query('INSERT INTO hs_buying.purchase_entries(batch_id,entity_code,supplier_id,external_reference,line_key,document_date,amount_cents,erp_vendor_account,description,data_area_id,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [batchId,entity,supplierId,row.reference,row.line,row.documentDate,row.amountCents,row.vendorAccount||null,row.description||null,dataArea||null,source]);
    }
    await client.query('INSERT INTO hs_buying.audit_events(actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
      [user.id,'PURCHASE_BATCH_IMPORTED','purchase_batch',batchId,JSON.stringify({source,entity,supplierId,inserted:fresh.length,skipped,dataAreaId:dataArea||null})]);
    await client.query('COMMIT');
    return json({batchId,createdAt:batch.rows[0].created_at,inserted:fresh.length,skipped,sourceKind:source,entityCode:entity,supplierName:supplier.rows[0].name},201);
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    if(error?.code==='23505')return bad('Une ligne a été importée en parallèle. Réessayez après actualisation.',409,'DUPLICATE_REFERENCE');
    throw error;
  }finally{client.release();}
}
async function purchases(db){
  const [r,b]=await Promise.all([
    db.pool.query("SELECT p.id,p.entity_code,p.external_reference,p.line_key,p.document_date::text AS document_date,p.amount_cents::text AS amount_cents,p.erp_vendor_account,p.description,p.source_kind,p.data_area_id,p.imported_at,s.name AS supplier_name,p.supplier_id FROM hs_buying.purchase_entries p JOIN hs_buying.suppliers s ON s.id=p.supplier_id ORDER BY p.imported_at DESC,p.document_date DESC LIMIT 300"),
    db.pool.query("SELECT b.id,b.created_at,b.source_kind,b.entity_code,b.inserted_count,b.skipped_count,b.data_area_id,s.name supplier_name FROM hs_buying.purchase_batches b JOIN hs_buying.suppliers s ON s.id=b.supplier_id ORDER BY b.created_at DESC LIMIT 20")
  ]);
  return json({items:r.rows,batches:b.rows,source:'IMPORTED_EVIDENCE',certified:false});
}
async function summary(db){
  const [totals,entities]=await Promise.all([
    db.pool.query("SELECT count(*)::int AS line_count,count(distinct batch_id)::int AS batches,coalesce(sum(amount_cents),0)::text AS amount_cents FROM hs_buying.purchase_entries"),
    db.pool.query("SELECT entity_code,count(*)::int AS line_count,coalesce(sum(amount_cents),0)::text AS amount_cents FROM hs_buying.purchase_entries GROUP BY entity_code ORDER BY entity_code")
  ]);
  return json({total:totals.rows[0],entities:entities.rows,source:'IMPORTED_EVIDENCE',certified:false});
}
async function reconcile(db,id,url){
  if(!UUID.test(id))return bad('Contrat invalide.');
  const result=await db.pool.query("SELECT id,title,supplier_id,entity_code,scope,status,effective_from::text AS effective_from,effective_to::text AS effective_to,rebate_tiers,rebate_mode,rebate_base FROM hs_buying.contracts WHERE id=$1",[id]);
  if(!result.rows.length)return bad('Contrat introuvable.',404);
  const contract=result.rows[0];
  const from=str(url.searchParams.get('from')||contract.effective_from,10),to=str(url.searchParams.get('to')||contract.effective_to,10);
  if(!validDate(from)||!validDate(to)||from>to||from<contract.effective_from||to>contract.effective_to)
    return bad('Période demandée hors validité du contrat.',422);
  const purchases=await db.pool.query("SELECT count(*)::int AS line_count,coalesce(sum(amount_cents),0)::text AS amount_cents,array_agg(distinct entity_code) AS entities, array_agg(distinct source_kind) AS sources FROM hs_buying.purchase_entries WHERE supplier_id=$1 AND document_date BETWEEN $2 AND $3 AND ($4='GROUP' OR entity_code=$4)",
    [contract.supplier_id,from,to,contract.entity_code]);
  const counted=purchases.rows[0],amount=BigInt(counted.amount_cents),base=amount<0n?0n:amount;
  const theoretical=calculateRebate(fmtCents(base),contract.rebate_tiers,contract.rebate_mode);
  const overlaps=await db.pool.query("SELECT count(*)::int AS count FROM hs_buying.contracts WHERE id<>$1 AND supplier_id=$2 AND scope='LOCAL' AND status='ACTIVE' AND effective_from<=$4 AND effective_to>=$3",[id,contract.supplier_id,from,to]);
  return json({
    contract:{id,title:contract.title,status:contract.status,scope:contract.scope,entity:contract.entity_code,rebateBase:contract.rebate_base},
    from,to,lines:counted.line_count,entities:counted.entities||[],sources:counted.sources||[],
    importedNetMAD:fmtCents(amount),eligibleProxyMAD:fmtCents(base),estimatedRfaMAD:theoretical.rebate,
    ratePct:theoretical.ratePct,mode:contract.rebate_mode,overlapRisk:contract.scope==='GROUP'&&overlaps.rows[0].count>0,
    certified:false,booked:false,
    warning:"Montants importés non certifiés : estimer uniquement. Vérifier avoirs, taxes, retours, assiette du contrat, annexes locales et soldes fournisseurs. Ne pas additionner les résultats de contrats Groupe et locaux couvrant les mêmes achats."
  });
}
export async function serveBuyingPurchases(req,db,user){
  const url=new URL(req.url),p=url.pathname,m=req.method;
  try{
    if(p==='/api/buying-group/purchases'&&m==='GET')return await purchases(db);
    if(p==='/api/buying-group/purchases/summary'&&m==='GET')return await summary(db);
    if(p==='/api/buying-group/purchases/import'&&m==='POST')return await insertBatch(req,db,user);
    const found=p.match(/^\/api\/buying-group\/contracts\/([^/]+)\/reconcile$/);
    if(found&&m==='GET')return await reconcile(db,found[1],url);
    return bad('Route achats indisponible.',404);
  }catch(error){
    if(error?.status&&error.status<500)return bad(error.message,error.status);
    if(error?.message&&/^(Montant net|Les lignes|La ligne|Référence|Doublon|Fichier trop|Requête|Données JSON|Import invalide|Enseigne|Origine|Préciser la société|Une importation|Compte fournisseur)/.test(error.message))
      return bad(error.message,422);
    console.error('H&S purchase evidence API',error);
    return bad('Impossible de traiter le journal d’achats.',503,'PURCHASE_EVIDENCE_ERROR');
  }
}
export const purchaseValidation={parseMoney,normalizeRow,validDate,fmtCents};
