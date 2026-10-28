import {lossInventoryReport} from './analytics-loss-inventory.mjs';
import {operationalAnswer} from './analytics-operational-answer.mjs';
import {basketDirectionReport} from './analytics-basket-direction.mjs';
import {competitorObservations} from './analytics-competitors.mjs';
import {db} from '../db.mjs';
import {canAccessStore} from './permissions.mjs';
import {articlePricingContext} from './analytics-pricing-context.mjs';
import {operationalSummary} from './analytics-operational-summary.mjs';
import {assistantFacts,answerAnalytics} from './analytics-assistant.mjs';
import {isArticleInvestigation,articleInvestigation} from './analytics-article-investigation.mjs';
const day=x=>{const d=new Date(String(x)+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>30000)throw Object.assign(new Error('Question ou contexte trop volumineux.'),{status:413})}try{const value=JSON.parse(text||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}catch{throw Object.assign(new Error('JSON invalide.'),{status:400})}}
const limits=new Map();
export async function handleDecisionToolsApi({req,url,user}){
 if(!['/api/analytics/loss-inventory','/api/analytics/pricing-context','/api/analytics/operational-summary','/api/analytics/assistant','/api/analytics/assistant/capabilities','/api/analytics/competitor-prices'].includes(url.pathname))return null;
 const input=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams),all=db.prepare('SELECT id,name,code FROM stores WHERE active=1 ORDER BY name').all(),allowed=all.filter(s=>canAccessStore(user,s.id)),requested=Array.isArray(input.storeIds)?input.storeIds:String(input.storeIds||input.storeId||'').split(',').filter(Boolean),stores=requested.length?allowed.filter(s=>requested.includes(s.id)):allowed;
 if(!stores.length||requested.some(id=>!allowed.some(s=>s.id===id)))return{status:403,data:{error:'Périmètre magasin interdit.'}};
 if(url.pathname.endsWith('/competitor-prices'))return{status:req.method==='POST'?201:200,data:await competitorObservations(stores,input,user,req.method)};
 if(req.method==='GET'&&url.pathname.endsWith('/capabilities'))return{status:200,data:{aiAvailable:!!process.env.ANTHROPIC_API_KEY,calculatedAnswers:true}};
 if(req.method==='GET'&&url.pathname.endsWith('/pricing-context')){if(stores.length!==1||!day(input.date)||!/^[A-Za-z0-9_.-]{1,64}$/.test(input.product||''))return{status:400,data:{error:'Un magasin, un article et une date valides sont requis.'}};return{status:200,data:await articlePricingContext(stores[0].id,input.product,input.date,{force:input.force==='1'})}}
 if(req.method==='GET'&&url.pathname.endsWith('/loss-inventory'))return{status:200,data:lossInventoryReport(stores,input)};
 if(req.method==='GET'&&url.pathname.endsWith('/operational-summary'))return{status:200,data:await operationalSummary(stores)};
 if(req.method==='POST'&&url.pathname.endsWith('/assistant')){const question=String(input.question||'').trim();if(!question||question.length>1200)return{status:400,data:{error:'Question requise, 1 200 caractères maximum.'}};const key=user.id||user.email||user.store_id||user.role,t=Date.now(),rate=limits.get(key)||{at:t,count:0};if(t-rate.at>60000){rate.at=t;rate.count=0}if(++rate.count>10)return{status:429,data:{error:'Patientez quelques secondes avant une nouvelle question.'}};limits.set(key,rate);if(input.analysisMode==='BASKET_REPORT')return basketDirectionReport(stores,{...input,question});if(isArticleInvestigation({...input,question}))return articleInvestigation(stores,allowed,{...input,question});const operations=await operationalAnswer(stores,{...input,question});if(operations)return{status:200,data:operations};const facts=await assistantFacts(stores,input);return{status:200,data:await answerAnalytics(question,facts)}}
 return{status:405,data:{error:'Méthode non autorisée.'}};
}
