(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;
  const state={data:null,key:null,freshKey:null,loading:false,level:'product',metric:'sales',search:'',catalog:new Map(),catalogKey:null,catalogLoading:false,filters:{department:'',rayon:'',family:'',subfamily:'',subsubfamily:'',ub:'',product:''}};

  const safe=v=>v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v);
  const signed=(api,v,kind='percent')=>{
    if(v==null)return '<span class="metric-na">N/A</span>';
    const cls=Number(v)>0?'metric-positive':Number(v)<0?'metric-negative':'';
    const sign=Number(v)>0?'+':'';
    const label=kind==='money'?api.money(v,true):kind==='number'?api.number(v,1):api.percent(v);
    return `<span class="${cls}">${sign}${label}</span>`;
  };
  const sectionState=()=>core()?.getState?.()||null;

  function storeScopeKey(s){const ids=Array.isArray(s?.selectedStoreIds)?s.selectedStoreIds:[];return ids.length?[...ids].sort().join(','):'ALL'}
  function queryKey(s){return [s.tenant,storeScopeKey(s),s.periodStart,s.periodEnd,s.compareStart,s.compareEnd].join('|')}
  const decisionCachePrefix='retail-intelligence:decision:v7:';
  const catalogCacheKey='retail-intelligence:catalog:v4';
  function readJsonStorage(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  function writeJsonStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function cachedDecision(key){
    const hit=readJsonStorage(decisionCachePrefix+key);
    if(!hit?.data||!hit.at)return null;
    return Date.now()-Number(hit.at)<15*60*1000?hit.data:null
  }
  function saveDecisionCache(key,data){writeJsonStorage(decisionCachePrefix+key,{at:Date.now(),data})}
  function hydrateCatalogCache(){
    const hit=readJsonStorage(catalogCacheKey),items=Array.isArray(hit?.items)?hit.items:[];
    for(const item of items)if(item?.productNumber)state.catalog.set(item.productNumber,item)
  }
  function persistCatalogCache(){
    const items=[...state.catalog.values()].slice(-1800);
    writeJsonStorage(catalogCacheKey,{at:Date.now(),items})
  }
  function addDays(iso,days){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
  function rangeDays(start,end){return Math.max(1,Math.floor((Date.parse(`${end}T12:00:00Z`)-Date.parse(`${start}T12:00:00Z`))/86400000)+1)}
  function splitRange(start,end,n){
    const total=rangeDays(start,end),parts=[],base=Math.floor(total/n),extra=total%n;let cursor=start;
    for(let i=0;i<n;i++){const len=base+(i<extra?1:0),partEnd=addDays(cursor,len-1);parts.push({start:cursor,end:partEnd});cursor=addDays(partEnd,1)}
    return parts
  }
  function pct(cur,prev){return prev?((Number(cur||0)-Number(prev||0))/Number(prev))*100:null}
  function moneySum(values){let total=0,known=true;for(const v of values){if(v===null||v===undefined)known=false;else total+=Number(v||0)}return known?total:null}
  function sumSnapshot(parts,key){
    const rows=parts.map(p=>p?.summary?.[key]||{}),sales=rows.reduce((s,x)=>s+Number(x.sales||0),0),tickets=rows.reduce((s,x)=>s+Number(x.tickets||0),0),units=rows.reduce((s,x)=>s+Number(x.units||0),0);
    const marginValue=moneySum(rows.map(x=>x.marginValue)),identifiedSales=moneySum(rows.map(x=>x.identifiedSales)),identifiedTickets=moneySum(rows.map(x=>x.identifiedTickets));
    return{sales,tickets,units,averageBasket:tickets?sales/tickets:null,marginValue,marginRate:marginValue!=null&&sales?marginValue/sales*100:null,identifiedSales,identifiedSalesShare:identifiedSales!=null&&sales?identifiedSales/sales*100:null,identifiedTickets,identifiedTicketRate:identifiedTickets!=null&&tickets?identifiedTickets/tickets*100:null}
  }
  function mergeRankedRows(parts,getRows,previousField='previousSales'){
    const map=new Map();
    for(const part of parts)for(const row of getRows(part)||[]){
      const key=String(row.key||'');if(!key)continue;
      const cur=map.get(key)||{key,label:row.label||key,sales:0,previousSales:0,units:0,marginValue:0,previousMarginValue:0,marginKnown:true,previousMarginKnown:true,quantityUnits:new Set()};
      cur.sales+=Number(row.sales||0);cur.previousSales+=Number(row[previousField]??row.previous??0);cur.units+=Number(row.units||0);if(row.quantityUnit)cur.quantityUnits.add(String(row.quantityUnit));
      if(row.marginValue===null||row.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=Number(row.marginValue||0);
      if(row.previousMarginValue===null||row.previousMarginValue===undefined)cur.previousMarginKnown=false;else cur.previousMarginValue+=Number(row.previousMarginValue||0);
      if((!cur.label||cur.label===key)&&row.label)cur.label=row.label;
      map.set(key,cur)
    }
    const rows=[...map.values()],total=rows.reduce((s,x)=>s+x.sales,0),prevSorted=[...rows].sort((a,b)=>b.previousSales-a.previousSales),prevRank=new Map(prevSorted.map((x,i)=>[x.key,i+1]));
    return rows.sort((a,b)=>b.sales-a.sales).map((x,i)=>{
      const marginValue=x.marginKnown?x.marginValue:null,previousMarginValue=x.previousMarginKnown?x.previousMarginValue:null;
      return{key:x.key,label:x.label,sales:x.sales,previousSales:x.previousSales,previous:x.previousSales,deltaSales:x.sales-x.previousSales,delta:x.sales-x.previousSales,changePct:pct(x.sales,x.previousSales),sharePct:total?x.sales/total*100:null,units:x.units,quantityUnit:x.quantityUnits.size===1?[...x.quantityUnits][0]:null,marginValue,marginRate:marginValue!=null&&x.sales?marginValue/x.sales*100:null,previousMarginValue,deltaMargin:marginValue!=null&&previousMarginValue!=null?marginValue-previousMarginValue:null,rank:i+1,previousRank:prevRank.get(x.key)||null,deltaRank:prevRank.has(x.key)?prevRank.get(x.key)-(i+1):null}
    })
  }
  function mergeStores(parts){
    const map=new Map();
    for(const part of parts)for(const row of part.stores||[]){
      const key=row.storeId,cur=map.get(key)||{storeId:key,storeName:row.storeName,storeCode:row.storeCode,sales:0,previousSales:0,tickets:0,previousTickets:0,marginValue:0,previousMarginValue:0,marginKnown:true,previousMarginKnown:true,identifiedSales:0,identifiedSalesKnown:true,identifiedTickets:0,identifiedTicketsKnown:true};
      cur.sales+=Number(row.sales||0);cur.previousSales+=Number(row.previousSales||0);cur.tickets+=Number(row.tickets||0);cur.previousTickets+=Number(row.previousTickets||0);
      if(row.marginValue==null)cur.marginKnown=false;else cur.marginValue+=Number(row.marginValue||0);
      if(row.previousMarginValue==null)cur.previousMarginKnown=false;else cur.previousMarginValue+=Number(row.previousMarginValue||0);
      if(row.identifiedSalesShare==null)cur.identifiedSalesKnown=false;else cur.identifiedSales+=Number(row.sales||0)*Number(row.identifiedSalesShare||0)/100;
      if(row.identifiedTicketRate==null)cur.identifiedTicketsKnown=false;else cur.identifiedTickets+=Number(row.tickets||0)*Number(row.identifiedTicketRate||0)/100;
      map.set(key,cur)
    }
    return[...map.values()].map(x=>({storeId:x.storeId,storeName:x.storeName,storeCode:x.storeCode,sales:x.sales,previousSales:x.previousSales,changePct:pct(x.sales,x.previousSales),deltaSales:x.sales-x.previousSales,tickets:x.tickets,previousTickets:x.previousTickets,ticketsChangePct:pct(x.tickets,x.previousTickets),averageBasket:x.tickets?x.sales/x.tickets:null,previousAverageBasket:x.previousTickets?x.previousSales/x.previousTickets:null,basketChangePct:x.previousTickets&&x.previousSales?pct(x.sales/x.tickets,x.previousSales/x.previousTickets):null,marginValue:x.marginKnown?x.marginValue:null,marginRate:x.marginKnown&&x.sales?x.marginValue/x.sales*100:null,previousMarginValue:x.previousMarginKnown?x.previousMarginValue:null,deltaMargin:x.marginKnown&&x.previousMarginKnown?x.marginValue-x.previousMarginValue:null,marginChangePct:x.previousMarginKnown&&x.previousMarginValue?pct(x.marginValue,x.previousMarginValue):null,identifiedSalesShare:x.identifiedSalesKnown&&x.sales?x.identifiedSales/x.sales*100:null,identifiedTicketRate:x.identifiedTicketsKnown&&x.tickets?x.identifiedTickets/x.tickets*100:null,status:'READY'})).sort((a,b)=>b.sales-a.sales)
  }
  function mergeCrm(parts){
    const map=new Map(),pairMap=new Map(),basketProducts=new Map();let basketCount=0,basketUnits=0,basketDistinct=0,singleWeighted=0;
    for(const part of parts){
      const ba=part.crm?.basketAnalysis||{},n=Number(ba.identifiedBaskets||0);basketCount+=n;if(ba.averageUnits!=null)basketUnits+=Number(ba.averageUnits)*n;if(ba.averageDistinctProducts!=null)basketDistinct+=Number(ba.averageDistinctProducts)*n;if(ba.singleItemBasketRate!=null)singleWeighted+=Number(ba.singleItemBasketRate)*n;
      for(const p of ba.topProducts||[])basketProducts.set(p.productNumber,(basketProducts.get(p.productNumber)||0)+Number(p.sales||0));
      for(const p of ba.topProductPairs||[]){const a=String(p.productA||''),b=String(p.productB||''),key=a<b?`${a}|${b}`:`${b}|${a}`,cur=pairMap.get(key)||{productA:a<b?a:b,productB:a<b?b:a,tickets:0};cur.tickets+=Number(p.tickets||0);pairMap.set(key,cur)}
      const sourceRows=part.crm?.customerMergeRows?.length?part.crm.customerMergeRows:(part.crm?.customers||[]);
      for(const x of sourceRows){
        const key=x.customerAccount;if(!key)continue;
        const cur=map.get(key)||{customerAccount:key,sales:0,units:0,tickets:0,activeDays:0,firstDate:null,lastDate:null,storeCount:0,products:new Map(),weekdays:new Map(),hours:new Map(),priceMix:{VALUE:0,CORE:0,PREMIUM:0}};
        cur.sales+=Number(x.sales||0);cur.units+=Number(x.units||0);cur.tickets+=Number(x.tickets||0);cur.activeDays+=Number(x.activeDays||0);cur.storeCount=Math.max(cur.storeCount,Number(x.storeCount||0));
        if(x.firstDate&&(!cur.firstDate||x.firstDate<cur.firstDate))cur.firstDate=x.firstDate;if(x.lastDate&&(!cur.lastDate||x.lastDate>cur.lastDate))cur.lastDate=x.lastDate;
        if(x.favouriteWeekday)cur.weekdays.set(x.favouriteWeekday,(cur.weekdays.get(x.favouriteWeekday)||0)+Math.max(1,Number(x.activeDays||1)));
        if(x.favouriteHour!=null)cur.hours.set(String(x.favouriteHour),(cur.hours.get(String(x.favouriteHour))||0)+Math.max(1,Number(x.tickets||1)));
        if(x.priceMix){cur.priceMix.VALUE+=Number(x.priceMix.valuePct||0)*Number(x.priceMix.coverageSales||0)/100;cur.priceMix.CORE+=Number(x.priceMix.corePct||0)*Number(x.priceMix.coverageSales||0)/100;cur.priceMix.PREMIUM+=Number(x.priceMix.premiumPct||0)*Number(x.priceMix.coverageSales||0)/100}
        for(const p of x.topProducts||[]){const cp=cur.products.get(p.productNumber)||{sales:0,units:0};cp.sales+=Number(p.sales||0);cp.units+=Number(p.units||0);cur.products.set(p.productNumber,cp)}
        map.set(key,cur)
      }
    }
    const fav=m=>{let k=null,v=-1;for(const [a,b] of m)if(b>v){k=a;v=b}return k};
    const rows=[...map.values()].sort((a,b)=>b.sales-a.sales),total=rows.reduce((s,x)=>s+x.sales,0),threshold=rows.length?rows[Math.max(0,Math.ceil(rows.length*.2)-1)]?.sales||0:0;
    const baskets=rows.map(x=>x.tickets?x.sales/x.tickets:0).sort((a,b)=>a-b),breadths=rows.map(x=>x.products.size).sort((a,b)=>a-b),p80=a=>a.length?a[Math.max(0,Math.ceil(a.length*.8)-1)]:0,highBasket=p80(baskets),broad=p80(breadths);
    const customers=rows.map(x=>{
      let persona='REPEAT_TO_GROW';const avg=x.tickets?x.sales/x.tickets:null;if(x.tickets>=4&&x.sales>=threshold)persona='VIP_REGULAR';else if(x.tickets<=2&&avg>=highBasket)persona='BIG_BASKET_OCCASIONAL';else if(x.products.size>=broad&&x.tickets>=2)persona='EXPLORER';else if(x.tickets>=4)persona='ROUTINE_REGULAR';else if(x.tickets<=1)persona='ONE_SHOT';
      const priceEntries=Object.entries(x.priceMix).sort((a,b)=>b[1]-a[1]),knownPrice=priceEntries.reduce((s,[,v])=>s+Number(v||0),0),pricePreference=knownPrice>0?priceEntries[0][0]:'UNKNOWN';
      return{customerAccount:x.customerAccount,sales:x.sales,units:x.units,tickets:x.tickets,activeDays:x.activeDays,averageBasket:avg,averageUnitsPerBasket:x.tickets?x.units/x.tickets:null,firstDate:x.firstDate,lastDate:x.lastDate,storeCount:x.storeCount,distinctProducts:x.products.size,favouriteWeekday:fav(x.weekdays),favouriteHour:fav(x.hours),segment:x.tickets>=4&&x.sales>=threshold?'HIGH_VALUE_FREQUENT':x.sales>=threshold?'HIGH_VALUE':x.tickets>=4?'FREQUENT':x.tickets>=2?'REPEAT':'SINGLE_VISIT',persona,pricePreference,shareIdentifiedSalesPct:total?x.sales/total*100:null,topProducts:[...x.products.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,20).map(([productNumber,v])=>({productNumber,sales:v.sales,units:v.units}))}
    });
    const cohortMap=new Map();for(const x of customers){if(!x.firstDate)continue;const d=new Date(x.firstDate+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);const k=d.toISOString().slice(0,10),cur=cohortMap.get(k)||{cohort:k,customers:0,sales:0,repeat:0,tickets:0};cur.customers++;cur.sales+=x.sales;cur.tickets+=x.tickets;if(x.tickets>=2)cur.repeat++;cohortMap.set(k,cur)}
    const personas=Object.entries(customers.reduce((a,x)=>(a[x.persona]=(a[x.persona]||0)+1,a),{})).map(([persona,count])=>({persona,count,sharePct:customers.length?count/customers.length*100:null})).sort((a,b)=>b.count-a.count);
    const segments=Object.entries(customers.reduce((a,x)=>(a[x.segment]=(a[x.segment]||0)+1,a),{})).map(([segment,count])=>({segment,count,sharePct:customers.length?count/customers.length*100:null})).sort((a,b)=>b.count-a.count);
    const pricePreferences=Object.entries(customers.reduce((a,x)=>(a[x.pricePreference]=(a[x.pricePreference]||0)+1,a),{})).map(([preference,count])=>({preference,count,sharePct:customers.length?count/customers.length*100:null})).sort((a,b)=>b.count-a.count);
    const cohorts=[...cohortMap.values()].sort((a,b)=>a.cohort.localeCompare(b.cohort)).map(x=>({...x,repeatRate:x.customers?x.repeat/x.customers*100:null,averageSpend:x.customers?x.sales/x.customers:null,averageVisits:x.customers?x.tickets/x.customers:null}));
    const basketAnalysis={identifiedBaskets:basketCount,averageUnits:basketCount?basketUnits/basketCount:null,averageDistinctProducts:basketCount?basketDistinct/basketCount:null,singleItemBasketRate:basketCount?singleWeighted/basketCount:null,topProducts:[...basketProducts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([productNumber,sales])=>({productNumber,sales})),topProductPairs:[...pairMap.values()].sort((a,b)=>b.tickets-a.tickets).slice(0,40).map(x=>({...x,sharePct:basketCount?x.tickets/basketCount*100:null}))};
    return{scope:'SELECTED_PERIOD_ONLY',identifiedCustomers:customers.length,identifiedSales:total,repeatCustomers:customers.filter(x=>x.tickets>=2).length,frequentCustomers:customers.filter(x=>x.tickets>=4).length,repeatRate:customers.length?customers.filter(x=>x.tickets>=2).length/customers.length*100:null,averageVisitsPerCustomer:customers.length?customers.reduce((s,x)=>s+Number(x.tickets||0),0)/customers.length:null,personas,segments,pricePreferences,cohorts,basketAnalysis,customerMergeRows:customers.slice(0,10000),customers:customers.slice(0,750)}
  }
  function mergeDecisionParts(parts,period,comparison){
    const current=sumSnapshot(parts,'current'),previous=sumSnapshot(parts,'previous'),products=mergeRankedRows(parts,p=>p.products||[]),stores=mergeStores(parts),hierarchy={};
    for(const level of ['department','rayon','family','subfamily','subsubfamily','ub'])hierarchy[level]=mergeRankedRows(parts,p=>p.hierarchy?.[level]||[],'previous');
    const trafficEffect=previous.averageBasket!=null?(current.tickets-previous.tickets)*previous.averageBasket:null,basketEffect=previous.averageBasket!=null&&current.averageBasket!=null?current.tickets*(current.averageBasket-previous.averageBasket):null;
    const marginStatuses=[...new Set(parts.map(p=>p.margin?.status).filter(Boolean))],marginStatus=marginStatuses.length===1?marginStatuses[0]:marginStatuses.includes('UNVALIDATED')?'UNVALIDATED':marginStatuses.includes('UNAVAILABLE')?'UNAVAILABLE':'MIXED';
    const crm=mergeCrm(parts);
    const cashierItems=parts.flatMap(p=>p.cashiers?.items||[]),pricePreferences=Object.entries(crm.customers.reduce((a,x)=>(a[x.pricePreference||'UNKNOWN']=(a[x.pricePreference||'UNKNOWN']||0)+1,a),{})).map(([preference,count])=>({preference,count,sharePct:crm.customers.length?count/crm.customers.length*100:null}));
    crm.pricePreferences=pricePreferences;
    return{status:'READY',period,comparison,coverage:{storesRequested:parts[0]?.coverage?.storesRequested||0,currentStoresReady:Math.min(...parts.map(p=>p.coverage?.currentStoresReady??0)),comparisonStoresReady:Math.min(...parts.map(p=>p.coverage?.comparisonStoresReady??0))},summary:{current,previous,salesChangePct:pct(current.sales,previous.sales),ticketsChangePct:pct(current.tickets,previous.tickets),basketChangePct:pct(current.averageBasket,previous.averageBasket),marginChangePct:previous.marginValue?pct(current.marginValue,previous.marginValue):null,marginRateDelta:current.marginRate!=null&&previous.marginRate!=null?current.marginRate-previous.marginRate:null,drivers:{trafficEffect,basketEffect,totalDelta:current.sales-previous.sales,reconciliationGap:trafficEffect!=null&&basketEffect!=null?(current.sales-previous.sales)-trafficEffect-basketEffect:null}},margin:{status:marginStatus,available:marginStatus==='VALIDATED',message:marginStatus==='VALIDATED'?'Coût transactionnel validé.':marginStatus==='UNVALIDATED'?'Champ coût détecté mais non validé comme coût historique transactionnel.':'Coût transactionnel indisponible.'},daily:{current:parts.flatMap(p=>p.daily?.current||[]).sort((a,b)=>a.date.localeCompare(b.date)),previous:parts.flatMap(p=>p.daily?.previous||[]).sort((a,b)=>a.date.localeCompare(b.date))},stores,products,hierarchy,contributors:{negativeProducts:[...products].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,20),positiveProducts:[...products].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,20),negativeStores:[...stores].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,10),positiveStores:[...stores].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,10)},cashiers:{status:cashierItems.length?'READY':'UNAVAILABLE',items:cashierItems,source:'CHUNK_MERGE'},crm,generatedAt:new Date().toISOString()}
  }
  function setProgress(done,total){
    const el=$('#executiveSalesValue');if(el)el.textContent=done>=total?'Finalisation…':`Analyse ${done}/${total}`;
    const foot=$('#executiveComparisonValue');if(foot)foot.textContent='Lecture Dynamics par blocs';
  }
  async function fetchDecisionSlice(api,s,cur,cmp,force=false){
    const scope=storeScopeKey(s),q=new URLSearchParams({storeId:scope==='ALL'?'ALL':'MULTI',start:cur.start,end:cur.end,compareStart:cmp.start,compareEnd:cmp.end});if(scope!=='ALL')q.set('storeIds',scope);
    if(force)q.set('force','1');
    try{return await api.api(`/api/analytics/decision?${q}`,{noRetry:true})}
    catch(error){
      const retryable=Number(error?.status)===504||Number(error?.status)===503||error?.code==='API_NOT_JSON';
      const cd=rangeDays(cur.start,cur.end),pd=rangeDays(cmp.start,cmp.end);
      if(retryable&&cd>1&&pd>1){
        const cparts=splitRange(cur.start,cur.end,2),pparts=splitRange(cmp.start,cmp.end,2);
        const left=await fetchDecisionSlice(api,s,cparts[0],pparts[0],force),right=await fetchDecisionSlice(api,s,cparts[1],pparts[1],force);
        return mergeDecisionParts([left,right],{startDate:cur.start,endDate:cur.end,days:cd},{startDate:cmp.start,endDate:cmp.end,days:pd})
      }
      throw error
    }
  }
  async function loadDecisionChunked(api,s,force=false){
    const cur={start:s.periodStart,end:s.periodEnd},cmp={start:s.compareStart,end:s.compareEnd},curDays=rangeDays(cur.start,cur.end),cmpDays=rangeDays(cmp.start,cmp.end);
    setProgress(0,1);
    try{
      const full=await fetchDecisionSlice(api,s,cur,cmp,force);
      setProgress(1,1);return full
    }catch(error){
      const retryable=Number(error?.status)===504||Number(error?.status)===503||error?.code==='API_NOT_JSON';
      if(!retryable)throw error;
      const blocks=Math.max(2,Math.min(4,Math.ceil(Math.max(curDays,cmpDays)/15))),currentParts=splitRange(cur.start,cur.end,blocks),compareParts=splitRange(cmp.start,cmp.end,blocks),results=new Array(blocks);let next=0,done=0;
      const worker=async()=>{while(true){const i=next++;if(i>=blocks)return;results[i]=await fetchDecisionSlice(api,s,currentParts[i],compareParts[i],force);done++;setProgress(done,blocks)}};
      await Promise.all(Array.from({length:Math.min(2,blocks)},worker));
      return mergeDecisionParts(results,{startDate:cur.start,endDate:cur.end,days:curDays},{startDate:cmp.start,endDate:cmp.end,days:cmpDays})
    }
  }
  function catalogItem(sku){return state.catalog.get(String(sku||''))||null}
  function productLabel(sku,fallback=''){const ref=catalogItem(sku);return ref?.productName||fallback||sku}
  function productSubLabel(sku){const ref=catalogItem(sku);return ref?.productName?sku:''}
  function hierarchyNode(sku,level){return catalogItem(sku)?.hierarchy?.[level]||null}
  function unitFactor(from,to){
    const a=normalizeQtyUnit(from),b=normalizeQtyUnit(to);
    if(a===b)return 1;
    if(a==='KG'&&b==='G')return 1000;
    if(a==='G'&&b==='KG')return .001;
    if(a==='L'&&['ML','MILLILITRE','MILLILITER'].includes(b))return 1000;
    if(['ML','MILLILITRE','MILLILITER'].includes(a)&&b==='L')return .001;
    return null
  }
  function estimateMargin(row){
    const sales=Number(row?.sales),directValue=Number(row?.marginValue),directRate=Number(row?.marginRate);
    if(Number.isFinite(directValue)){
      const rate=Number.isFinite(directRate)?directRate:(sales?directValue/sales*100:null);
      if(rate!=null&&(rate>100||rate<-200))return{value:null,rate:null,estimated:false,quality:'IMPLAUSIBLE_TRANSACTION_MARGIN'};
      return{value:directValue,rate,estimated:false,quality:'TRANSACTION_COST'};
    }
    const ref=catalogItem(row?.key),unitCost=Number(ref?.currentUnitCost),units=Number(row?.units),costBasis=ref?.currentCostBasisUnit||ref?.salesUnit||null;
    let quantityUnit=row?.quantityUnit||null,quantityUnitSource='TRANSACTION';
    if(!quantityUnit){
      const inv=ref?.inventoryUnit||null,sale=ref?.salesUnit||null;
      if(inv&&sale&&normalizeQtyUnit(inv)!==normalizeQtyUnit(sale)){quantityUnit=inv;quantityUnitSource='INFERRED_INVENTORY_UNIT'}
      else{quantityUnit=sale||inv;quantityUnitSource='PRODUCT_MASTER'}
    }
    const factor=unitFactor(quantityUnit,costBasis);
    if(!Number.isFinite(unitCost)||!Number.isFinite(units)||!Number.isFinite(sales)||!quantityUnit||!costBasis||factor==null)return{value:null,rate:null,estimated:false,quality:'UNIT_OR_COST_UNAVAILABLE'};
    const pricedQty=Math.abs(units)*factor,costValue=pricedQty*unitCost,value=sales-costValue,rate=sales?value/sales*100:null;
    if(!Number.isFinite(rate)||rate>100||rate<-200)return{value:null,rate:null,estimated:false,quality:'IMPLAUSIBLE_CURRENT_COST',costValue,pricedQty,quantityUnit,costBasis,conversionFactor:factor};
    return{value,rate,estimated:true,quality:'CURRENT_COST',costValue,pricedQty,quantityUnit,costBasis,quantityUnitSource,conversionFactor:factor}
  }
  function catalogSkuList(){
    const d=state.data||{},set=new Set((d.products||[]).slice(0,500).map(x=>x.key));
    for(const x of d.crm?.customers||[])for(const p of x.topProducts||[])set.add(p.productNumber);
    for(const p of d.crm?.basketAnalysis?.topProducts||[])set.add(p.productNumber);
    for(const p of d.crm?.basketAnalysis?.topProductPairs||[]){set.add(p.productA);set.add(p.productB)}
    return[...set].filter(Boolean).slice(0,650)
  }
  async function loadCatalog(force=false){
    const api=core(),s=sectionState();if(!api||!state.data||state.catalogLoading)return;
    const key=queryKey(s);if(!state.catalog.size)hydrateCatalogCache();
    if(!force&&state.catalogKey===key&&state.catalog.size)return;
    state.catalogLoading=true;
    const skus=catalogSkuList(),missing=force?skus:skus.filter(sku=>!state.catalog.has(sku)),batches=[];for(let i=0;i<missing.length;i+=240)batches.push(missing.slice(i,i+240));
    let cursor=0,progressiveRendered=false;
    const worker=async()=>{while(cursor<batches.length){const batch=batches[cursor++];try{const q=new URLSearchParams({products:batch.join(',')}),data=await api.api('/api/analytics/catalog?'+q,{noRetry:true});for(const item of data.items||[])state.catalog.set(item.productNumber,item);persistCatalogCache();if(!progressiveRendered){progressiveRendered=true;safeRenderPart('performance-first-labels',()=>renderPerformance(false));safeRenderPart('crm-first-labels',renderCrm)}}catch(error){console.error('Catalog batch failed',batch.slice(0,3),error)}}};
    await Promise.all(Array.from({length:Math.min(3,batches.length)},worker));
    state.catalogKey=key;state.catalogLoading=false;safeRenderPart('sales-margin-enrichment',renderSales);safeRenderPart('performance-enrichment',renderPerformance);safeRenderPart('crm-enrichment',renderCrm);safeRenderPart('negative-contributors',()=>renderContributors('negative'));safeRenderPart('positive-contributors',()=>renderContributors('positive'))
  }

  function sectionNeedsDecision(s=sectionState()){return ['overview','sales','network','categories','crm','loyalty','cashiers'].includes(s?.section)}
  function sectionNeedsCatalog(s=sectionState()){return ['sales','categories','crm'].includes(s?.section)}
  function warmCatalogSoon(){
    const s=sectionState();if(!s||sectionNeedsCatalog(s))return;
    const run=()=>{if(state.data&&!state.catalogLoading)loadCatalog(false).catch(()=>{})};
    if('requestIdleCallback' in window)window.requestIdleCallback(run,{timeout:2500});else setTimeout(run,1200)
  }
  function maybeLoadCatalog(force=false){if(sectionNeedsCatalog())loadCatalog(force).catch(error=>{console.error('Retail Intelligence catalog enrichment failure',error);const note=$('#catalogCoverage');if(note)note.textContent='Libellés produits indisponibles : '+(error?.message||'erreur source article')})}
  async function load(force=false){
    const api=core(),s=sectionState(); if(!api||!s||!s.stores?.length||state.loading||!sectionNeedsDecision(s))return;
    const key=queryKey(s);
    if(!force&&state.freshKey===key&&state.data){render();return}
    const cached=!force?cachedDecision(key):null;
    if(cached&&state.key!==key){
      state.data=cached;state.key=key;
      window.RETAIL_DECISION_INTELLIGENCE={getData:()=>state.data,reload:()=>load(true)};
      render();
      document.dispatchEvent(new CustomEvent('retail-intelligence:decision',{detail:{data:state.data,cached:true}}));
      maybeLoadCatalog(false);
      warmCatalogSoon();
    }
    state.loading=true;
    if(!cached)setLoading();
    setProgress(0,Math.max(1,Math.ceil(Math.max(rangeDays(s.periodStart,s.periodEnd),rangeDays(s.compareStart,s.compareEnd))/15)));
    try{
      const fresh=await loadDecisionChunked(api,s,force);
      state.data=fresh; state.key=key; state.freshKey=key; saveDecisionCache(key,fresh);
      window.RETAIL_DECISION_INTELLIGENCE={getData:()=>state.data,reload:()=>load(true)};
      document.dispatchEvent(new CustomEvent('retail-intelligence:decision',{detail:{data:state.data,cached:false}}));
      maybeLoadCatalog(force);
      warmCatalogSoon();
      render();
    }catch(error){if(!cached)renderError(error)}
    finally{state.loading=false}
  }

  function setLoading(){
    for(const id of ['decisionSalesKpis','benchmarkSummary','performanceQuadrants','crmKpis']){
      const h=$('#'+id);if(h)h.innerHTML='<div class="decision-kpi skeleton-card"></div><div class="decision-kpi skeleton-card"></div><div class="decision-kpi skeleton-card"></div>';
    }
    for(const id of ['benchmarkBody','performanceBody','crmBody']){
      const h=$('#'+id);if(h)h.innerHTML='<tr><td colspan="12"><div class="table-loading">Analyse de la période…</div></td></tr>';
    }
  }
  function renderError(error){
    const api=core(); const msg=api?.escapeHtml?.(error?.message||'Analyse indisponible')||'Analyse indisponible';
    for(const id of ['benchmarkBody','performanceBody','crmBody']){const h=$('#'+id);if(h)h.innerHTML=`<tr><td colspan="12"><div class="table-loading">${msg}</div></td></tr>`}
    const k=$('#decisionSalesKpis');if(k)k.innerHTML=`<div class="decision-kpi"><small>Source</small><strong>N/A</strong><span>${msg}</span></div>`;
  }

  function safeRenderPart(name,fn){try{fn()}catch(error){console.error('Retail Intelligence render failure',name,error)}}
  function render(){if(!state.data)return;safeRenderPart('executive',renderExecutive);safeRenderPart('sales',renderSales);safeRenderPart('benchmark',renderBenchmark);safeRenderPart('performance',renderPerformance);safeRenderPart('crm',renderCrm)}

  function renderExecutive(){
    const api=core(),d=state.data,s=d.summary||{},cur=s.current||{},prev=s.previous||{},app=sectionState()||{};
    const set=(id,value,html=false)=>{const el=$(id);if(!el)return;if(html)el.innerHTML=value;else el.textContent=value};
    set('#executiveSalesValue',api.money(cur.sales,true));
    set('#executiveSalesDelta',signed(api,s.salesChangePct),true);
    set('#executiveComparisonValue',api.money(prev.sales,true));
    const gap=cur.sales!=null&&prev.sales!=null?cur.sales-prev.sales:null;
    set('#executiveSalesGap',gap==null?'N/A':`${gap>0?'+':''}${api.money(gap,true)}`);
    set('#executiveScopeValue',core()?.getStoreScopeLabel?.()||`${d.coverage?.currentStoresReady||0}/${d.coverage?.storesRequested||0} magasins`);
    set('#executiveTickets',api.number(cur.tickets));
    set('#executiveTrafficDelta',signed(api,s.ticketsChangePct),true);
    set('#executiveBasket',api.money(cur.averageBasket));
    set('#executiveBasketDelta',signed(api,s.basketChangePct),true);
    set('#healthLoyalty',api.percent(cur.identifiedSalesShare));
    set('#healthRecruitment','N/A');
    set('#healthOos','Voir stock');
    set('#healthCoverage',d.coverage?.storesRequested?api.percent((d.coverage.currentStoresReady||0)/d.coverage.storesRequested*100,0):'N/A');
    const label=$('#executiveHealthLabel');
    if(label){
      const sales=s.salesChangePct,margin=s.marginChangePct;
      let text='Stable',tone='stable';
      if(sales!=null&&sales>5&&(margin==null||margin>=0)){text='Solide';tone='strong'}
      else if((sales!=null&&sales<-5)||(margin!=null&&margin<-5)){text='Sous tension';tone='risk'}
      else if(sales!=null&&sales>0){text='En progression';tone='positive'}
      label.textContent=text;label.className=`health-label ${tone}`;
    }
  }

  function renderSales(){
    const api=core(),d=state.data,s=d.summary||{},cur=s.current||{},prev=s.previous||{};
    let displayMargin=cur.marginValue,displayRate=cur.marginRate,estimated=false,marginCoverage=null;
    if(displayMargin==null&&state.catalog.size){
      let margin=0,coveredSales=0;
      for(const raw of d.products||[]){const row=productWithCatalog(raw),m=estimateMargin(row);if(m.value==null)continue;margin+=Number(m.value);coveredSales+=Number(row.sales||0)}
      if(coveredSales>0){displayMargin=margin;displayRate=margin/coveredSales*100;marginCoverage=cur.sales?coveredSales/Number(cur.sales)*100:null;estimated=true}
    }
    const badge=$('#marginStatusBadge');
    if(badge){
      if(d.margin?.available){badge.textContent='Marge · coût transactionnel validé';badge.className='margin-status valid'}
      else if(estimated){badge.textContent=`Marge ~ coût courant · ${marginCoverage==null?'couverture N/A':api.percent(marginCoverage,0)+' CA couvert'}`;badge.className='margin-status warning'}
      else{badge.textContent=d.margin?.status==='UNVALIDATED'?'Marge · coût à valider':'Marge · enrichissement coût en cours';badge.className='margin-status warning'}
    }
    $('#decisionCoverage').textContent=`${d.coverage?.currentStoresReady||0}/${d.coverage?.storesRequested||0} magasin(s)`;
    const marginLabel=estimated?'Marge estimée ~':'Marge DH',rateLabel=estimated?'Taux marge ~':'Taux de marge',marginSub=estimated?`coût courant · ${marginCoverage==null?'couverture N/A':api.percent(marginCoverage,0)+' du CA'}`:'coût transactionnel validé uniquement';
    const cards=[
      ['CA',api.money(cur.sales,true),signed(api,s.salesChangePct),'vs période comparée'],
      ['Tickets',api.number(cur.tickets),signed(api,s.ticketsChangePct),'fréquentation'],
      ['Panier moyen',api.money(cur.averageBasket),signed(api,s.basketChangePct),'effet panier'],
      [marginLabel,displayMargin==null?'N/A':(estimated?'~ ':'')+api.money(displayMargin,true),estimated?'<span class="metric-na">estimation</span>':signed(api,s.marginChangePct),marginSub],
      [rateLabel,displayRate==null?'N/A':(estimated?'~ ':'')+api.percent(displayRate),estimated?'<span class="metric-na">estimation</span>':s.marginRateDelta==null?'<span class="metric-na">N/A</span>':signed(api,s.marginRateDelta),estimated?'pas une marge comptable historique':'écart en points'],
      ['CA fidélisé',api.percent(cur.identifiedSalesShare),cur.identifiedSales==null?'<span class="metric-na">N/A</span>':api.money(cur.identifiedSales,true),'poids du CA identifié']
    ];
    $('#decisionSalesKpis').innerHTML=cards.map(([l,v,delta,sub])=>`<div class="decision-kpi"><small>${l}</small><strong>${v}</strong><span>${delta} · ${sub}</span></div>`).join('');
    renderWaterfall(); renderDailyChart(); renderContributors('negative'); renderContributors('positive');
  }

  function renderWaterfall(){
    const api=core(),drv=state.data?.summary?.drivers||{},vals=[
      ['Effet fréquentation',safe(drv.trafficEffect),'Tickets × panier de référence'],
      ['Effet panier',safe(drv.basketEffect),'Tickets actuels × variation panier'],
      ['Écart total',safe(drv.totalDelta),'Variation de CA expliquée']
    ],max=Math.max(1,...vals.map(x=>Math.abs(x[1]||0)));
    $('#salesDriversWaterfall').innerHTML=vals.map(([label,value,note])=>{
      const neg=(value||0)<0,w=Math.min(50,Math.abs(value||0)/max*50);
      return `<div class="waterfall-row"><div class="waterfall-label"><strong>${label}</strong><span>${note}</span></div><div class="waterfall-track"><i class="${neg?'neg':''}" style="width:${w}%"></i></div><div class="waterfall-value ${neg?'neg':'pos'}">${value==null?'N/A':(value>0?'+':'')+api.money(value,true)}</div></div>`
    }).join('');
  }

  function renderDailyChart(){
    const svg=$('#decisionDailyChart'),api=core(),cur=state.data?.daily?.current||[],prev=state.data?.daily?.previous||[];
    if(!svg)return;if(!cur.length){svg.innerHTML='<text x="460" y="150" text-anchor="middle" class="decision-axis">Pas de série quotidienne disponible</text>';return}
    const w=920,h=300,p={l:50,r:18,t:18,b:34},all=[...cur,...prev].map(x=>safe(x.sales)||0),max=Math.max(...all,1);
    const x=(i,n)=>p.l+(i*(w-p.l-p.r))/Math.max(n-1,1),y=v=>h-p.b-(v/max)*(h-p.t-p.b);
    let html='';for(let i=0;i<=4;i++){const yy=p.t+i*(h-p.t-p.b)/4;html+=`<line class="decision-gridline" x1="${p.l}" y1="${yy}" x2="${w-p.r}" y2="${yy}"/><text class="decision-axis" x="${p.l-8}" y="${yy+3}" text-anchor="end">${api.money(max*(1-i/4),true).replace(' DH','')}</text>`}
    const path=(rows,cls)=>rows.length?`<path class="${cls}" d="${rows.map((r,i)=>`${i?'L':'M'} ${x(i,rows.length)} ${y(r.sales)}`).join(' ')}"/>`:'';
    html+=path(prev,'decision-line-previous')+path(cur,'decision-line-current');
    cur.forEach((r,i)=>{if(cur.length<=12||i%Math.max(1,Math.ceil(cur.length/8))===0)html+=`<text class="decision-axis" x="${x(i,cur.length)}" y="${h-10}" text-anchor="middle">${String(r.date).slice(5)}</text>`});
    svg.innerHTML=html;
  }

  function renderContributors(tone){
    const api=core(),rows=tone==='negative'?state.data?.contributors?.negativeProducts||[]:state.data?.contributors?.positiveProducts||[],host=$(tone==='negative'?'#negativeContributors':'#positiveContributors');
    if(!host)return;if(!rows.length){host.innerHTML='<div class="table-loading">Aucune contribution significative.</div>';return}
    host.innerHTML=rows.slice(0,8).map((r,i)=>{const label=productLabel(r.key,r.label);return`<div class="contributor-row"><span class="contributor-rank">${i+1}</span><div class="contributor-name"><strong>${api.escapeHtml(label)}</strong><span>${api.escapeHtml(r.key)} · CA ${api.money(r.sales,true)}</span></div><span class="contributor-value ${tone}">${r.deltaSales>0?'+':''}${api.money(r.deltaSales,true)}</span></div>`}).join('');
  }

  function renderBenchmark(){
    const api=core(),rows=state.data?.stores||[],body=$('#benchmarkBody'),summary=$('#benchmarkSummary');if(!body||!summary)return;
    const valid=rows.filter(x=>x.sales!=null),avg=valid.length?valid.reduce((s,x)=>s+Number(x.sales||0),0)/valid.length:0;
    const ranked=[...valid].sort((a,b)=>Number(b.sales||0)-Number(a.sales||0));
    const best=ranked[0],weak=[...valid].filter(x=>x.changePct!=null).sort((a,b)=>a.changePct-b.changePct)[0];
    const marginBest=[...valid].filter(x=>x.marginValue!=null).sort((a,b)=>b.marginValue-a.marginValue)[0];
    summary.innerHTML=[
      ['#1 CA',best?.storeName||'N/A',best?api.money(best.sales,true):'—'],
      ['Plus forte dynamique',[...valid].filter(x=>x.changePct!=null).sort((a,b)=>b.changePct-a.changePct)[0]?.storeName||'N/A','vs comparaison'],
      ['À surveiller',weak?.storeName||'N/A',weak?.changePct==null?'—':api.percent(weak.changePct)],
      ['#1 Marge',marginBest?.storeName||'N/A',marginBest?api.money(marginBest.marginValue,true):'N/A']
    ].map(([l,v,s])=>`<div class="benchmark-card"><small>${l}</small><strong>${api.escapeHtml(v)}</strong><span>${s}</span></div>`).join('');
    const visual=$('#benchmarkVisual'),actions=$('#storeDecisionList');
    if(visual&&valid.length){
      const w=620,h=290,pad=42,maxSales=Math.max(...valid.map(x=>Number(x.sales||0)),1),changes=valid.map(x=>Number(x.changePct||0)),minX=Math.min(-10,...changes),maxX=Math.max(10,...changes),x=v=>pad+(Math.max(minX,Math.min(maxX,v))-minX)/(maxX-minX||1)*(w-pad*2),y=v=>h-pad-(Number(v||0)/maxSales)*(h-pad*2);
      const bubbles=valid.map(r=>{const cx=x(Number(r.changePct||0)),cy=y(r.sales),rr=5+Math.min(12,Math.max(0,Number(r.averageBasket||0))/30);return`<g><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}"></circle><text x="${(cx+rr+4).toFixed(1)}" y="${(cy+3).toFixed(1)}">${api.escapeHtml(r.storeName)}</text></g>`}).join('');
      const zero=x(0);
      visual.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Positionnement magasins CA et évolution"><line class="axis-line" x1="${zero}" x2="${zero}" y1="${pad/2}" y2="${h-pad/2}"></line><line class="axis-line" x1="${pad/2}" x2="${w-pad/2}" y1="${h-pad}" y2="${h-pad}"></line><text class="axis-label" x="${pad}" y="${h-8}">Baisse ← évolution CA → croissance</text><text class="axis-label" x="8" y="18">CA ↑</text>${bubbles}</svg>`
    }else if(visual)visual.innerHTML='<div class="table-loading">Positionnement indisponible.</div>';
    if(actions){
      const avgTickets=valid.length?valid.reduce((s,x)=>s+Number(x.tickets||0),0)/valid.length:0,avgBasket=valid.length?valid.reduce((s,x)=>s+Number(x.averageBasket||0),0)/valid.length:0,loyalty=[...valid].filter(x=>x.identifiedSalesShare!=null).sort((a,b)=>Number(a.identifiedSalesShare)-Number(b.identifiedSalesShare))[0],growth=[...valid].filter(x=>x.changePct!=null).sort((a,b)=>Number(b.changePct)-Number(a.changePct))[0],trafficGap=[...valid].filter(x=>Number(x.averageBasket||0)>=avgBasket&&Number(x.tickets||0)<avgTickets).sort((a,b)=>Number(a.tickets)-Number(b.tickets))[0];
      const decisions=[];
      if(weak)decisions.push({tone:'risk',title:`Relancer ${weak.storeName}`,text:`CA ${api.percent(weak.changePct)} vs période comparée. Priorité au diagnostic trafic / assortiment.`});
      if(trafficGap)decisions.push({tone:'warning',title:`Potentiel trafic · ${trafficGap.storeName}`,text:`Panier au-dessus du réseau mais fréquentation sous la moyenne : le levier principal est l'acquisition de visites.`});
      if(loyalty)decisions.push({tone:'info',title:`Fidélité · ${loyalty.storeName}`,text:`Poids CA identifié ${api.percent(loyalty.identifiedSalesShare)} : vérifier identification caisse et recrutement.`});
      if(growth)decisions.push({tone:'positive',title:`À répliquer · ${growth.storeName}`,text:`Meilleure dynamique réseau (${api.percent(growth.changePct)}). Identifier les catégories et créneaux qui expliquent la hausse.`});
      actions.innerHTML=decisions.slice(0,4).map(d=>`<div class="decision-action ${d.tone}"><strong>${api.escapeHtml(d.title)}</strong><span>${api.escapeHtml(d.text)}</span></div>`).join('')||'<div class="table-loading">Pas assez de données pour prioriser.</div>'
    }
    if(!ranked.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucun magasin comparable.</div></td></tr>';return}
    body.innerHTML=ranked.map((r,i)=>`<tr><td><span class="rank-chip">${i+1}</span></td><td><div class="element-cell"><strong>${api.escapeHtml(r.storeName)}</strong><span>${api.escapeHtml(r.storeCode||'')}</span></div></td><td>${api.money(r.sales,true)}</td><td>${signed(api,r.changePct)}</td><td>${avg?api.number(r.sales/avg*100,0)+' idx':'N/A'}</td><td>${api.number(r.tickets)}</td><td>${api.money(r.averageBasket)}</td><td>${api.money(r.marginValue,true)}</td><td>${api.percent(r.marginRate)}</td><td>${api.percent(r.identifiedSalesShare)}</td></tr>`).join('');
  }

  function productWithCatalog(row){
    const ref=catalogItem(row.key),m=estimateMargin(row);
    return{...row,label:productLabel(row.key,row.label),productCode:row.key,hierarchy:ref?.hierarchy||{},ub:ref?.ub||null,quantityUnit:row.quantityUnit||ref?.salesUnit||ref?.inventoryUnit||null,marginValue:m.value,marginRate:m.rate,marginEstimated:m.estimated}
  }
  function matchesHierarchyFilters(row){
    const f=state.filters||{},h=row.hierarchy||{};
    if(f.department&&h.department?.id!==f.department)return false;
    if(f.rayon&&h.rayon?.id!==f.rayon)return false;
    if(f.family&&h.family?.id!==f.family)return false;
    if(f.subfamily&&h.subfamily?.id!==f.subfamily)return false;
    if(f.subsubfamily&&h.subsubfamily?.id!==f.subsubfamily)return false;
    if(f.ub&&h.ub?.id!==f.ub)return false;
    if(f.product&&row.key!==f.product)return false;
    return true
  }
  function filteredProducts(){
    const q=state.search.trim().toLowerCase();
    return(state.data?.products||[]).map(productWithCatalog).filter(row=>{
      if(!matchesHierarchyFilters(row))return false;
      return !q||[row.label,row.key,row.hierarchy?.department?.label,row.hierarchy?.rayon?.label,row.hierarchy?.family?.label,row.hierarchy?.subfamily?.label,row.hierarchy?.subsubfamily?.label,row.hierarchy?.ub?.label].some(v=>String(v||'').toLowerCase().includes(q))
    })
  }
  function normalizeQtyUnit(value){
    const u=String(value||'').trim().toUpperCase();
    if(!u)return'INCONNUE';
    if(['KG','KGS','KILOGRAM','KILOGRAMME','KILOGRAMMES'].includes(u))return'KG';
    if(['G','GR','GRAM','GRAMME','GRAMMES'].includes(u))return'G';
    if(['EA','EACH','PCS','PC','PIECE','PIÈCE','UNIT','UN','U'].includes(u))return'PC';
    if(['L','LT','LITRE','LITER'].includes(u))return'L';
    return u
  }
  function quantityMapAdd(map,unit,value){const u=normalizeQtyUnit(unit);map.set(u,(map.get(u)||0)+Number(value||0))}
  function quantityBreakdown(row,api){
    const entries=row.quantityByUnit instanceof Map?[...row.quantityByUnit.entries()]:Object.entries(row.quantityByUnit||{});
    if(!entries.length&&row.units!=null)return row.quantityUnit?`${api.number(row.units,2)} ${normalizeQtyUnit(row.quantityUnit)}`:'N/A';
    return entries.sort((a,b)=>a[0].localeCompare(b[0])).map(([unit,value])=>`${api.number(value,unit==='PC'?0:2)} ${unit}`).join(' · ')||'N/A'
  }
  function aggregateHierarchyRows(products,level){
    const map=new Map();
    for(const p of products){
      const node=p.hierarchy?.[level],key=node?.id||'__UNCLASSIFIED__',label=node?.label||'Non classé',cur=map.get(key)||{key,label,sales:0,previousSales:0,quantityByUnit:new Map(),marginValue:0,marginKnown:true,marginEstimated:false};
      cur.sales+=Number(p.sales||0);cur.previousSales+=Number(p.previousSales||0);quantityMapAdd(cur.quantityByUnit,p.quantityUnit,Number(p.units||0));
      if(p.marginValue==null)cur.marginKnown=false;else cur.marginValue+=Number(p.marginValue||0);
      cur.marginEstimated=cur.marginEstimated||!!p.marginEstimated;map.set(key,cur)
    }
    const total=[...map.values()].reduce((s,x)=>s+x.sales,0),prev=[...map.values()].sort((a,b)=>b.previousSales-a.previousSales),prevRank=new Map(prev.map((x,i)=>[x.key,i+1]));
    return[...map.values()].map(x=>{
      const unitEntries=[...x.quantityByUnit.entries()].filter(([,v])=>Number(v)!==0),single=unitEntries.length===1?unitEntries[0]:null;
      return{...x,units:single?single[1]:null,quantityUnit:single?single[0]:null,mixedQuantityUnits:unitEntries.length>1,deltaSales:x.sales-x.previousSales,changePct:x.previousSales?(x.sales-x.previousSales)/x.previousSales*100:null,sharePct:total?x.sales/total*100:null,marginValue:x.marginKnown?x.marginValue:null,marginRate:x.marginKnown&&x.sales?x.marginValue/x.sales*100:null,previousRank:prevRank.get(x.key)||null}
    }).sort((a,b)=>b.sales-a.sales)
  }
  function performanceRows(){
    const products=filteredProducts(),base=state.level==='product'?products:aggregateHierarchyRows(products,state.level),metric=(state.metric==='units'&&state.level!=='product')?'sales':state.metric;
    const ranked=[...base].sort((a,b)=>{const av=safe(a[metric]),bv=safe(b[metric]);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;return bv-av});
    const prevField='previousSales',prevSorted=[...base].filter(x=>safe(x[prevField])!=null).sort((a,b)=>Number(b[prevField]||0)-Number(a[prevField]||0)),prevRank=new Map(prevSorted.map((x,i)=>[x.key,i+1]));
    return ranked.map((x,i)=>({...x,displayRank:i+1,previousRank:prevRank.get(x.key)||x.previousRank||null,rankDelta:(prevRank.get(x.key)||x.previousRank)?(prevRank.get(x.key)||x.previousRank)-(i+1):null}))
  }
  function optionRows(level){
    const seen=new Map();
    for(const p of(state.data?.products||[]).map(productWithCatalog)){const node=p.hierarchy?.[level];if(node?.id&&!seen.has(node.id))seen.set(node.id,node.label||node.id)}
    return[...seen.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'fr'))
  }
  function setOptions(id,placeholder,rows,current){
    const el=$(id);if(!el)return;const api=core();el.innerHTML=`<option value="">${placeholder}</option>`+rows.map(([value,label])=>`<option value="${api.escapeHtml(value)}">${api.escapeHtml(label)} · ${api.escapeHtml(value)}</option>`).join('');el.value=current||''
  }
  function renderHierarchyFilters(){
    setOptions('#filterDepartment','Tous les départements',optionRows('department'),state.filters.department);
    setOptions('#filterRayon','Tous les rayons',optionRows('rayon'),state.filters.rayon);
    setOptions('#filterFamily','Toutes les familles',optionRows('family'),state.filters.family);
    setOptions('#filterSubfamily','Toutes les sous-familles',optionRows('subfamily'),state.filters.subfamily);
    setOptions('#filterSubsubfamily','Toutes les sous-sous-familles',optionRows('subsubfamily'),state.filters.subsubfamily);
    setOptions('#filterUb','Toutes les UB',optionRows('ub'),state.filters.ub);
    const products=(state.data?.products||[]).map(productWithCatalog).map(p=>[p.key,p.label||p.key]).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'fr'));
    setOptions('#filterProduct','Tous les articles',products,state.filters.product);
    $$('#hierarchyTabs [data-level]').forEach(btn=>btn.classList.toggle('active',btn.dataset.level===state.level));
    if($('#performanceLevel'))$('#performanceLevel').value=state.level;
    const currentSkus=new Set((state.data?.products||[]).map(x=>String(x.key||''))),currentCatalog=[...state.catalog.values()].filter(x=>currentSkus.has(String(x.productNumber||''))),total=state.data?.products?.length||0,resolved=currentCatalog.filter(x=>x.productName).length,hier=currentCatalog.filter(x=>x.hierarchyStatus==='RESOLVED').length,cost=currentCatalog.filter(x=>x.currentCostStatus==='READY').length;
    if($('#catalogCoverage'))$('#catalogCoverage').textContent=state.catalogLoading?`Enrichissement articles en cours · ${resolved}/${total} libellés chargés`:`Libellés ${resolved}/${Math.min(total,650)} · hiérarchie ${hier} · coûts courants ${cost}. Les marges précédées de ~ sont estimatives à coût courant, pas une marge comptable historique.`
  }
  function renderPerformance(refreshFilters=true){
    const api=core(),rows=performanceRows(),body=$('#performanceBody');if(!body)return;if(refreshFilters)renderHierarchyFilters();
    const salesValues=rows.map(x=>safe(x.sales)).filter(v=>v!=null).sort((a,b)=>a-b),median=salesValues.length?salesValues[Math.floor(salesValues.length/2)]:0;
    const stars=rows.filter(x=>Number(x.sales||0)>=median&&Number(x.deltaSales??x.delta??0)>=0).length,declining=rows.filter(x=>Number(x.sales||0)>=median&&Number(x.deltaSales??x.delta??0)<0).length,potential=rows.filter(x=>Number(x.sales||0)<median&&Number(x.deltaSales??x.delta??0)>0).length,weak=rows.filter(x=>Number(x.sales||0)<median&&Number(x.deltaSales??x.delta??0)<=0).length;
    $('#performanceQuadrants').innerHTML=[['Stars',stars,'Fort poids + dynamique positive','star'],['À défendre',declining,'Fort poids + baisse','risk'],['Potentiel',potential,'Faible poids + croissance','potential'],['À challenger',weak,'Faible poids + faible dynamique','']].map(([l,v,s,cls])=>`<div class="quadrant-card ${cls}"><small>${l}</small><strong>${api.number(v)}</strong><span>${s}</span></div>`).join('');
    if(!rows.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucune donnée sur ce niveau / filtre.</div></td></tr>';return}
    body.innerHTML=rows.slice(0,500).map(r=>{const delta=r.deltaSales??r.delta??null,marginPrefix=r.marginEstimated?'~ ':'';return`<tr><td><span class="rank-chip">${r.displayRank}</span></td><td><div class="element-cell"><strong>${api.escapeHtml(r.label||r.key)}</strong><span>${api.escapeHtml(r.productCode||r.key||'')}</span></div></td><td>${api.money(r.sales,true)}</td><td>${signed(api,delta,'money')}</td><td>${api.percent(r.sharePct)}</td><td>${quantityBreakdown(r,api)}</td><td>${r.marginValue==null?'<span class="metric-na">N/A</span>':marginPrefix+api.money(r.marginValue,true)}</td><td>${r.marginRate==null?'<span class="metric-na">N/A</span>':marginPrefix+api.percent(r.marginRate)}</td><td>${r.previousRank?'#'+r.previousRank:'—'}</td><td>${r.rankDelta==null?'—':(r.rankDelta>0?'▲ +'+r.rankDelta:r.rankDelta<0?'▼ '+Math.abs(r.rankDelta):'▬')}</td></tr>`}).join('')
  }

  function clientPricePreferences(customers=[]){
    const groups=new Map(),tierBySku=new Map();
    for(const raw of state.data?.products||[]){
      const p=productWithCatalog(raw),units=Math.abs(Number(p.units||0)),sales=Number(p.sales||0),unit=normalizeQtyUnit(p.quantityUnit);
      const family=p.hierarchy?.family?.id||p.hierarchy?.rayon?.id||null;
      if(!family||!unit||unit==='INCONNUE'||!units||!Number.isFinite(sales)||sales<=0)continue;
      const price=sales/units,key=family+'|'+unit;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({sku:p.key,price})
    }
    for(const rows of groups.values()){
      const sorted=[...rows].sort((a,b)=>a.price-b.price),n=sorted.length;
      if(!n)continue;
      const q1=sorted[Math.floor((n-1)*.33)]?.price,q2=sorted[Math.floor((n-1)*.67)]?.price;
      for(const r of sorted)tierBySku.set(r.sku,n<3?'CORE':r.price<=q1?'VALUE':r.price>=q2?'PREMIUM':'CORE')
    }
    const byCustomer=new Map(),counts={VALUE:0,CORE:0,PREMIUM:0,UNKNOWN:0};
    for(const customer of customers){
      const mix={VALUE:0,CORE:0,PREMIUM:0};let known=0;
      for(const p of customer.topProducts||[]){const tier=tierBySku.get(p.productNumber);if(!tier)continue;const w=Math.max(0,Number(p.sales||0));mix[tier]+=w;known+=w}
      const pref=known?Object.entries(mix).sort((a,b)=>b[1]-a[1])[0][0]:'UNKNOWN';byCustomer.set(customer.customerAccount,pref);counts[pref]=(counts[pref]||0)+1
    }
    const total=customers.length||1,rows=Object.entries(counts).map(([preference,count])=>({preference,count,sharePct:count/total*100}));
    return{byCustomer,rows,coveragePct:customers.length?(customers.length-(counts.UNKNOWN||0))/customers.length*100:null}
  }

  function renderCrm(){
    const api=core(),crm=state.data?.crm||{},customers=crm.customers||[],k=$('#crmKpis');if(!k)return;
    const totalSales=customers.reduce((s,x)=>s+Number(x.sales||0),0),avg=customers.length?totalSales/customers.length:null,top10=totalSales?customers.slice(0,10).reduce((s,x)=>s+Number(x.sales||0),0)/totalSales*100:null,top20=totalSales?customers.slice(0,20).reduce((s,x)=>s+Number(x.sales||0),0)/totalSales*100:null,ba=crm.basketAnalysis||{};
    k.innerHTML=[
      ['Clients identifiés',api.number(crm.identifiedCustomers),'comptes custAccount distincts ayant acheté sur la période'],
      ['CA identifié',api.money(crm.identifiedSales,true),'CA rattaché à un client connu'],
      ['Clients revenus',api.percent(crm.repeatRate),'clients avec ≥ 2 tickets distincts sur la période'],
      ['Visites / client',api.number(crm.averageVisitsPerCustomer,1),'nombre moyen de tickets distincts par client identifié'],
      ['Réf. / panier',api.number(ba.averageDistinctProducts,1),'références distinctes par panier identifié'],
      ['Top 10 clients',api.percent(top10),'part du CA identifié portée par les 10 premiers clients affichés']
    ].map(([l,v,s])=>`<div class="crm-kpi"><small>${l}</small><strong>${v}</strong><span>${s}</span></div>`).join('');

    const prefLabels={VALUE:'Entrée de gamme',CORE:'Cœur de gamme',PREMIUM:'Premium',UNKNOWN:'Non classé'},derivedPrefs=clientPricePreferences(customers),prefs=(derivedPrefs.rows||[]).some(x=>x.preference!=='UNKNOWN'&&x.count>0)?derivedPrefs.rows:(crm.pricePreferences||[]);
    const prefPanel=$('#crmPricePreference');
    if(prefPanel){
      const visible=prefs.filter(x=>x.preference!=='UNKNOWN');
      prefPanel.innerHTML=visible.length?visible.map(x=>`<div class="price-pref-row"><div><strong>${prefLabels[x.preference]||x.preference}</strong><span>${api.number(x.count)} client(s)</span></div><div class="price-pref-track"><span style="width:${Math.min(100,Number(x.sharePct||0))}%"></span></div><b>${api.percent(x.sharePct)}</b></div>`).join(''):'<div class="table-loading">Position prix en cours de calcul.</div>'
    }
    const insightPanel=$('#crmInsights');
    if(insightPanel){
      const dominantPersona=[...(crm.personas||[])].sort((a,b)=>Number(b.count)-Number(a.count))[0],dominantPref=[...prefs].filter(x=>x.preference!=='UNKNOWN').sort((a,b)=>Number(b.count)-Number(a.count))[0],insights=[];
      if(dominantPersona)insights.push({title:'Profil dominant',text:`${api.number(dominantPersona.count)} clients sont « ${dominantPersona.persona.replaceAll('_',' ').toLowerCase()} » (${api.percent(dominantPersona.sharePct)}).`});
      if(crm.repeatRate!=null)insights.push({title:crm.repeatRate<30?'Fréquence à construire':'Base qui revient',text:`${api.percent(crm.repeatRate)} des clients identifiés reviennent au moins une fois sur la période.`});
      if(dominantPref)insights.push({title:'Sensibilité prix',text:`Le positionnement dominant observé est ${prefLabels[dominantPref.preference]?.toLowerCase()||dominantPref.preference} (${api.percent(dominantPref.sharePct)} des clients analysés${derivedPrefs.coveragePct==null?'':', couverture '+api.percent(derivedPrefs.coveragePct)}).`});
      if(ba.singleItemBasketRate!=null)insights.push({title:ba.singleItemBasketRate>45?'Opportunité cross-sell':'Panier déjà diversifié',text:`${api.percent(ba.singleItemBasketRate)} des paniers identifiés sont mono-produit.`});
      if(top10!=null)insights.push({title:top10>30?'CA client concentré':'CA client diffus',text:`Les 10 premiers clients pèsent ${api.percent(top10)} du CA identifié.`});
      insightPanel.innerHTML=insights.slice(0,5).map(x=>`<div class="crm-insight"><strong>${api.escapeHtml(x.title)}</strong><span>${api.escapeHtml(x.text)}</span></div>`).join('')
    }

    const segmentLabels={HIGH_VALUE_FREQUENT:'Forte valeur & fréquent',HIGH_VALUE:'Forte valeur',FREQUENT:'Fréquent',REPEAT:'Client revenu',SINGLE_VISIT:'1 visite'},segmentMap=new Map((crm.segments||[]).map(x=>[x.segment,x]));
    $('#crmSegments').innerHTML=Object.entries(segmentLabels).map(([key,label])=>{const x=segmentMap.get(key)||{};return`<div class="segment-card"><small>${label}</small><strong>${api.number(x.count||0)}</strong><span>${x.sharePct==null?'N/A':api.percent(x.sharePct)} des clients identifiés</span></div>`}).join('');

    const personaLabels={VIP_REGULAR:'VIP régulier',BIG_BASKET_OCCASIONAL:'Gros panier occasionnel',EXPLORER:'Explorateur',ROUTINE_REGULAR:'Routine / régulier',REPEAT_TO_GROW:'Client revenu à développer',ONE_SHOT:'Visite unique'};
    const personaNotes={VIP_REGULAR:'Fréquent + forte valeur',BIG_BASKET_OCCASIONAL:'Peu de visites, panier élevé',EXPLORER:'Large variété de produits',ROUTINE_REGULAR:'Fréquent, achats récurrents',REPEAT_TO_GROW:'Déjà revenu, potentiel à développer',ONE_SHOT:'Une seule visite observée'};
    const personaMap=new Map((crm.personas||[]).map(x=>[x.persona,x]));
    $('#crmPersonas').innerHTML=Object.keys(personaLabels).map(key=>{const x=personaMap.get(key)||{};return`<div class="persona-card"><small>${personaLabels[key]}</small><strong>${api.number(x.count||0)}</strong><span>${x.sharePct==null?'':api.percent(x.sharePct)+' · '}${personaNotes[key]}</span></div>`}).join('');

    $('#crmBasketDna').innerHTML=`<div class="basket-dna-grid">
      <div><small>Paniers identifiés</small><strong>${api.number(ba.identifiedBaskets)}</strong></div>
      <div><small>Réf. distinctes / panier</small><strong>${api.number(ba.averageDistinctProducts,1)}</strong></div>
      <div><small>Quantités</small><strong>Séparées par unité</strong></div>
      <div><small>Paniers mono-produit</small><strong>${api.percent(ba.singleItemBasketRate)}</strong></div>
    </div>
    <div class="basket-top-products">${(ba.topProducts||[]).slice(0,6).map((p,i)=>`<div><span>#${i+1} ${api.escapeHtml(productLabel(p.productNumber,p.productNumber))}</span><strong>${api.money(p.sales,true)}</strong></div>`).join('')||'<div class="table-loading">Données panier en cours de consolidation.</div>'}</div>`;

    const pairs=(ba.topProductPairs||[]).slice(0,8);
    $('#crmAffinities').innerHTML=pairs.length?pairs.map(p=>`<div class="affinity-row"><div><strong>${api.escapeHtml(productLabel(p.productA,p.productA))}</strong><span>+</span><strong>${api.escapeHtml(productLabel(p.productB,p.productB))}</strong></div><small>${api.number(p.tickets)} panier(s) · ${api.percent(p.sharePct)}</small></div>`).join(''):'<div class="table-loading">Pas encore assez de paniers multi-produits pour calculer les affinités.</div>';

    const catPanel=$('#crmCategoryPreferences'),visitPanel=$('#crmVisitPatterns');
    if(catPanel){
      const categories=new Map();
      for(const customer of customers)for(const p of customer.topProducts||[]){
        const ref=catalogItem(p.productNumber),node=ref?.hierarchy?.department||ref?.hierarchy?.rayon;if(!node?.label)continue;
        const key=node.id||node.label,cur=categories.get(key)||{label:node.label,sales:0};cur.sales+=Number(p.sales||0);categories.set(key,cur)
      }
      const catRows=[...categories.values()].sort((a,b)=>b.sales-a.sales).slice(0,7),catTotal=catRows.reduce((s,x)=>s+x.sales,0);
      catPanel.innerHTML=catRows.length?catRows.map((x,i)=>`<div class="category-pref-row"><span>#${i+1} ${api.escapeHtml(x.label)}</span><div><i style="width:${catTotal?Math.max(3,x.sales/catTotal*100):0}%"></i></div><strong>${api.money(x.sales,true)}</strong></div>`).join(''):'<div class="table-loading">Les univers apparaîtront dès que les libellés et la hiérarchie article sont chargés.</div>'
    }
    if(visitPanel){
      const weekdays=new Map(),dayparts=new Map();
      for(const customer of customers){
        if(customer.favouriteWeekday)weekdays.set(customer.favouriteWeekday,(weekdays.get(customer.favouriteWeekday)||0)+1);
        const h=Number(customer.favouriteHour);if(Number.isFinite(h)){const key=h<11?'Matin':h<14?'Midi':h<18?'Après-midi':'Soir';dayparts.set(key,(dayparts.get(key)||0)+1)}
      }
      const topDays=[...weekdays.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4),topParts=[...dayparts.entries()].sort((a,b)=>b[1]-a[1]);
      visitPanel.innerHTML=`<div class="visit-pattern-block"><small>Jours dominants</small>${topDays.map(([k,v])=>`<div><strong>${api.escapeHtml(k)}</strong><span>${api.number(v)} client(s)</span></div>`).join('')||'<span>N/A</span>'}</div><div class="visit-pattern-block"><small>Moments dominants</small>${topParts.map(([k,v])=>`<div><strong>${api.escapeHtml(k)}</strong><span>${api.number(v)} client(s)</span></div>`).join('')||'<span>N/A</span>'}</div>`
    }

    const cohorts=crm.cohorts||[];
    $('#crmCohorts').innerHTML=cohorts.length?cohorts.slice(-8).reverse().map(x=>`<div class="cohort-row"><div><strong>Semaine du ${api.escapeHtml(x.cohort)}</strong><span>${api.number(x.customers)} client(s)</span></div><div><strong>${api.percent(x.repeatRate)}</strong><span>ont effectué ≥ 2 visites observées</span></div><div><strong>${api.money(x.averageSpend)}</strong><span>CA / client</span></div></div>`).join(''):'<div class="table-loading">Cohortes indisponibles.</div>';

    $('#crmConcentration').innerHTML=`<div class="concentration-hero">${api.percent(top10)}</div><div class="concentration-caption">du CA identifié est réalisé par les 10 premiers clients de la période.</div><div class="concentration-bars"><div class="concentration-row"><span>Top 10</span><div class="concentration-track"><span style="width:${Math.min(top10||0,100)}%"></span></div><strong>${api.percent(top10)}</strong></div><div class="concentration-row"><span>Top 20</span><div class="concentration-track"><span style="width:${Math.min(top20||0,100)}%"></span></div><strong>${api.percent(top20)}</strong></div></div>`;

    const body=$('#crmBody');if(!customers.length){body.innerHTML='<tr><td colspan="12"><div class="table-loading">Aucun client identifié sur la période.</div></td></tr>';return}
    const periodEnd=sectionState()?.periodEnd;
    body.innerHTML=customers.slice(0,500).map(x=>{const recency=x.lastDate&&periodEnd?Math.max(0,Math.round((Date.parse(periodEnd+'T12:00:00Z')-Date.parse(x.lastDate+'T12:00:00Z'))/86400000)):null,habit=[x.favouriteWeekday,x.favouriteHour!=null?`${String(x.favouriteHour).padStart(2,'0')}h`:null].filter(Boolean).join(' · '),top=(x.topProducts||[]).slice(0,3).map(p=>productLabel(p.productNumber,p.productNumber)).join(', ');return`<tr>
      <td><div class="element-cell"><strong>${api.escapeHtml(x.customerAccount)}</strong><span>${api.percent(x.shareIdentifiedSalesPct)} du CA identifié</span></div></td>
      <td><span class="persona-pill ${x.persona||''}">${api.escapeHtml(personaLabels[x.persona]||x.persona||'N/A')}</span></td>
      <td><span class="price-pill ${derivedPrefs.byCustomer.get(x.customerAccount)||x.pricePreference||'UNKNOWN'}">${api.escapeHtml(prefLabels[derivedPrefs.byCustomer.get(x.customerAccount)||x.pricePreference]||'Non classé')}</span></td>
      <td><span class="segment-pill ${x.segment}">${api.escapeHtml(segmentLabels[x.segment]||x.segment)}</span></td>
      <td>${api.money(x.sales,true)}</td><td>${api.number(x.tickets)}</td><td>${api.money(x.averageBasket)}</td><td>${api.number(x.distinctProducts)}</td><td>${api.number(x.activeDays)}</td>
      <td>${api.escapeHtml(x.lastDate||'N/A')}${recency!=null?` · ${recency}j`:''}</td><td>${api.escapeHtml(habit||'N/A')}</td><td>${api.escapeHtml(top||'N/A')}</td></tr>`}).join('')
  }

  function bind(){
    const setLevel=level=>{state.level=level||'product';if(state.metric==='units'&&state.level!=='product'){state.metric='sales';if($('#performanceMetric'))$('#performanceMetric').value='sales'}renderPerformance()};
    $('#performanceLevel')?.addEventListener('change',e=>setLevel(e.target.value));
    $$('#hierarchyTabs [data-level]').forEach(btn=>btn.addEventListener('click',()=>setLevel(btn.dataset.level)));
    const filterMap={filterDepartment:'department',filterRayon:'rayon',filterFamily:'family',filterSubfamily:'subfamily',filterSubsubfamily:'subsubfamily',filterUb:'ub',filterProduct:'product'};
    for(const [id,key] of Object.entries(filterMap))$('#'+id)?.addEventListener('change',e=>{state.filters[key]=e.target.value||'';renderPerformance()});
    $('#clearProductFilters')?.addEventListener('click',()=>{state.filters={department:'',rayon:'',family:'',subfamily:'',subsubfamily:'',ub:'',product:''};state.search='';if($('#performanceSearch'))$('#performanceSearch').value='';renderPerformance()});
    $('#performanceMetric')?.addEventListener('change',e=>{state.metric=e.target.value;if(state.metric==='units'&&state.level!=='product'){state.level='product';if($('#performanceLevel'))$('#performanceLevel').value='product'}renderPerformance()});
    $('#performanceSearch')?.addEventListener('input',e=>{state.search=e.target.value||'';renderPerformance()});
    document.addEventListener('retail-intelligence:period',e=>{if(sectionNeedsDecision())load(!!e.detail?.force)});
    document.addEventListener('retail-intelligence:data',()=>{if(sectionNeedsDecision())load(false)});
    document.addEventListener('retail-intelligence:section',()=>{if(sectionNeedsDecision())load(false);if(state.data&&sectionNeedsCatalog())maybeLoadCatalog(false)});
    const s=sectionState();if(s?.stores?.length&&sectionNeedsDecision(s))load(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();