(() => {
  const $=(sel,root=document)=>root.querySelector(sel);
  const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;
  function withTimeout(promise,ms,label='Source'){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error(`${label} trop lente (> ${Math.round(ms/1000)} s)`);e.code='ANALYTICS_OPTIONAL_TIMEOUT';reject(e)},ms)})]).finally(()=>clearTimeout(timer))}

  const state={view:'ALL',search:'',key:null,loading:false,stores:[]};

  function safe(v){return v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v)}
  function appScope(){
    const api=core(),s=api?.getState?.();
    if(!s)return{stores:[],date:null};
    return{
      stores:core()?.getSelectedStores?.()||s.stores||[],
      date:s.periodEnd||s.businessDate
    };
  }
  function stateLabel(v){
    return{
      ACTIVE:'Active',
      STARTS_TODAY:"Démarre aujourd'hui",
      ENDS_TODAY:"Expire aujourd'hui",
      ENDS_SOON:'Expire bientôt',
      PROCESSING:'À traiter',
      ENDED:'Terminée'
    }[v]||v||'—';
  }
  function stockLabel(v){
    return{OUT:'Rupture',LOW:'Faible stock',GHOST:'Stock fantôme',NEGATIVE:'Stock négatif'}[v]||'Disponible / N/A';
  }

  async function load(force=false){
    const api=core();if(!api||state.loading)return;
    const scope=appScope(),key=`${scope.date}|${scope.stores.map(x=>x.id).join(',')}`;
    if(!force&&state.key===key){render();return}
    state.loading=true;setLoading();
    try{
      state.stores=await Promise.all(scope.stores.map(async store=>{
        try{
          const data=await withTimeout(api.api(`/api/analytics/promotions?storeId=${encodeURIComponent(store.id)}&date=${encodeURIComponent(scope.date)}${force?'&force=1':''}`,{noRetry:true}),25000,'Promotions D365');
          return{store,ok:data?.status==='READY',data};
        }catch(error){return{store,ok:false,error}}
      }));
      state.key=key;render();
    }finally{state.loading=false}
  }

  function allRows(){
    const rows=[];
    for(const result of state.stores){
      if(!result.ok)continue;
      for(const item of result.data?.items||[])rows.push({...item,storeName:result.store.name});
    }
    return rows;
  }
  function filteredRows(){
    const q=state.search.trim().toLowerCase();
    return allRows().filter(row=>{
      if(state.view==='ACTIVE'&&!['ACTIVE','STARTS_TODAY'].includes(row.state))return false;
      if(state.view==='ENDING'&&!['ENDS_TODAY','ENDS_SOON'].includes(row.state))return false;
      if(state.view==='STOCK'&&!['OUT','LOW','NEGATIVE','GHOST'].includes(row.stockSignal))return false;
      if(state.view==='ENDED'&&row.state!=='ENDED')return false;
      if(q&&![
        row.productName,row.productNumber,row.category,row.offerId,row.promoLabel,row.storeName,
        ...(row.priceGroups||[])
      ].some(v=>String(v||'').toLowerCase().includes(q)))return false;
      return true;
    });
  }

  function aggregate(){
    const ready=state.stores.filter(x=>x.ok),rows=allRows(),live=rows.filter(x=>x.state!=='ENDED');
    const offers=new Set(live.map(x=>x.offerId||x.sourceKey).filter(Boolean));
    const articles=new Set(live.map(x=>x.productNumber).filter(Boolean));
    const discounts=live.map(x=>safe(x.discountPct)).filter(v=>v!=null);
    return{
      ready:ready.length,total:state.stores.length,rows,
      offers:offers.size,articles:articles.size,
      ending:live.filter(x=>['ENDS_TODAY','ENDS_SOON'].includes(x.state)).length,
      out:live.filter(x=>x.stockSignal==='OUT').length,
      low:live.filter(x=>x.stockSignal==='LOW').length,
      avgDiscount:discounts.length?discounts.reduce((s,v)=>s+v,0)/discounts.length:null
    };
  }

  function offerRows(){
    const map=new Map();
    for(const row of allRows().filter(x=>x.state!=='ENDED')){
      const key=row.offerId||row.promoLabel||row.sourceKey||[row.mechanic,row.validFrom,row.validTo].filter(Boolean).join('|')||'OFFRE_NON_IDENTIFIEE';
      const cur=map.get(key)||{key,label:row.promoLabel||row.offerId||'Offre sans libellé',mechanic:row.mechanic||null,stores:new Set(),articles:new Set(),discountSum:0,discountCount:0,out:0,low:0,rows:0,validFrom:null,validTo:null};
      cur.rows++;if(row.storeId)cur.stores.add(row.storeId);if(row.productNumber)cur.articles.add(row.productNumber);
      if(row.discountPct!=null&&Number.isFinite(Number(row.discountPct))){cur.discountSum+=Number(row.discountPct);cur.discountCount++}
      if(row.stockSignal==='OUT')cur.out++;if(row.stockSignal==='LOW')cur.low++;
      if(row.validFrom&&(!cur.validFrom||row.validFrom<cur.validFrom))cur.validFrom=row.validFrom;
      if(row.validTo&&(!cur.validTo||row.validTo>cur.validTo))cur.validTo=row.validTo;
      map.set(key,cur)
    }
    return[...map.values()].map(x=>({
      ...x,
      storeCount:x.stores.size,
      articleCount:x.articles.size,
      averageDiscountPct:x.discountCount?x.discountSum/x.discountCount:null,
      availabilityPct:x.rows?Math.max(0,(x.rows-x.out)/x.rows*100):null
    })).sort((a,b)=>b.articleCount-a.articleCount||b.storeCount-a.storeCount||String(a.label).localeCompare(String(b.label),'fr'))
  }

  function renderOfferPerformance(){
    const api=core(),kpis=$('#promotionGlobalKpis'),body=$('#promotionOfferBody');if(!api||!kpis||!body)return;
    const offers=offerRows(),rows=allRows().filter(x=>x.state!=='ENDED'),storeCount=new Set(rows.map(x=>x.storeId).filter(Boolean)).size,articleCount=new Set(rows.map(x=>x.productNumber).filter(Boolean)).size,totalRows=rows.length,out=rows.filter(x=>x.stockSignal==='OUT').length,low=rows.filter(x=>x.stockSignal==='LOW').length,discounts=rows.map(x=>safe(x.discountPct)).filter(x=>x!=null);
    const availability=totalRows?(totalRows-out)/totalRows*100:null;
    kpis.innerHTML=[
      ['Offres',api.number(offers.length),'promotions actives consolidées'],
      ['Magasins couverts',api.number(storeCount),'sur le périmètre sélectionné'],
      ['Articles couverts',api.number(articleCount),'références distinctes'],
      ['Remise moyenne',api.percent(discounts.length?discounts.reduce((s,x)=>s+x,0)/discounts.length:null),'moyenne non pondérée'],
      ['Disponibilité promo',api.percent(availability),'lignes promo non en rupture'],
      ['À risque stock',api.number(out+low),`${api.number(out)} rupture(s) · ${api.number(low)} faible(s)`]
    ].map(([l,v,s])=>`<div class="promotion-global-kpi"><small>${l}</small><strong>${v}</strong><span>${s}</span></div>`).join('');

    if(!offers.length){body.innerHTML='<tr><td colspan="8"><div class="table-loading">Aucune offre active consolidée.</div></td></tr>';return}
    body.innerHTML=offers.slice(0,120).map(o=>`
      <tr>
        <td><div class="promo-product"><strong>${api.escapeHtml(o.label)}</strong><small>${api.escapeHtml(o.key)}</small></div></td>
        <td>${api.number(o.storeCount)}</td>
        <td>${api.number(o.articleCount)}</td>
        <td>${api.percent(o.averageDiscountPct)}</td>
        <td>${api.percent(o.availabilityPct)}</td>
        <td>${api.number(o.out)}</td>
        <td>${api.number(o.low)}</td>
        <td>${api.escapeHtml([o.validFrom,o.validTo].filter(Boolean).join(' → ')||'N/A')}</td>
      </tr>`).join('')
  }

  function setLoading(){
    if($('#promotionKpis'))$('#promotionKpis').innerHTML=Array.from({length:6},()=>'<div class="promotion-kpi skeleton-card"></div>').join('');
    if($('#promotionGlobalKpis'))$('#promotionGlobalKpis').innerHTML=Array.from({length:6},()=>'<div class="promotion-global-kpi skeleton-card"></div>').join('');
    if($('#promotionOfferBody'))$('#promotionOfferBody').innerHTML='<tr><td colspan="8"><div class="table-loading">Chargement performance offres…</div></td></tr>';
    if($('#promotionBody'))$('#promotionBody').innerHTML='<tr><td colspan="10"><div class="table-loading">Chargement promotions…</div></td></tr>';
  }

  function render(){
    renderKpis();renderOfferPerformance();renderTable();renderMeasurement();renderRisk();
  }
  function renderKpis(){
    const api=core(),a=aggregate();if(!api||!$('#promotionKpis'))return;
    const unavailable=a.ready===0;
    const cards=[
      ['Offres actives',unavailable?'N/A':api.number(a.offers),`${a.ready}/${a.total} magasin(s) source promo disponible`,unavailable?'warning':''],
      ['Articles promo',unavailable?'N/A':api.number(a.articles),unavailable?'source D365 indisponible':'SKU couverts',unavailable?'warning':''],
      ['Remise moyenne',unavailable?'N/A':api.percent(a.avgDiscount),unavailable?'aucune estimation':'moyenne non pondérée',unavailable?'warning':''],
      ['Expire bientôt',unavailable?'N/A':api.number(a.ending),unavailable?'source indisponible':'≤ 3 jours',!unavailable&&a.ending?'warning':''],
      ['Promo en rupture',unavailable?'N/A':api.number(a.out),unavailable?'source indisponible':'stock signal OUT',!unavailable&&a.out?'danger':''],
      ['Promo stock faible',unavailable?'N/A':api.number(a.low),unavailable?'source indisponible':'couverture faible',!unavailable&&a.low?'warning':'']
    ];
    $('#promotionKpis').innerHTML=cards.map(([label,value,sub,tone])=>`
      <div class="promotion-kpi ${tone}">
        <small>${label}</small><strong>${value}</strong><span>${sub}</span>
      </div>`).join('');
  }

  function renderTable(){
    const api=core(),body=$('#promotionBody');if(!api||!body)return;
    const rows=filteredRows();
    if(!state.stores.some(x=>x.ok)){
      const reason=state.stores.find(x=>x.data?.error)?.data?.error?.message||state.stores.find(x=>x.error)?.error?.message||'Source promotion D365 indisponible.';
      body.innerHTML=`<tr><td colspan="10"><div class="table-loading">${api.escapeHtml(reason)} Aucun KPI promo n'est simulé.</div></td></tr>`;return;
    }
    if(!rows.length){body.innerHTML='<tr><td colspan="10"><div class="table-loading">Aucune promotion sur ce filtre.</div></td></tr>';return}
    body.innerHTML=rows.slice(0,350).map(r=>`
      <tr>
        <td><span class="promo-status ${r.state||''}">${api.escapeHtml(stateLabel(r.state))}</span></td>
        <td><div class="promo-product"><strong title="${api.escapeHtml(r.productName)}">${api.escapeHtml(r.productName)}</strong><small>${api.escapeHtml(r.productNumber||r.offerId||r.category||'')}</small></div></td>
        <td>${api.escapeHtml(r.storeName)}</td>
        <td>${api.escapeHtml(r.mechanic||'N/A')}</td>
        <td>${api.money(r.oldPrice)}</td>
        <td>${api.money(r.promoPrice)}</td>
        <td>${api.percent(r.discountPct)}</td>
        <td>${api.escapeHtml([r.validFrom,r.validTo].filter(Boolean).join(' → ')||'N/A')}</td>
        <td><span class="promo-stock ${r.stockSignal||''}">${api.escapeHtml(stockLabel(r.stockSignal))}</span></td>
        <td>${api.escapeHtml((r.priceGroups||[]).join(', ')||'N/A')}</td>
      </tr>`).join('');
  }

  function renderMeasurement(){
    const api=core(),host=$('#promotionMeasurement');if(!api||!host)return;
    const a=aggregate();
    host.innerHTML=`<div class="measurement-list">
      <div class="measurement-row"><span>Offres / mécanique / prix</span><strong>Disponible</strong></div>
      <div class="measurement-row"><span>Disponibilité stock</span><strong>${a.out+a.low?'Signalée':'Disponible / N/A'}</strong></div>
      <div class="measurement-row unavailable"><span>CA réellement remisé</span><strong>N/A</strong></div>
      <div class="measurement-row unavailable"><span>Uplift incrémental</span><strong>N/A</strong></div>
      <div class="measurement-row unavailable"><span>ROI promo</span><strong>N/A</strong></div>
    </div>
    <div class="promo-risk-note">Les trois dernières métriques nécessitent le rapprochement des Discount Transactions avec les ventes. Elles ne sont pas estimées à partir du simple fait qu'un SKU soit sous promotion.</div>`;
  }

  function renderRisk(){
    const api=core(),host=$('#promotionRisk');if(!api||!host)return;
    const rows=allRows().filter(x=>x.state!=='ENDED');
    const riskRows=rows.filter(x=>['OUT','LOW','NEGATIVE','GHOST'].includes(x.stockSignal))
      .sort((a,b)=>Number(b.salesRisk24h||0)-Number(a.salesRisk24h||0)).slice(0,7);
    host.innerHTML=`<div class="promo-risk-list">${riskRows.length?riskRows.map(r=>`
      <div class="promo-risk-row">
        <span title="${api.escapeHtml(r.productName)}">${api.escapeHtml(r.productName)} · ${api.escapeHtml(r.storeName)}</span>
        <strong>${r.stockSignal==='OUT'?api.money(r.salesRisk24h,true):stockLabel(r.stockSignal)}</strong>
      </div>`).join(''):'<div class="table-loading">Aucun signal stock promo critique détecté.</div>'}</div>
      <div class="promo-risk-note">Le risque 24h, lorsqu'il existe, provient du moteur Stock Intelligence et reste une estimation commerciale.</div>`;
  }

  function bind(){
    $$('#promotionTabs button').forEach(btn=>btn.addEventListener('click',()=>{
      $$('#promotionTabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
      state.view=btn.dataset.promoView||'ALL';renderTable();
    }));
    $('#promotionSearch')?.addEventListener('input',e=>{state.search=e.target.value||'';renderTable()});
    const loadIfVisible=()=>{if(core()?.getState?.()?.section==='promotions')load(false)};
    document.addEventListener('retail-intelligence:data',loadIfVisible);
    document.addEventListener('retail-intelligence:period',loadIfVisible);
    document.addEventListener('retail-intelligence:section',loadIfVisible);
    const existing=core()?.getState?.();if(existing?.section==='promotions')load(false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();