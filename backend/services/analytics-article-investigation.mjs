import {requiresArticleInvestigation,articlePerformanceQuestion} from './analytics-article-intent.mjs';
import {articleBusinessContext} from './analytics-article-context.mjs';
import {preparationResponse,taskFailed} from './analytics-assistant-preparation.mjs';
import {db} from '../db.mjs';
import {config} from '../config.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';
import {referenceIndex} from './analytics-detention.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {impactPeriod,buildArticleImpact,renderArticleImpact} from './article-impact-analysis.mjs';
import {salesIntegrationConfig} from './dynamics-sales.mjs';

const normalize=s=>String(s||'').replace(/litres?/gi,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)\s+(l|ml|kg|g)\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set('quel quelle quels quelles impact effet effets de du des le la les un une sur dans prix tarif hausse baisse chute changement double client clients activite magasin magasins perte perdu pertes est il elle et en avant apres depuis pour pourquoi comment a t on au aux l d litre litres ne se pas plus moins bien mal vend vends vendent vendu vendue ventes vente marche baisse baissent chutent ralenti ralentissent peux peut pourrais expliquer explique est ce que tous tout stock detention promo promos promotion promotions fournisseurs fournisseur crm fidelite depuis jours semaine pourquoi'.split(' '));
export function isArticleInvestigation(input){return requiresArticleInvestigation(input)}
export function articleCandidates(question,rows){
 const words=[...new Set(normalize(question).split(' ').filter(w=>w.length>1&&!stop.has(w)&&!/^\d{4}$/.test(w)))];
 const matches=new Map();for(const r of rows){const text=normalize([r.productName||r.label,r.searchName].filter(Boolean).join(' ')),tokens=new Set(text.split(' ')),hits=words.filter(w=>tokens.has(w)),score=hits.reduce((n,w)=>n+w.length,0)+(words.length>=2&&words.every(w=>tokens.has(w))&&[...tokens].filter(w=>w.length>1&&!stop.has(w)).every(w=>words.includes(w))?1000:0);const sizes=t=>[...t.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(ml|cl|l|kg|g)\b/g)].map(m=>({kind:['l','cl','ml'].includes(m[2])?'volume':'mass',value:Number(m[1].replace(',','.'))*({ml:1,cl:10,l:1000,g:1,kg:1000}[m[2]])})),asked=sizes(normalize(question)),actual=sizes(text);if(asked.length&&actual.length&&!asked.some(a=>actual.some(b=>a.kind===b.kind&&a.value===b.value)))continue;if(!words.length||hits.length<Math.min(2,words.length))continue;const old=matches.get(r.productNumber);if(!old||old.score<score)matches.set(r.productNumber,{productNumber:r.productNumber,productName:r.productName||r.label,score})}
 return [...matches.values()].sort((a,b)=>b.score-a.score||a.productNumber.localeCompare(b.productNumber)).slice(0,8);
}
export function questionEventDate(question,year){
 const iso=question.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return iso[1];
 const numeric=question.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d{2}))?\b/);if(numeric)return `${numeric[3]||year}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}`;
 const months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'],m=normalize(question).match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/);
 return m?`${m[3]||year}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
}
export async function resolveArticle(input,{catalog=readAnalyticsCatalog,index=referenceIndex,identities=()=>db.prepare('SELECT product_number AS productNumber,product_name AS productName FROM product_identity_cache WHERE product_number IS NOT NULL').all()}={}){
 const explicitCode=input.question.match(/\b[A-Z]{1,8}-[A-Z0-9_.-]{2,48}\b/i)?.[0]?.toUpperCase(),code=explicitCode||String((/^(et|idem|pareil|cote)\b/.test(normalize(input.question))?input.followUp?.article?.productNumber:null)||input.productNumber||'').trim().toUpperCase();
 if(code&&!/^[A-Za-z0-9_.-]{1,64}$/.test(code))throw Object.assign(new Error('Code article invalide.'),{status:400});
 const context=String(input.articleContext||'').trim().toUpperCase();
 const requested=code||(context&&/^[A-Za-z0-9_.-]{1,64}$/.test(context)?context:null);
 if(requested){
  const ref=await index();if(ref.complete&&!ref.products.includes(requested))return {candidates:[],reason:'Article absent du référentiel commun.'};
  const refs=await catalog([requested]),product=refs.items?.[0];
  if(product&&(explicitCode||input.analysisMode==='ARTICLE_IMPACT'||(/cet article|ce produit/.test(normalize(input.question))||/^(et|idem|pareil|cote)\b/.test(normalize(input.question))&&!articlePerformanceQuestion(input.question))||articleCandidates(input.question,[product]).length))return {product};
 }
 const rows=await identities(),candidates=articleCandidates(input.question,rows);
 if(candidates.length===1||candidates.length>1&&candidates[0].score>candidates[1].score)return {product:(await catalog([candidates[0].productNumber])).items[0]};
 if(candidates.length){const refs=await catalog(candidates.map(c=>c.productNumber)),names=new Map(refs.items.map(r=>[r.productNumber,r.productName]));for(const c of candidates)c.productName=names.get(c.productNumber)||c.productNumber;const canonical=articleCandidates(input.question,refs.items);if(canonical[0]?.score>=1000&&(!canonical[1]||canonical[0].score>canonical[1].score))return{product:refs.items.find(r=>r.productNumber===canonical[0].productNumber)};}return {candidates,reason:candidates.length?'Plusieurs articles correspondent au libellé.':'Le libellé ne permet pas d’identifier un article de façon fiable.'};
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
export async function articleInvestigation(stores,networkStores,input,{read=readAnalyticsCache,write=writeAnalyticsCache,resolve=resolveArticle,catalog=readAnalyticsCatalog,connected=id=>salesIntegrationConfig(id).ready,context=articleBusinessContext,today:todayOverride}={}){
 if(stores.some(s=>!connected(s.id)))throw Object.assign(new Error('Un magasin sélectionné ne dispose pas de source tickets configurée.'),{status:422});
 networkStores=networkStores.filter(s=>connected(s.id));
 const continuation=/^(et|idem|pareil|cote)\b/.test(normalize(input.question));if(continuation&&input.followUp?.article&&input.followUp?.period&&!input.preparationScope)input={...input,...input.followUp.period,eventDate:undefined};
 const today=todayOverride||new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),eventDate=questionEventDate(input.question,today.slice(0,4))||(!articlePerformanceQuestion(input.question)||input.analysisMode==='ARTICLE_IMPACT'?input.eventDate:null),explicitPeriod=/hier|aujourd|derniers|semaine|mois|20\d{2}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}/i.test(input.question),expanded=articlePerformanceQuestion(input.question)&&!eventDate&&!explicitPeriod;
 const end=input.end&&input.end<today?input.end:shift(today,-1),period=impactPeriod(expanded?{start:shift(end,-13),end,compareStart:shift(end,-27),compareEnd:shift(end,-14)}:{...input,eventDate},today);if(expanded)period.automaticLookback=true;
 const text=normalize(input.question).replaceAll('-',' '),hints=networkStores.filter(s=>[s.name,s.id].some(v=>v&&normalize(v).length>2&&(' '+text+' ').includes(' '+normalize(v).replaceAll('-',' ')+' ')));if(hints.length===1)stores=hints;
 const resolved=await resolve(input);
 if(!resolved.product)return {status:200,data:{engine:'ARTICLE_CLARIFICATION',answer:resolved.reason+' Choisissez le code article dans le contexte de l’enquête'+(resolved.candidates.length?' ou parmi les propositions ci-dessous.':'.')+' Je ne remplace pas cette enquête par les indicateurs globaux du magasin.',candidates:resolved.candidates,sources:[]}};
 const product=resolved.product,scope=stores.map(s=>s.id).sort().join(','),networkScope=networkStores.map(s=>s.id).sort().join(','),key=analyticsCacheKey('article-impact-v4',[config.dynamics.dataAreaId,scope,networkScope,product.productNumber,period.start,period.end,period.compareStart,period.compareEnd,period.eventDate||'SELECTED_PERIOD']);
 const hit=await read(key);if(hit)return {status:200,data:{...hit,answer:renderArticleImpact(hit.analysis,input.question),cached:true}};
 const [currentReads,previousReads]=await Promise.all([Promise.all(networkStores.map(s=>cachedWindow(s,period.start,period.end,read))),Promise.all(stores.map(s=>cachedWindow(s,period.compareStart,period.compareEnd,read)))]);
 const tasks=[...new Map(currentReads.concat(previousReads).flatMap(x=>x.tasks).map(t=>[t.storeId+'|'+t.date,t])).values()];
 if(tasks.length)return {status:202,data:{status:'PREPARATION_REQUIRED',tasks,product:{productNumber:product.productNumber,productName:product.productName},period}};
 const networkCurrent=evidenceScope(currentReads,networkStores,period.start,period.end),current=evidenceScope(currentReads.filter((r,i)=>stores.some(s=>s.id===networkStores[i].id)),stores,period.start,period.end),previous=evidenceScope(previousReads,stores,period.compareStart,period.compareEnd);
 const business=await context(product,stores,{read,today}),needed=(business.tasks||[]).filter(t=>!taskFailed(input,t.kind,t.storeId||''));
 if(input.autoPrepare&&needed.length)return{status:202,data:preparationResponse(needed,{start:period.start,end:period.end,compareStart:period.compareStart,compareEnd:period.compareEnd})};
 const report=buildArticleImpact({product:{productNumber:product.productNumber,productName:product.productName},current,previous,networkCurrent,stores,period,networkStoreCount:networkStores.length});
 report.businessContext={...business,tasks:undefined};
 // Only aggregate cohort counts and spending leave this service. No token, account or name.
 const alternatives=report.cohort.alternatives;
 if(alternatives.length){try{const refs=await catalog(alternatives.map(a=>a.productNumber)),map=new Map(refs.items.map(r=>[r.productNumber,r]));for(const a of alternatives){const r=map.get(a.productNumber);a.productName=r?.productName||null;a.sameFamily=!!product.hierarchy?.family?.id&&r?.hierarchy?.family?.id===product.hierarchy.family.id}}catch{/* Codes and counts remain usable without optional names. */}}
 const sources=[{id:'S3',name:'Tickets Dynamics · ventes, promotions, paniers, clients et réachat',scope,networkScope,period},...business.coverage.map((c,i)=>({id:'S'+(i+4),name:c.domain,status:c.status,basis:c.basis,scope}))],result={engine:'ARTICLE_IMPACT',analysis:report,answer:renderArticleImpact(report,input.question),sources,period,incomplete:business.coverage.some(c=>c.status!=='READ'),queryContext:{article:{productNumber:product.productNumber,productName:product.productName},period:{start:period.start,end:period.end,compareStart:period.compareStart,compareEnd:period.compareEnd}},checkedAt:new Date().toISOString(),providerDataSent:false};
 await write(key,'article-impact-v4',result,result.incomplete?30:300);return {status:200,data:result};
}

