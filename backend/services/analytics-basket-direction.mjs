import {impactPeriod} from './article-impact-analysis.mjs';
import {buildBasketDirectionReport} from './basket-direction-report.mjs';
import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';
import {salesIntegrationConfig} from './dynamics-sales.mjs';
export async function basketDirectionReport(stores,input,{read=readAnalyticsCache,catalog=readAnalyticsCatalog,connected=id=>salesIntegrationConfig(id).ready,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date())}={}){
 const codes=[...new Set(Array.isArray(input.products)?input.products:[])];if(codes.length<1||codes.length>2||codes.some(c=>!/^[A-Z0-9_.-]{1,64}$/.test(c)))throw Object.assign(new Error('Choisir un ou deux codes articles exacts.'),{status:400});
 if(stores.some(s=>!connected(s.id)))throw Object.assign(new Error('Source tickets non configurée sur un magasin sélectionné.'),{status:422});
 const period=impactPeriod(input,today);if(period.currentDayIncomplete||period.days!==period.previousDays)throw Object.assign(new Error('Deux fenêtres clôturées de même durée sont requises pour le rapport direction.'),{status:400});
 const tasks=[],current={baskets:[],rejectedIdentity:0},previous={baskets:[],rejectedIdentity:0};
 const shift=d=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)};
 for(const store of stores)for(const [target,start,end] of [[current,period.start,period.end],[previous,period.compareStart,period.compareEnd]]){const exact=await read(analyticsCacheKey('basket-evidence-v3',[store.id,start,end]));if(exact){target.baskets.push(...exact.baskets||[]);target.rejectedIdentity+=exact.rejectedIdentity||0;continue;}for(let date=start;date<=end;date=shift(date)){const value=await read(analyticsCacheKey('basket-evidence-v3',[store.id,date,date]));if(value){target.baskets.push(...value.baskets||[]);target.rejectedIdentity+=value.rejectedIdentity||0}else tasks.push({storeId:store.id,storeName:store.name,date});}}
 if(tasks.length)return{status:202,data:{status:'PREPARATION_REQUIRED',tasks,product:{productNumber:codes.join(' + ')},period}};
 const refs=await catalog(codes),products=codes.map(productNumber=>refs.items?.find(p=>p.productNumber===productNumber)||{productNumber,productName:productNumber});
 const report=buildBasketDirectionReport({current,previous,products,stores,period});
 // Resolve names only for the most frequent associated items; ticket lines keep exact codes.
 const associated=[...new Set(report.profiles.flatMap(p=>[...p.associations.before.slice(0,20),...p.associations.after.slice(0,20)].map(a=>a.productNumber)))];
 if(associated.length){try{const names=await catalog(associated),map=new Map(names.items.map(p=>[p.productNumber,p.productName]));for(const p of report.profiles)for(const a of [...p.associations.before,...p.associations.after])a.productName=map.get(a.productNumber)||a.productNumber;}catch{/* exact codes remain usable */}}
 if(JSON.stringify(report).length>4500000)throw Object.assign(new Error('Rapport trop volumineux : réduire la fenêtre ou sélectionner un seul magasin.'),{status:413});
 return{status:200,data:{engine:'BASKET_DIRECTION_REPORT',report,checkedAt:new Date().toISOString(),providerDataSent:false}};
}
