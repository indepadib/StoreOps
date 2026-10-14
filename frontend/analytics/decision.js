(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;
  const state={data:null,key:null,loading:false,level:'product',metric:'sales',search:''};

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
  async function load(force=false){
    const api=core(),s=sectionState(); if(!api||!s||!s.stores?.length||state.loading)return;
    const key=queryKey(s); if(!force&&state.key===key&&state.data){render();return}
    state.loading=true; setLoading();
    try{
      const q=new URLSearchParams({storeId:s.selectedStore||'ALL',start:s.periodStart,end:s.periodEnd,compareStart:s.compareStart,compareEnd:s.compareEnd});
      if(force)q.set('force','1');
      state.data=await api.api(`/api/analytics/decision?${q}`); state.key=key; render();
      window.RETAIL_DECISION_INTELLIGENCE={getData:()=>state.data,reload:()=>load(true)};
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

  function render(){if(!state.data)return;renderSales();renderBenchmark();renderPerformance();renderCrm()}

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
    let rows=state.level==='product'?(d.products||[]):((d.hierarchy||{})[state.level]||[]);
    const q=state.search.trim().toLowerCase();if(q)rows=rows.filter(x=>String(x.label||x.key||'').toLowerCase().includes(q)||String(x.key||'').toLowerCase().includes(q));
    const previousField=state.level==='product'?'previousSales':'previous';
    const prevSorted=[...rows].filter(x=>safe(x[previousField])!=null).sort((a,b)=>Number(b[previousField]||0)-Number(a[previousField]||0)),prevRank=new Map(prevSorted.map((x,i)=>[x.key,i+1]));
    const metric=state.metric;
    rows=[...rows].sort((a,b)=>{
      const av=safe(a[metric]),bv=safe(b[metric]);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;return bv-av
    });
    return rows.map((x,i)=>({...x,displayRank:i+1,previousRank:prevRank.get(x.key)||null,rankDelta:prevRank.has(x.key)?prevRank.get(x.key)-(i+1):null}));
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
    document.addEventListener('retail-intelligence:period',e=>load(!!e.detail?.force));
    document.addEventListener('retail-intelligence:data',()=>load(false));
    const s=sectionState();if(s?.stores?.length)load(false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();