(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;
  const state={data:null,key:null,loading:false,level:'product',metric:'sales',search:'',catalog:new Map(),catalogKey:null,catalogLoading:false,filters:{department:'',rayon:'',family:'',subfamily:'',subsubfamily:'',ub:'',product:''}};

  const safe=v=>v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v);
  const signed=(api,v,kind='percent')=>{
    if(v==null)return '<span class="metric-na">N/A</span>';
    const cls=Number(v)>0?'metric-positive':Number(v)<0?'metric-negative':'';
    const sign=Number(v)>0?'+':'';
    const label=kind==='money'?api.money(v,true):kind==='number'?api.number(v,1):api.percent(v);
    return `<span class="${cls}">${sign}${label}</span>`;
  };
  const sectionState=()=>core()?.getState?.()||null;

  function queryKey(s){return [s.tenant,s.selectedStore,s.periodStart,s.periodEnd,s.compareStart,s.compareEnd].join('|')}
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
      const cur=map.get(key)||{key,label:row.label||key,sales:0,previousSales:0,units:0,marginValue:0,previousMarginValue:0,marginKnown:true,previousMarginKnown:true};
      cur.sales+=Number(row.sales||0);cur.previousSales+=Number(row[previousField]??row.previous??0);cur.units+=Number(row.units||0);
      if(row.marginValue===null||row.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=Number(row.marginValue||0);
      if(row.previousMarginValue===null||row.previousMarginValue===undefined)cur.previousMarginKnown=false;else cur.previousMarginValue+=Number(row.previousMarginValue||0);
      if((!cur.label||cur.label===key)&&row.label)cur.label=row.label;
      map.set(key,cur)
    }
    const rows=[...map.values()],total=rows.reduce((s,x)=>s+x.sales,0),prevSorted=[...rows].sort((a,b)=>b.previousSales-a.previousSales),prevRank=new Map(prevSorted.map((x,i)=>[x.key,i+1]));
    return rows.sort((a,b)=>b.sales-a.sales).map((x,i)=>{
      const marginValue=x.marginKnown?x.marginValue:null,previousMarginValue=x.previousMarginKnown?x.previousMarginValue:null;
      return{key:x.key,label:x.label,sales:x.sales,previousSales:x.previousSales,previous:x.previousSales,deltaSales:x.sales-x.previousSales,delta:x.sales-x.previousSales,changePct:pct(x.sales,x.previousSales),sharePct:total?x.sales/total*100:null,units:x.units,marginValue,marginRate:marginValue!=null&&x.sales?marginValue/x.sales*100:null,previousMarginValue,deltaMargin:marginValue!=null&&previousMarginValue!=null?marginValue-previousMarginValue:null,rank:i+1,previousRank:prevRank.get(x.key)||null,deltaRank:prevRank.has(x.key)?prevRank.get(x.key)-(i+1):null}
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
      const ba=part.crm?.basketAnalysis||{};const n=Number(ba.identifiedBaskets||0);basketCount+=n;if(ba.averageUnits!=null)basketUnits+=Number(ba.averageUnits)*n;if(ba.averageDistinctProducts!=null)basketDistinct+=Number(ba.averageDistinctProducts)*n;if(ba.singleItemBasketRate!=null)singleWeighted+=Number(ba.singleItemBasketRate)*n;
      for(const p of ba.topProducts||[])basketProducts.set(p.productNumber,(basketProducts.get(p.productNumber)||0)+Number(p.sales||0));
      for(const p of ba.topProductPairs||[]){const a=String(p.productA||''),b=String(p.productB||''),key=a<b?`${a}|${b}`:`${b}|${a}`,cur=pairMap.get(key)||{productA:a<b?a:b,productB:a<b?b:a,tickets:0};cur.tickets+=Number(p.tickets||0);pairMap.set(key,cur)}
      for(const x of part.crm?.customers||[]){
        const key=x.customerAccount;if(!key)continue;const cur=map.get(key)||{customerAccount:key,sales:0,units:0,tickets:0,activeDays:0,firstDate:null,lastDate:null,storeCount:0,products:new Map(),weekdays:new Map(),hours:new Map()};
        cur.sales+=Number(x.sales||0);cur.units+=Number(x.units||0);cur.tickets+=Number(x.tickets||0);cur.activeDays+=Number(x.activeDays||0);cur.storeCount=Math.max(cur.storeCount,Number(x.storeCount||0));
        if(x.firstDate&&(!cur.firstDate||x.firstDate<cur.firstDate))cur.firstDate=x.firstDate;if(x.lastDate&&(!cur.lastDate||x.lastDate>cur.lastDate))cur.lastDate=x.lastDate;
        if(x.favouriteWeekday)cur.weekdays.set(x.favouriteWeekday,(cur.weekdays.get(x.favouriteWeekday)||0)+Math.max(1,Number(x.activeDays||1)));
        if(x.favouriteHour!=null)cur.hours.set(String(x.favouriteHour),(cur.hours.get(String(x.favouriteHour))||0)+Math.max(1,Number(x.tickets||1)));
        for(const p of x.topProducts||[])cur.products.set(p.productNumber,(cur.products.get(p.productNumber)||0)+Number(p.sales||0));map.set(key,cur)
      }
    }
    const fav=m=>{let k=null,v=-1;for(const [a,b] of m)if(b>v){k=a;v=b}return k};
    const rows=[...map.values()].sort((a,b)=>b.sales-a.sales),total=rows.reduce((s,x)=>s+x.sales,0),threshold=rows.length?rows[Math.max(0,Math.ceil(rows.length*.2)-1)]?.sales||0:0;
    const baskets=rows.map(x=>x.tickets?x.sales/x.tickets:0).sort((a,b)=>a-b),breadths=rows.map(x=>x.products.size).sort((a,b)=>a-b),p80=a=>a.length?a[Math.max(0,Math.ceil(a.length*.8)-1)]:0,highBasket=p80(baskets),broad=p80(breadths);
    const customers=rows.map(x=>{let persona='REPEAT_TO_GROW';const avg=x.tickets?x.sales/x.tickets:null;if(x.tickets>=4&&x.sales>=threshold)persona='VIP_REGULAR';else if(x.tickets<=2&&avg>=highBasket)persona='BIG_BASKET_OCCASIONAL';else if(x.products.size>=broad&&x.tickets>=2)persona='EXPLORER';else if(x.tickets>=4)persona='ROUTINE_REGULAR';else if(x.tickets<=1)persona='ONE_SHOT';return{customerAccount:x.customerAccount,sales:x.sales,units:x.units,tickets:x.tickets,activeDays:x.activeDays,averageBasket:avg,averageUnitsPerBasket:x.tickets?x.units/x.tickets:null,firstDate:x.firstDate,lastDate:x.lastDate,storeCount:x.storeCount,distinctProducts:x.products.size,favouriteWeekday:fav(x.weekdays),favouriteHour:fav(x.hours),segment:x.tickets>=4&&x.sales>=threshold?'HIGH_VALUE_FREQUENT':x.sales>=threshold?'HIGH_VALUE':x.tickets>=4?'FREQUENT':x.tickets>=2?'REPEAT':'SINGLE_VISIT',persona,shareIdentifiedSalesPct:total?x.sales/total*100:null,topProducts:[...x.products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([productNumber,sales])=>({productNumber,sales}))}});
    const cohortMap=new Map();for(const x of customers){if(!x.firstDate)continue;const d=new Date(x.firstDate+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);const k=d.toISOString().slice(0,10),cur=cohortMap.get(k)||{cohort:k,customers:0,sales:0,repeat:0,tickets:0};cur.customers++;cur.sales+=x.sales;cur.tickets+=x.tickets;if(x.tickets>=2)cur.repeat++;cohortMap.set(k,cur)}
    const personas=Object.entries(customers.reduce((a,x)=>(a[x.persona]=(a[x.persona]||0)+1,a),{})).map(([persona,count])=>({persona,count,sharePct:customers.length?count/customers.length*100:null})).sort((a,b)=>b.count-a.count);
    const cohorts=[...cohortMap.values()].sort((a,b)=>a.cohort.localeCompare(b.cohort)).map(x=>({...x,repeatRate:x.customers?x.repeat/x.customers*100:null,averageSpend:x.customers?x.sales/x.customers:null,averageVisits:x.customers?x.tickets/x.customers:null}));
    const basketAnalysis={identifiedBaskets:basketCount,averageUnits:basketCount?basketUnits/basketCount:null,averageDistinctProducts:basketCount?basketDistinct/basketCount:null,singleItemBasketRate:basketCount?singleWeighted/basketCount:null,topProducts:[...basketProducts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([productNumber,sales])=>({productNumber,sales})),topProductPairs:[...pairMap.values()].sort((a,b)=>b.tickets-a.tickets).slice(0,40).map(x=>({...x,sharePct:basketCount?x.tickets/basketCount*100:null}))};
    return{scope:'SELECTED_PERIOD_ONLY',identifiedCustomers:customers.length,identifiedSales:total,repeatCustomers:customers.filter(x=>x.tickets>=2).length,frequentCustomers:customers.filter(x=>x.tickets>=4).length,repeatRate:customers.length?customers.filter(x=>x.tickets>=2).length/customers.length*100:null,personas,cohorts,basketAnalysis,customers:customers.slice(0,500)}
  }
  function mergeDecisionParts(parts,period,comparison){
    const current=sumSnapshot(parts,'current'),previous=sumSnapshot(parts,'previous'),products=mergeRankedRows(parts,p=>p.products||[]),stores=mergeStores(parts),hierarchy={};
    for(const level of ['department','rayon','family','subfamily','subsubfamily','ub'])hierarchy[level]=mergeRankedRows(parts,p=>p.hierarchy?.[level]||[],'previous');
    const trafficEffect=previous.averageBasket!=null?(current.tickets-previous.tickets)*previous.averageBasket:null,basketEffect=previous.averageBasket!=null&&current.averageBasket!=null?current.tickets*(current.averageBasket-previous.averageBasket):null;
    const marginStatuses=[...new Set(parts.map(p=>p.margin?.status).filter(Boolean))],marginStatus=marginStatuses.length===1?marginStatuses[0]:marginStatuses.includes('UNVALIDATED')?'UNVALIDATED':marginStatuses.includes('UNAVAILABLE')?'UNAVAILABLE':'MIXED';
    const crm=mergeCrm(parts);
    return{status:'READY',period,comparison,coverage:{storesRequested:parts[0]?.coverage?.storesRequested||0,currentStoresReady:Math.min(...parts.map(p=>p.coverage?.currentStoresReady??0)),comparisonStoresReady:Math.min(...parts.map(p=>p.coverage?.comparisonStoresReady??0))},summary:{current,previous,salesChangePct:pct(current.sales,previous.sales),ticketsChangePct:pct(current.tickets,previous.tickets),basketChangePct:pct(current.averageBasket,previous.averageBasket),marginChangePct:previous.marginValue?pct(current.marginValue,previous.marginValue):null,marginRateDelta:current.marginRate!=null&&previous.marginRate!=null?current.marginRate-previous.marginRate:null,drivers:{trafficEffect,basketEffect,totalDelta:current.sales-previous.sales,reconciliationGap:trafficEffect!=null&&basketEffect!=null?(current.sales-previous.sales)-trafficEffect-basketEffect:null}},margin:{status:marginStatus,available:marginStatus==='VALIDATED',message:marginStatus==='VALIDATED'?'Coût transactionnel validé.':marginStatus==='UNVALIDATED'?'Champ coût détecté mais non validé comme coût historique transactionnel.':'Coût transactionnel indisponible.'},daily:{current:parts.flatMap(p=>p.daily?.current||[]).sort((a,b)=>a.date.localeCompare(b.date)),previous:parts.flatMap(p=>p.daily?.previous||[]).sort((a,b)=>a.date.localeCompare(b.date))},stores,products,hierarchy,contributors:{negativeProducts:[...products].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,20),positiveProducts:[...products].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,20),negativeStores:[...stores].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,10),positiveStores:[...stores].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,10)},crm,generatedAt:new Date().toISOString()}
  }
  function setProgress(done,total){
    const el=$('#executiveSalesValue');if(el)el.textContent=done>=total?'Finalisation…':`Analyse ${done}/${total}`;
    const foot=$('#executiveComparisonValue');if(foot)foot.textContent='Lecture Dynamics par blocs';
  }
  async function fetchDecisionSlice(api,s,cur,cmp,force=false){
    const q=new URLSearchParams({storeId:s.selectedStore||'ALL',start:cur.start,end:cur.end,compareStart:cmp.start,compareEnd:cmp.end});
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
    const curDays=rangeDays(s.periodStart,s.periodEnd),cmpDays=rangeDays(s.compareStart,s.compareEnd),blocks=Math.max(1,Math.min(Math.min(curDays,cmpDays),Math.ceil(Math.max(curDays,cmpDays)/7)));
    const currentParts=splitRange(s.periodStart,s.periodEnd,blocks),compareParts=splitRange(s.compareStart,s.compareEnd,blocks),results=new Array(blocks);let next=0,done=0;
    const worker=async()=>{while(true){const i=next++;if(i>=blocks)return;results[i]=await fetchDecisionSlice(api,s,currentParts[i],compareParts[i],force);done++;setProgress(done,blocks)}};
    await Promise.all(Array.from({length:Math.min(2,blocks)},worker));
    return mergeDecisionParts(results,{startDate:s.periodStart,endDate:s.periodEnd,days:curDays},{startDate:s.compareStart,endDate:s.compareEnd,days:cmpDays})
  }
  function catalogItem(sku){return state.catalog.get(String(sku||''))||null}
  function productLabel(sku,fallback=''){const ref=catalogItem(sku);return ref?.productName||fallback||sku}
  function productSubLabel(sku){const ref=catalogItem(sku);return ref?.productName?sku:''}
  function hierarchyNode(sku,level){return catalogItem(sku)?.hierarchy?.[level]||null}
  function estimateMargin(row){
    if(row?.marginValue!=null)return{value:Number(row.marginValue),rate:row.marginRate,estimated:false};
    const ref=catalogItem(row?.key),unitCost=Number(ref?.currentUnitCost),units=Number(row?.units);
    if(!Number.isFinite(unitCost)||!Number.isFinite(units)||!Number.isFinite(Number(row?.sales)))return{value:null,rate:null,estimated:false};
    const value=Number(row.sales)-Math.abs(units)*unitCost;
    return{value,rate:Number(row.sales)?value/Number(row.sales)*100:null,estimated:true}
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
    const key=queryKey(s);if(!force&&state.catalogKey===key&&state.catalog.size)return;
    state.catalogLoading=true;state.catalog=new Map();
    const skus=catalogSkuList(),batches=[];for(let i=0;i<skus.length;i+=50)batches.push(skus.slice(i,i+50));
    let cursor=0;
    const worker=async()=>{while(cursor<batches.length){const batch=batches[cursor++];try{const q=new URLSearchParams({products:batch.join(',')}),data=await api.api('/api/analytics/catalog?'+q,{noRetry:true});for(const item of data.items||[])state.catalog.set(item.productNumber,item);renderPerformance();renderCrm();renderContributors('negative');renderContributors('positive')}catch{}}};
    await Promise.all(Array.from({length:Math.min(2,batches.length)},worker));
    state.catalogKey=key;state.catalogLoading=false;renderPerformance();renderCrm()
  }

  function sectionNeedsDecision(s=sectionState()){return ['overview','sales','network','categories','crm'].includes(s?.section)}
  async function load(force=false){
    const api=core(),s=sectionState(); if(!api||!s||!s.stores?.length||state.loading||!sectionNeedsDecision(s))return;
    const key=queryKey(s); if(!force&&state.key===key&&state.data){render();return}
    state.loading=true; setLoading(); setProgress(0,Math.max(1,Math.ceil(Math.max(rangeDays(s.periodStart,s.periodEnd),rangeDays(s.compareStart,s.compareEnd))/7)));
    try{
      state.data=await loadDecisionChunked(api,s,force); state.key=key; render();
      window.RETAIL_DECISION_INTELLIGENCE={getData:()=>state.data,reload:()=>load(true)};
      loadCatalog(force).catch(()=>{});
    }catch(error){renderError(error)}
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

  function render(){if(!state.data)return;renderExecutive();renderSales();renderBenchmark();renderPerformance();renderCrm()}

  function renderExecutive(){
    const api=core(),d=state.data,s=d.summary||{},cur=s.current||{},prev=s.previous||{},app=sectionState()||{};
    const set=(id,value,html=false)=>{const el=$(id);if(!el)return;if(html)el.innerHTML=value;else el.textContent=value};
    set('#executiveSalesValue',api.money(cur.sales,true));
    set('#executiveSalesDelta',signed(api,s.salesChangePct),true);
    set('#executiveComparisonValue',api.money(prev.sales,true));
    const gap=cur.sales!=null&&prev.sales!=null?cur.sales-prev.sales:null;
    set('#executiveSalesGap',gap==null?'N/A':`${gap>0?'+':''}${api.money(gap,true)}`);
    set('#executiveScopeValue',app.selectedStore==='ALL'?`${d.coverage?.currentStoresReady||0}/${d.coverage?.storesRequested||0} magasins`:app.stores?.find(x=>x.id===app.selectedStore)?.name||'Magasin');
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
    const badge=$('#marginStatusBadge');
    if(badge){badge.textContent=d.margin?.available?'Marge · coût validé':d.margin?.status==='UNVALIDATED'?'Marge · coût à valider':'Marge · indisponible';badge.className='margin-status '+(d.margin?.available?'valid':'warning')}
    $('#decisionCoverage').textContent=`${d.coverage?.currentStoresReady||0}/${d.coverage?.storesRequested||0} magasin(s)`;
    const cards=[
      ['CA',api.money(cur.sales,true),signed(api,s.salesChangePct),'vs période comparée'],
      ['Tickets',api.number(cur.tickets),signed(api,s.ticketsChangePct),'fréquentation'],
      ['Panier moyen',api.money(cur.averageBasket),signed(api,s.basketChangePct),'effet panier'],
      ['Marge DH',api.money(cur.marginValue,true),signed(api,s.marginChangePct),'coût transactionnel validé uniquement'],
      ['Taux de marge',api.percent(cur.marginRate),s.marginRateDelta==null?'<span class="metric-na">N/A</span>':signed(api,s.marginRateDelta),'écart en points'],
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
    host.innerHTML=rows.slice(0,8).map((r,i)=>`<div class="contributor-row"><span class="contributor-rank">${i+1}</span><div class="contributor-name"><strong>${api.escapeHtml(r.label)}</strong><span>${api.escapeHtml(r.key)} · CA ${api.money(r.sales,true)}</span></div><span class="contributor-value ${tone}">${r.deltaSales>0?'+':''}${api.money(r.deltaSales,true)}</span></div>`).join('');
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
    if(!ranked.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucun magasin comparable.</div></td></tr>';return}
    body.innerHTML=ranked.map((r,i)=>`<tr><td><span class="rank-chip">${i+1}</span></td><td><div class="element-cell"><strong>${api.escapeHtml(r.storeName)}</strong><span>${api.escapeHtml(r.storeCode||'')}</span></div></td><td>${api.money(r.sales,true)}</td><td>${signed(api,r.changePct)}</td><td>${avg?api.number(r.sales/avg*100,0)+' idx':'N/A'}</td><td>${api.number(r.tickets)}</td><td>${api.money(r.averageBasket)}</td><td>${api.money(r.marginValue,true)}</td><td>${api.percent(r.marginRate)}</td><td>${api.percent(r.identifiedSalesShare)}</td></tr>`).join('');
  }

  function performanceRows(){
    const d=state.data;if(!d)return[];
    const base=state.level==='product'?(d.products||[]):((d.hierarchy||{})[state.level]||[]);
    const metric=state.metric;
    const previousField=metric==='sales'
      ? (state.level==='product'?'previousSales':'previous')
      : metric==='marginValue'?'previousMarginValue':null;
    const prevSorted=previousField?[...base].filter(x=>safe(x[previousField])!=null).sort((a,b)=>Number(b[previousField]||0)-Number(a[previousField]||0)):[];
    const prevRank=new Map(prevSorted.map((x,i)=>[x.key,i+1]));
    const ranked=[...base].sort((a,b)=>{
      const av=safe(a[metric]),bv=safe(b[metric]);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;return bv-av
    }).map((x,i)=>({...x,displayRank:i+1,previousRank:prevRank.get(x.key)||null,rankDelta:prevRank.has(x.key)?prevRank.get(x.key)-(i+1):null}));
    const q=state.search.trim().toLowerCase();
    return q?ranked.filter(x=>String(x.label||x.key||'').toLowerCase().includes(q)||String(x.key||'').toLowerCase().includes(q)):ranked;
  }

  function renderPerformance(){
    const api=core(),rows=performanceRows(),body=$('#performanceBody');if(!body)return;
    const salesValues=rows.map(x=>safe(x.sales)).filter(v=>v!=null).sort((a,b)=>a-b),median=salesValues.length?salesValues[Math.floor(salesValues.length/2)]:0;
    const stars=rows.filter(x=>Number(x.sales||0)>=median&&Number(x.deltaSales??x.delta??0)>=0).length;
    const declining=rows.filter(x=>Number(x.sales||0)>=median&&Number(x.deltaSales??x.delta??0)<0).length;
    const potential=rows.filter(x=>Number(x.sales||0)<median&&Number(x.deltaSales??x.delta??0)>0).length;
    const weak=rows.filter(x=>Number(x.sales||0)<median&&Number(x.deltaSales??x.delta??0)<=0).length;
    $('#performanceQuadrants').innerHTML=[
      ['Stars',stars,'Fort poids + dynamique positive','star'],
      ['À défendre',declining,'Fort poids + baisse','risk'],
      ['Potentiel',potential,'Faible poids + croissance','potential'],
      ['À challenger',weak,'Faible poids + faible dynamique','']
    ].map(([l,v,s,cls])=>`<div class="quadrant-card ${cls}"><small>${l}</small><strong>${api.number(v)}</strong><span>${s}</span></div>`).join('');
    if(!rows.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucune donnée sur ce niveau.</div></td></tr>';return}
    body.innerHTML=rows.slice(0,500).map(r=>{const delta=r.deltaSales??r.delta??null;return`<tr><td><span class="rank-chip">${r.displayRank}</span></td><td><div class="element-cell"><strong>${api.escapeHtml(r.label||r.key)}</strong><span>${api.escapeHtml(r.key||'')}</span></div></td><td>${api.money(r.sales,true)}</td><td>${signed(api,delta,'money')}</td><td>${api.percent(r.sharePct)}</td><td>${api.number(r.units,1)}</td><td>${api.money(r.marginValue,true)}</td><td>${api.percent(r.marginRate)}</td><td>${r.previousRank?'#'+r.previousRank:'—'}</td><td>${r.rankDelta==null?'—':(r.rankDelta>0?'▲ +'+r.rankDelta:r.rankDelta<0?'▼ '+Math.abs(r.rankDelta):'▬')}</td></tr>`}).join('');
  }

  function renderCrm(){
    const api=core(),crm=state.data?.crm||{},customers=crm.customers||[],k=$('#crmKpis');if(!k)return;
    const totalSales=customers.reduce((s,x)=>s+Number(x.sales||0),0),avg=customers.length?totalSales/customers.length:null;
    const top10=totalSales?customers.slice(0,10).reduce((s,x)=>s+Number(x.sales||0),0)/totalSales*100:null;
    const top20=totalSales?customers.slice(0,20).reduce((s,x)=>s+Number(x.sales||0),0)/totalSales*100:null;
    k.innerHTML=[
      ['Clients identifiés',api.number(crm.identifiedCustomers),'sur la période'],
      ['CA identifié',api.money(crm.identifiedSales,true),'clients disponibles'],
      ['Repeat rate',api.percent(crm.repeatRate),'≥ 2 visites période'],
      ['Clients fréquents',api.number(crm.frequentCustomers),'≥ 4 visites période'],
      ['CA / client',api.money(avg),'moyenne identifiés'],
      ['Top 10 clients',api.percent(top10),'part du CA identifié']
    ].map(([l,v,s])=>`<div class="crm-kpi"><small>${l}</small><strong>${v}</strong><span>${s}</span></div>`).join('');
    const counts={};for(const x of customers)counts[x.segment]=(counts[x.segment]||0)+1;
    const labels={HIGH_VALUE_FREQUENT:'High value & fréquent',HIGH_VALUE:'High value',FREQUENT:'Fréquent',REPEAT:'Repeat',SINGLE_VISIT:'1 visite'};
    $('#crmSegments').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="segment-card"><small>${label}</small><strong>${api.number(counts[key]||0)}</strong><span>${customers.length?api.percent((counts[key]||0)/customers.length*100):'N/A'} des clients</span></div>`).join('');
    $('#crmConcentration').innerHTML=`<div class="concentration-hero">${api.percent(top10)}</div><div class="concentration-caption">du CA identifié est réalisé par les 10 premiers clients de la période.</div><div class="concentration-bars"><div class="concentration-row"><span>Top 10</span><div class="concentration-track"><span style="width:${Math.min(top10||0,100)}%"></span></div><strong>${api.percent(top10)}</strong></div><div class="concentration-row"><span>Top 20</span><div class="concentration-track"><span style="width:${Math.min(top20||0,100)}%"></span></div><strong>${api.percent(top20)}</strong></div></div>`;
    const body=$('#crmBody');if(!customers.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucun client identifié sur la période.</div></td></tr>';return}
    body.innerHTML=customers.slice(0,500).map(x=>`<tr><td><div class="element-cell"><strong>${api.escapeHtml(x.customerAccount)}</strong><span>${api.percent(x.shareIdentifiedSalesPct)} du CA identifié</span></div></td><td><span class="segment-pill ${x.segment}">${api.escapeHtml(labels[x.segment]||x.segment)}</span></td><td>${api.money(x.sales,true)}</td><td>${api.number(x.tickets)}</td><td>${api.money(x.averageBasket)}</td><td>${api.number(x.units,1)}</td><td>${api.escapeHtml(x.firstDate||'N/A')}</td><td>${api.escapeHtml(x.lastDate||'N/A')}</td><td>${api.number(x.storeCount)}</td><td>${api.escapeHtml((x.topProducts||[]).slice(0,3).map(p=>p.productNumber).join(', ')||'N/A')}</td></tr>`).join('');
  }

  function bind(){
    $('#performanceLevel')?.addEventListener('change',e=>{state.level=e.target.value;renderPerformance()});
    $('#performanceMetric')?.addEventListener('change',e=>{state.metric=e.target.value;renderPerformance()});
    $('#performanceSearch')?.addEventListener('input',e=>{state.search=e.target.value||'';renderPerformance()});
    document.addEventListener('retail-intelligence:period',e=>{if(sectionNeedsDecision())load(!!e.detail?.force)});
    document.addEventListener('retail-intelligence:data',()=>{if(sectionNeedsDecision())load(false)});
    document.addEventListener('retail-intelligence:section',()=>{if(sectionNeedsDecision())load(false)});
    const s=sectionState();if(s?.stores?.length&&sectionNeedsDecision(s))load(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();