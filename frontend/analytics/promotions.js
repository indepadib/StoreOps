(() => {
  const $=(sel,root=document)=>root.querySelector(sel);
  const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
  const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;

  const state={view:'ALL',search:'',key:null,loading:false,stores:[]};

  function safe(v){return v===null||v===undefined||!Number.isFinite(Number(v))?null:Number(v)}
  function appScope(){
    const api=core(),s=api?.getState?.();
    if(!s)return{stores:[],date:null};
    return{
      stores:s.selectedStore==='ALL'?s.stores:s.stores.filter(x=>x.id===s.selectedStore),
      date:s.businessDate
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
          const data=await api.api(`/api/analytics/promotions?storeId=${encodeURIComponent(store.id)}&date=${encodeURIComponent(scope.date)}${force?'&force=1':''}`);
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

  function setLoading(){
    if($('#promotionKpis'))$('#promotionKpis').innerHTML=Array.from({length:6},()=>'<div class="promotion-kpi skeleton-card"></div>').join('');
    if($('#promotionBody'))$('#promotionBody').innerHTML='<tr><td colspan="10"><div class="table-loading">Chargement promotions…</div></td></tr>';
  }

  function render(){
    renderKpis();renderTable();renderMeasurement();renderRisk();
  }
  function renderKpis(){
    const api=core(),a=aggregate();if(!api||!$('#promotionKpis'))return;
    const cards=[
      ['Offres actives',api.number(a.offers),`${a.ready}/${a.total} magasin(s)`,''],
      ['Articles promo',api.number(a.articles),'SKU couverts',''],
      ['Remise moyenne',api.percent(a.avgDiscount),'moyenne non pondérée',''],
      ['Expire bientôt',api.number(a.ending),'≤ 3 jours',a.ending?'warning':''],
      ['Promo en rupture',api.number(a.out),'stock signal OUT',a.out?'danger':''],
      ['Promo stock faible',api.number(a.low),'couverture faible',a.low?'warning':'']
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
    document.addEventListener('retail-intelligence:data',()=>load(false));
    const existing=core()?.getState?.();if(existing?.pulses?.length)load(false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();