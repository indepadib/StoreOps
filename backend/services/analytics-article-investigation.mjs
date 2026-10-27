import {db} from '../db.mjs';
import {config} from '../config.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';
import {referenceIndex} from './analytics-detention.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {impactPeriod,buildArticleImpact,renderArticleImpact} from './article-impact-analysis.mjs';
import {salesIntegrationConfig} from './dynamics-sales.mjs';

const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)\s+(l|ml|kg|g)\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set('quel quelle quels quelles impact effet effets de du des le la les un une sur dans prix tarif hausse baisse chute changement double client clients activite magasin magasins perte perdu pertes est il elle et en avant apres depuis pour pourquoi comment a t on au aux l d litre litres'.split(' '));
export function isArticleInvestigation(input){return input.analysisMode==='ARTICLE_IMPACT'||/impact|effet|sensibilit|elasticit|chute|perte.*client|perdu.*client/.test(normalize(input.question))&&/prix|tarif|article|produit|jus|panier|client/.test(normalize(input.question))}
export function articleCandidates(question,rows){
 const words=[...new Set(normalize(question).split(' ').filter(w=>w.length>1&&!stop.has(w)&&!/^\d{4}$/.test(w)))];
 const matches=new Map();for(const r of rows){const text=normalize(r.productName||r.label),tokens=new Set(text.split(' ')),hits=words.filter(w=>tokens.has(w)),score=hits.reduce((n,w)=>n+w.length,0);if(hits.length<2)continue;const old=matches.get(r.productNumber);if(!old||old.score<score)matches.set(r.productNumber,{productNumber:r.productNumber,productName:r.productName||r.label,score})}
 return [...matches.values()].sort((a,b)=>b.score-a.score||a.productNumber.localeCompare(b.productNumber)).slice(0,8);
}
export function questionEventDate(question,year){
 const iso=question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return iso[1];
 const numeric=question.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d{2}))?\b/);if(numeric)return `${numeric[3]||year}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}`;
 const months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'],m=normalize(question).match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/);
 return m?`${m[3]||year}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
}
async function resolveArticle(input){
 const code=input.question.match(/\b[A-Z]{1,8}-[A-Z0-9_.-]{2,48}\b/i)?.[0]?.toUpperCase()||String(input.productNumber||'').trim().toUpperCase();
 if(code&&!/^[A-Za-z0-9_.-]{1,64}$/.test(code))throw Object.assign(new Error('Code article invalide.'),{status:400});
 const context=String(input.articleContext||'').trim().toUpperCase();
 const requested=code||(context&&/^[A-Za-z0-9_.-]{1,64}$/.test(context)?context:null);
 if(requested){
  const ref=await referenceIndex();if(ref.complete&&!ref.products.includes(requested))return {candidates:[],reason:'Article absent du référentiel commun.'};
  const catalog=await readAnalyticsCatalog([requested]),product=catalog.items?.[0];
  if(product&&(code||articleCandidates(input.question,[product]).length))return {product};
 }
 const rows=db.prepare('SELECT product_number AS productNumber,product_name AS productName FROM product_identity_cache WHERE product_number IS NOT NULL').all(),candidates=articleCandidates(input.question,rows);
 if(candidates.length===1||candidates.length>1&&candidates[0].score>candidates[1].score)return {product:(await readAnalyticsCatalog([candidates[0].productNumber])).items[0]};
 return {candidates,reason:candidates.length?'Plusieurs articles correspondent au libellé.':'Le libellé ne permet pas d’identifier un article de façon fiable.'};
}
const shift=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
async function cachedWindow(store,start,end,read){
 const exact=await read(analyticsCacheKey('basket-evidence-v3',[store.id,start,end]));if(exact)return {evidence:exact,tasks:[]};
 const evidence={baskets:[],rejectedIdentity:0},tasks=[];
 for(let date=start;date<=end;date=shift(date,1)){const day=await read(analyticsCacheKey('basket-evidence-v3',[store.id,date,date]));if(day){evidence.baskets.push(...day.baskets||[]);evidence.rejectedIdentity+=day.rejectedIdentity||0}else tasks.push({storeId:store.id,storeName:store.name,date})}
 return {evidence,tasks};
}
function evidenceScope(reads,stores,start,end){
 const allowed=new Set(stores.map(s=>s.id)),baskets=reads.flatMap(x=>x.evidence.baskets||[]);
 if(baskets.some(b=>!allowed.has(b.storeId)||b.date<start||b.date>end))throw Object.assign(new Error('Les preuves des paniers ne correspondent plus au périmètre. Relancer la préparation.'),{status:409});
 return {baskets,rejectedIdentity:reads.reduce((n,x)=>n+(x.evidence.rejectedIdentity||0),0)};
}
export async function articleInvestigation(stores,networkStores,input,{read=readAnalyticsCache,write=writeAnalyticsCache,resolve=resolveArticle,catalog=readAnalyticsCatalog,connected=id=>salesIntegrationConfig(id).ready}={}){
 if(stores.some(s=>!connected(s.id)))throw Object.assign(new Error('Un magasin sélectionné ne dispose pas de source tickets configurée.'),{status:422});
 networkStores=networkStores.filter(s=>connected(s.id));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),eventDate=input.eventDate||questionEventDate(input.question,today.slice(0,4)),period=impactPeriod({...input,eventDate},today),resolved=await resolve(input);
 if(!resolved.product)return {status:200,data:{engine:'ARTICLE_CLARIFICATION',answer:resolved.reason+' Choisissez le code article dans le contexte de l’enquête'+(resolved.candidates.length?' ou parmi les propositions ci-dessous.':'.')+' Je ne remplace pas cette enquête par les indicateurs globaux du magasin.',candidates:resolved.candidates,sources:[]}};
 const product=resolved.product,scope=stores.map(s=>s.id).sort().join(','),networkScope=networkStores.map(s=>s.id).sort().join(','),key=analyticsCacheKey('article-impact-v1',[config.dynamics.dataAreaId,scope,networkScope,product.productNumber,period.start,period.end,period.compareStart,period.compareEnd,period.eventDate||'SELECTED_PERIOD']);
 const hit=await read(key);if(hit)return {status:200,data:{...hit,answer:renderArticleImpact(hit.analysis,input.question),cached:true}};
 const [currentReads,previousReads]=await Promise.all([Promise.all(networkStores.map(s=>cachedWindow(s,period.start,period.end,read))),Promise.all(stores.map(s=>cachedWindow(s,period.compareStart,period.compareEnd,read)))]);
 const tasks=[...new Map(currentReads.concat(previousReads).flatMap(x=>x.tasks).map(t=>[t.storeId+'|'+t.date,t])).values()];
 if(tasks.length)return {status:202,data:{status:'PREPARATION_REQUIRED',tasks,product:{productNumber:product.productNumber,productName:product.productName},period}};
 const networkCurrent=evidenceScope(currentReads,networkStores,period.start,period.end),current=evidenceScope(currentReads.filter((r,i)=>stores.some(s=>s.id===networkStores[i].id)),stores,period.start,period.end),previous=evidenceScope(previousReads,stores,period.compareStart,period.compareEnd);
 const report=buildArticleImpact({product:{productNumber:product.productNumber,productName:product.productName},current,previous,networkCurrent,stores,period,networkStoreCount:networkStores.length});
 // Only aggregate cohort counts and spending leave this service. No token, account or name.
 const alternatives=report.cohort.alternatives;
 if(alternatives.length){try{const refs=await catalog(alternatives.map(a=>a.productNumber)),map=new Map(refs.items.map(r=>[r.productNumber,r]));for(const a of alternatives){const r=map.get(a.productNumber);a.productName=r?.productName||null;a.sameFamily=!!product.hierarchy?.family?.id&&r?.hierarchy?.family?.id===product.hierarchy.family.id}}catch{/* Codes and counts remain usable without optional names. */}}
 const sources=[{id:'S3',name:'Tickets Dynamics · enquête article et cohortes agrégées',scope,networkScope,period}],result={engine:'ARTICLE_IMPACT',analysis:report,answer:renderArticleImpact(report,input.question),sources,period,checkedAt:new Date().toISOString(),providerDataSent:false};
 await write(key,'article-impact-v1',result,300);return {status:200,data:result};
}
