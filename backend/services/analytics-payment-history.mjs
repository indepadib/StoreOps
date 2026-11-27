import {randomUUID} from 'node:crypto';
import {config} from '../config.mjs';
import {discoverPaymentSchema,tenderNameMap} from './dynamics-tender.mjs';
import {salesStoreIdentifiers} from './d365-sales-mapping.mjs';
import {odataGet} from './dynamics.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const clean=v=>String(v??'').trim(),quote=v=>"'"+clean(v).replaceAll("'","''")+"'";
const day=v=>{const s=clean(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:null};
const nextDay=s=>new Date(Date.parse(s)+86400000).toISOString().slice(0,10);
const failure=(message,status=422)=>Object.assign(Error(message),{status,code:'PAYMENT_HISTORY_UNAVAILABLE'});
const key=id=>analyticsCacheKey('payment-history-v1',[id]);
export function cardTenderKind(label){
 const text=clean(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/wallet|cashback|loyalty|fidel|cadeau|gift|avoir|voucher/.test(text))return'OTHER';
 if(/\b(cb|tpe|visa|mastercard|amex)\b|carte.*banc|bank.*card|credit.*card|debit.*card/.test(text))return /manual|manuel/.test(text)?'CARD_MANUAL':'CARD_TPE';
 return /cash|espec|chequ|glovo|sodexo|pluxee|jumia|virement|compte|acompte|mobile|eqdom|tookeez|devise|float|remove/.test(text)?'OTHER':'UNMAPPED';
}
export function accumulatePaymentPage(state,rows){
 const {fields:f,company,storeValue,end}=state;
 for(const row of rows){
  const date=day(row[f.date]),id=f.id?clean(row[f.id]):[f.transaction,f.terminal,f.line].every(field=>clean(row[field])!=='')?JSON.stringify([date,clean(row[f.transaction]),clean(row[f.terminal]),clean(row[f.line])]):'',currency=clean(row[f.currency]).toUpperCase(),tender=clean(row[f.tender]),raw=row[f.amount],amount=(typeof raw==='number'||typeof raw==='string'&&/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim()))?Number(raw):NaN;
  if(!id||!date||date>end||clean(row[f.company])!==company||clean(row[f.store])!==storeValue||!tender||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(amount)||!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>1e-5)throw failure('Identité, périmètre, date, devise ou montant de paiement incohérent.');
  const signature=JSON.stringify([date,currency,tender,amount,row[f.void]??null,row[f.cardBrand]??null]);
  if(Object.hasOwn(state.seen,id)){if(state.seen[id]!==signature)throw failure('Un paiement a changé pendant la lecture. Relancer.');continue}
  Object.defineProperty(state.seen,id,{value:signature,enumerable:true,writable:true,configurable:true});state.distinct++;
  if(state.distinct>500000)throw failure('Historique supérieur à 500 000 lignes : une source agrégée est nécessaire. Aucun total complet publié.');
  const rawStatus=f.void?clean(row[f.void]):'',enumMatch=rawStatus.match(/'([^']+)'$/),status=(enumMatch?enumMatch[1]:rawStatus.split('.').at(-1)).toUpperCase();
  if(f.void&&['1','YES','TRUE','VOIDED','CANCELED','CANCELLED'].includes(status)){state.voided++;continue}
  if(!f.void||!['0','NO','FALSE','NONE','NORMAL','NOTVOIDED','NOT_VOIDED'].includes(status))state.unverifiedStatus++;
  const known=Object.hasOwn(state.names,tender),label=known?state.names[tender]:tender;let kind=known?cardTenderKind(label):'UNMAPPED';
  if(kind==='UNMAPPED'&&f.cardBrand&&cardTenderKind(row[f.cardBrand])==='CARD_TPE')kind=/manual|manuel/i.test(label)?'CARD_MANUAL':'CARD_TPE';
  if(kind==='UNMAPPED')state.unmapped++;
  const bucketKey=JSON.stringify([date,currency,tender,kind]),bucket=state.buckets[bucketKey]||{date,currency,tender,label,kind,positiveMinor:0,negativeMinor:0,netMinor:0,lines:0};
  const minor=Math.round(amount*100);bucket.positiveMinor+=Math.max(0,minor);bucket.negativeMinor+=Math.max(0,-minor);bucket.netMinor+=minor;bucket.lines++;
  if(![bucket.positiveMinor,bucket.negativeMinor,bucket.netMinor].every(Number.isSafeInteger))throw failure('Montant cumulé hors précision monétaire.');
  state.buckets[bucketKey]=bucket;state.firstDate=!state.firstDate||date<state.firstDate?date:state.firstDate;
 }
 return state;
}
export async function readPaymentHistory({userId,storeId,end,cursor=null,force=false},{company=config.dynamics.dataAreaId,environment=config.dynamics.baseUrl,mode=config.dynamics.mode,schema=discoverPaymentSchema,names=tenderNameMap,identifiers=salesStoreIdentifiers,get=odataGet,read=readAnalyticsCache,write=writeAnalyticsCache}={}){
 if(!day(end)||day(end)!==end)throw failure('Date de fin invalide.',400);
 if(end>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()))throw failure('Une date de fin future ne peut pas être certifiée.',400);
 if(mode!=='live'||!company)throw failure('Connexion paiements D365 indisponible.');
 const readyKey=analyticsCacheKey('payment-history-ready-v1',[environment,company,storeId,end]);
 if(!cursor&&!force){const hit=await read(readyKey);if(hit?.status==='READY')return{...hit,cache:'HIT'}}
 let state,responsePage;
 if(cursor){
  if(!/^[0-9a-f-]{36}$/i.test(cursor))throw failure('Curseur invalide.',400);
  state=await read(key(cursor));if(!state||state.userId!==userId||state.storeId!==storeId||state.company!==company||state.environment!==environment||state.end!==end)throw failure('Lecture expirée ou hors périmètre.',409);
  if(state.response)return state.response;state=structuredClone(state);
 }else{
  const s=await schema(),types=await names();if(s.status!=='READY'||types.status!=='READY')throw failure('Source de règlements ou référentiel des moyens de paiement non observable.');
  const find=items=>items.map(n=>(s.sampleKeys||[]).find(k=>k.toLowerCase()===n.toLowerCase())).find(Boolean);
  const f={...s.fields,id:find(['SourceKey','RecId']),line:find(['LineNum','LineNumber','PaymentLineNumber']),company:find([config.dynamics.dataAreaField,'dataAreaId','SysDataAreaId']),void:find(['VoidStatus','IsVoided','IsVoid']),cardBrand:find(['CardTypeId','CardType','CardBrand'])};
  f.amount=find(['AmountInTransactionCurrency','PaymentAmountInTransactionCurrency','AmountTenderedPOS','Amount','PaymentAmount','TenderAmount','AmountTendered','AmountCur'])||f.amount;
  if(/POS/.test(f.amount))f.currency=find(['POSCurrency','TransactionCurrencyCode','CurrencyCode','Currency'])||f.currency;
  if(!(f.id||f.line&&f.transaction&&f.terminal)||![f.company,f.date,f.store,f.currency,f.tender,f.amount].every(Boolean)||/MST|accounting/i.test(f.amount)||/^Created/i.test(f.date))throw failure('Identité de ligne, société, date, devise ou base monétaire du journal non prouvée.');
  const order=f.id||[f.date,f.terminal,f.transaction,f.line].join(',');
  let selected;
  const select=[...new Set(Object.values(f).filter(Boolean))].join(',');
  for(const identifier of identifiers(storeId,f.store)){
   const value=clean(identifier.value),variants=[quote(value),...(/^\d+$/.test(value)?[value]:[])];
   for(const literal of variants){try{
    const storeFilter=`${f.store} eq ${literal} and ${f.company} eq ${quote(company)}`;
    const probe=await get(s.entity,{filter:storeFilter,select,top:1,extra:`cross-company=true&$orderby=${f.date} asc`});if(!Array.isArray(probe?.value)||!probe.value.length)continue;
    if(clean(probe.value[0][f.store])!==value||clean(probe.value[0][f.company])!==company||!day(probe.value[0][f.date]))throw failure('Correspondance magasin du journal non prouvée.');
    const filters=[`${f.date} lt ${nextDay(end)}T00:00:00Z`,`${f.date} le ${end}`,`${f.date} le ${quote(end)}`];
    for(const dateFilter of filters){try{const filter=storeFilter+' and '+dateFilter,page=await get(s.entity,{filter,select,top:null,extra:`cross-company=true&$orderby=${order}`});if(!Array.isArray(page?.value)||(!page.value.length&&day(probe.value[0][f.date])<=end))continue;selected={filter,page,storeValue:value};break}catch{}}
    if(selected)break;
   }catch{}}if(selected)break;
  }
  if(!selected)throw failure('Aucun filtre magasin/date de paiement vérifiable.');
  state={userId,storeId,end,company,environment,entity:s.entity,fields:f,order,select,filter:selected.filter,storeValue:selected.storeValue,names:Object.fromEntries(types.map),tenderSource:types.entity,seen:{},buckets:{},distinct:0,voided:0,unverifiedStatus:0,unmapped:0,firstDate:null,visited:[],continuation:null,startedAt:new Date().toISOString()};responsePage=selected.page;
 }
 const page=responsePage||await get(state.entity,{filter:state.filter,select:state.select,top:null,extra:`cross-company=true&$orderby=${state.order}`,continuation:state.continuation});
 if(!Array.isArray(page?.value))throw failure('Collection de paiements invalide.');
 accumulatePaymentPage(state,page.value);
 const next=page['@odata.nextLink'];if(next&&(typeof next!=='string'||!page.value.length||state.visited.includes(next)))throw failure('Pagination des paiements incohérente.');
 let nextCursor=null;if(next){nextCursor=randomUUID();state.continuation=next;state.visited.push(next);if(!await write(key(nextCursor),'payment-history-v1',state,3600))throw failure('Stockage de progression indisponible.');}
 const result={status:next?'PREPARING':'READY',storeId,end,firstDate:state.firstDate,scanned:state.distinct,nextCursor,source:'D365/'+state.entity,amountField:state.fields.amount,tenderSource:state.tenderSource,voided:state.voided,unverifiedStatus:state.unverifiedStatus,unmapped:state.unmapped,checkedAt:new Date().toISOString(),basis:'Journal POS observé, pas un rapprochement bancaire. Signes source conservés ; orientation encaissement/remboursement non certifiée.',rows:next?undefined:Object.values(state.buckets)};
 if(cursor)await write(key(cursor),'payment-history-v1',{...state,response:result},3600);
 if(!next){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());await write(readyKey,'payment-history-ready-v1',result,end>=today?300:21600);}
 return result;
}
