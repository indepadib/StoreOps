// Audited supplier RFA recovery ledger. Figures are operator-declared, never ERP booked.
// Director/Admin role gating is enforced by the parent StoreOps /api handler.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITIES=new Set(['GROUP','FRANPRIX','VENEZIA','FLORMAR','DAHAB','INTERSPORT','PRIMOR','BEAUTY_FOR_YOU']);
const KINDS=new Set(['CREDIT_NOTE','BANK_TRANSFER','DEDUCTION']);
const STATES=new Set(['DRAFT','SUBMITTED','ACKNOWLEDGED','DISPUTED','CLOSED']);
const transitions={
 DRAFT:new Set(['SUBMITTED']),
 SUBMITTED:new Set(['ACKNOWLEDGED','DISPUTED']),
 ACKNOWLEDGED:new Set(['DISPUTED','CLOSED']),
 DISPUTED:new Set(['SUBMITTED']),
 CLOSED:new Set()
};
const clean=(s,n=220)=>String(s??'').trim().slice(0,n);
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
const error=(message,status=422)=>Object.assign(new Error(message),{status});
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const moneyCents=x=>{
 const s=clean(x,32);
 if(!/^\d{1,13}(?:\.\d{1,2})?$/.test(s))throw error('Montant MAD invalide : 2 décimales maximum.');
 const [whole,fraction='']=s.split('.');
 const n=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
 if(n<=0n||n>=10000000000000000n)throw error('Montant hors limites de sécurité.');
 return n;
};
const centsAsMAD=n=>(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
const centsFromDB=n=>{
 const s=String(n??'0');
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw error('Montant comptable mal formé.',503);
 const negative=s.startsWith('-'),abs=negative?s.slice(1):s,[whole,dec='']=abs.split('.');
 const value=BigInt(whole)*100n+BigInt((dec+'00').slice(0,2));
 return negative?-value:value;
};
async function parse(req){
 const raw=await req.text();
 if(raw.length>10000)throw error('Formulaire trop volumineux.',413);
 let body;try{body=JSON.parse(raw)}catch{throw error('Formulaire JSON invalide.')}
 if(!body||typeof body!=='object'||Array.isArray(body))throw error('Formulaire invalide.');
 return body;
}
async function audit(db,user,action,type,id,detail={}){
 await db.query('INSERT INTO hs_buying.audit_events(actor_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
  [user.id,action,type,id,JSON.stringify(detail)]);
}
async function tx(db,fn){
 const c=await db.pool.connect();
 try{await c.query('BEGIN');const data=await fn(c);await c.query('COMMIT');return data;}
 catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
function validateClaim(input){
 const id=clean(input.contractId,36),entityCode=clean(input.entityCode,32).toUpperCase(),
   from=clean(input.periodFrom,10),to=clean(input.periodTo,10),
   claimReference=clean(input.claimReference,140),sourceReference=clean(input.sourceReference,220);
 if(!UUID.test(id))throw error('Choisir un contrat contractuellement approuvé.');
 if(!ENTITIES.has(entityCode))throw error('Enseigne ou périmètre Groupe invalide.');
 if(!dateValid(from)||!dateValid(to)||from>to)throw error('Période RFA invalide.');
 if(claimReference.length<3||sourceReference.length<4)
   throw error('Référence de réclamation et référence de pièce justificative obligatoires.');
 return{contractId:id,entityCode,from,to,claimReference,sourceReference,
  claimedMad:centsAsMAD(moneyCents(input.claimedMad)),note:clean(input.note,1000)};
}
function validateSettlement(input){
 const kind=clean(input.kind,18),reference=clean(input.evidenceReference,220),
   evidenceDate=clean(input.evidenceDate,10);
 if(!KINDS.has(kind))throw error('Type de règlement non reconnu.');
 if(reference.length<4||!dateValid(evidenceDate))
   throw error('Référence de preuve et date de pièce obligatoires.');
 return{kind,reference,evidenceDate,
  amountMad:centsAsMAD(moneyCents(input.amountMad)),note:clean(input.note,1000)};
}
async function listClaims(db){
 const [claimData,receipts]=await Promise.all([
  db.pool.query(
   "SELECT c.id,c.contract_id,c.entity_code,c.period_from::text AS period_from,c.period_to::text AS period_to,"+
   "c.claimed_mad::text AS claimed_mad,c.claim_reference,c.source_reference,c.note,c.status,c.created_by,"+
   "c.created_at,c.submitted_at,c.acknowledged_at,c.closed_at,c.updated_at,"+
   "k.title AS contract_title,s.name AS supplier_name,"+
   "COALESCE(r.total,0)::text AS received_mad,COALESCE(r.count,0)::int AS receipt_count "+
   "FROM hs_buying.rebate_claims c "+
   "JOIN hs_buying.contracts k ON k.id=c.contract_id "+
   "JOIN hs_buying.suppliers s ON s.id=k.supplier_id "+
   "LEFT JOIN (SELECT claim_id,SUM(amount_mad) AS total,COUNT(*) AS count "+
   "FROM hs_buying.rebate_settlements GROUP BY claim_id) r ON r.claim_id=c.id "+
   "ORDER BY c.updated_at DESC LIMIT 300"
  ),
  db.pool.query("SELECT id,claim_id,kind,amount_mad::text AS amount_mad,evidence_reference,evidence_date::text AS evidence_date,created_by,created_at "+
   "FROM hs_buying.rebate_settlements ORDER BY created_at DESC LIMIT 500")
 ]);
 const items=claimData.rows.map(x=>{
  const outstanding=centsFromDB(x.claimed_mad)-centsFromDB(x.received_mad);
  return{...x,outstanding_mad:centsAsMAD(outstanding>0n?outstanding:0n)};
 });
 let claimed=0n,received=0n,open=0n;
 for(const r of items){
  // Draft values are not supplier claims; booked financial figures remain elsewhere.
  if(r.status==='DRAFT')continue;
  claimed+=centsFromDB(r.claimed_mad);
  received+=centsFromDB(r.received_mad);
  open+=centsFromDB(r.outstanding_mad);
 }
 return response({items,settlements:receipts.rows,
  summary:{claimCount:items.filter(x=>x.status!=='DRAFT').length,
    submittedMad:centsAsMAD(claimed),receivedDocumentedMad:centsAsMAD(received),
    outstandingMad:centsAsMAD(open),source:'MANUALLY_DECLARED',
    certified:false,erpPosted:false,bankReconciled:false},
  source:'H&S private audit ledger',certified:false});
}
async function createClaim(req,db,user){
 const input=validateClaim(await parse(req));
 const saved=await tx(db,async c=>{
  const found=await c.query('SELECT id,title,scope,entity_code,status,effective_from::text AS effective_from,effective_to::text AS effective_to FROM hs_buying.contracts WHERE id=$1 FOR UPDATE',[input.contractId]);
  if(!found.rows.length)throw error('Contrat introuvable.',404);
  const agreement=found.rows[0];
  if(agreement.status!=='ACTIVE')throw error('Le contrat doit être approuvé et actif avant réclamation.',409);
  if(input.from<agreement.effective_from||input.to>agreement.effective_to)
    throw error('La période RFA doit rester dans les dates du contrat.',422);
  if((agreement.scope==='LOCAL'&&input.entityCode!==agreement.entity_code)||
    (agreement.scope==='GROUP'&&!ENTITIES.has(input.entityCode)))
    throw error('La réclamation ne correspond pas au périmètre de ce contrat.',422);
  const inserted=await c.query("INSERT INTO hs_buying.rebate_claims "+
   "(contract_id,entity_code,period_from,period_to,claimed_mad,claim_reference,source_reference,note,created_by) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status,claimed_mad::text AS claimed_mad",
   [input.contractId,input.entityCode,input.from,input.to,input.claimedMad,input.claimReference,
    input.sourceReference,input.note||null,user.id]);
  await audit(c,user,'RFA_CLAIM_DRAFTED','rebate_claim',inserted.rows[0].id,
   {contractId:input.contractId,entity:input.entityCode,period:[input.from,input.to],
    amountMad:input.claimedMad,claimReference:input.claimReference,sourceReference:input.sourceReference});
  return inserted.rows[0];
 });
 return response({item:saved},201);
}
async function changeState(req,db,user,id){
 const input=await parse(req),next=clean(input.status,16).toUpperCase(),
  evidenceReference=clean(input.evidenceReference,220);
 if(evidenceReference.length<4)throw error('Une référence de preuve du changement de statut est obligatoire.');
 if(!STATES.has(next))throw error('Statut inconnu.');
 const item=await tx(db,async c=>{
  const found=await c.query('SELECT id,status,claimed_mad::text AS claimed_mad FROM hs_buying.rebate_claims WHERE id=$1 FOR UPDATE',[id]);
  if(!found.rows.length)throw error('Réclamation introuvable.',404);
  const claim=found.rows[0];
  if(!transitions[claim.status]?.has(next))throw error('Transition interdite : '+claim.status+' vers '+next+'.',409);
  let documented=0n;
  if(next==='CLOSED'){
   const sum=await c.query('SELECT COALESCE(SUM(amount_mad),0)::text AS amount FROM hs_buying.rebate_settlements WHERE claim_id=$1',[id]);
   documented=centsFromDB(sum.rows[0].amount);
   if(documented!==centsFromDB(claim.claimed_mad))throw error('Clôture impossible : les preuves de règlement doivent couvrir exactement le montant réclamé.',409);
  }
  const updated=await c.query("UPDATE hs_buying.rebate_claims SET status=$2,updated_by=$3,updated_at=now(),"+
   "submitted_at=CASE WHEN $2='SUBMITTED' THEN now() ELSE submitted_at END,"+
   "acknowledged_at=CASE WHEN $2='ACKNOWLEDGED' THEN now() ELSE acknowledged_at END,"+
   "closed_at=CASE WHEN $2='CLOSED' THEN now() ELSE closed_at END WHERE id=$1 RETURNING id,status",
   [id,next,user.id]);
  await audit(c,user,'RFA_CLAIM_STATUS_CHANGED','rebate_claim',id,
   {previous:claim.status,next,documentedMad:centsAsMAD(documented),evidenceReference});
  return updated.rows[0];
 });
 return response({item});
}
async function addSettlement(req,db,user,id){
 const input=validateSettlement(await parse(req));
 const item=await tx(db,async c=>{
  const found=await c.query('SELECT id,status,claimed_mad::text AS claimed_mad FROM hs_buying.rebate_claims WHERE id=$1 FOR UPDATE',[id]);
  if(!found.rows.length)throw error('Réclamation introuvable.',404);
  const claim=found.rows[0];
  if(!['SUBMITTED','ACKNOWLEDGED','DISPUTED'].includes(claim.status))
    throw error('Enregistrer les règlements sur une réclamation soumise, acceptée ou contestée.',409);
  const sum=await c.query('SELECT COALESCE(SUM(amount_mad),0)::text AS amount FROM hs_buying.rebate_settlements WHERE claim_id=$1',[id]);
  if(centsFromDB(sum.rows[0].amount)+centsFromDB(input.amountMad)>centsFromDB(claim.claimed_mad))
    throw error('Les pièces de règlement cumulées dépassent le montant déclaré. Vérifier le montant ou la répartition.',409);
  const saved=await c.query('INSERT INTO hs_buying.rebate_settlements '+
   '(claim_id,kind,amount_mad,evidence_reference,evidence_date,note,created_by) '+
   'VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,kind,amount_mad::text AS amount_mad',
   [id,input.kind,input.amountMad,input.reference,input.evidenceDate,input.note||null,user.id]);
  await audit(c,user,'RFA_SETTLEMENT_DOCUMENTED','rebate_claim',id,
   {settlementId:saved.rows[0].id,amountMad:input.amountMad,kind:input.kind,evidenceReference:input.reference});
  return saved.rows[0];
 });
 return response({item},201);
}
export async function serveRebateRecovery(req,db,user){
 const path=new URL(req.url).pathname,method=req.method;
 try{
  if(path==='/api/buying-group/recovery/claims'&&method==='GET')return await listClaims(db);
  if(path==='/api/buying-group/recovery/claims'&&method==='POST')return await createClaim(req,db,user);
  const state=path.match(/^\/api\/buying-group\/recovery\/claims\/([^/]+)\/status$/);
  if(state&&UUID.test(state[1])&&method==='POST')return await changeState(req,db,user,state[1]);
  const settlement=path.match(/^\/api\/buying-group\/recovery\/claims\/([^/]+)\/settlements$/);
  if(settlement&&UUID.test(settlement[1])&&method==='POST')return await addSettlement(req,db,user,settlement[1]);
  return response({error:'Route de suivi RFA inconnue.'},404);
 }catch(e){
  if(e.status&&e.status<500)return response({error:e.message},e.status);
  if(e.code==='23505')return response({error:'Une réclamation ou une référence de pièce existe déjà pour ce contrat.'},409);
  console.error('H&S rebate recovery ledger failed',e);
  return response({error:'Le registre RFA est temporairement indisponible. Aucune écriture ERP effectuée.'},503);
 }
}
export const rebateRecoveryValidation={validateClaim,validateSettlement,moneyCents,centsAsMAD,centsFromDB,transitions};
