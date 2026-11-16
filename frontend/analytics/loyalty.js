(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const core = () => window.RETAIL_INTELLIGENCE || window.ONE_RETAIL_ANALYTICS;

  const state = {
    cashierDays: 30,
    cashierSearch: '',
    cashierKey: null,
    cashierLoading: false,
    cashierStores: [],
    walletKey: null,
    walletLoading: false,
    walletController: null,
    walletStores: [],
    enrollmentKey: null,
    enrollmentLoading: false,
    enrollmentData: null
  };

  function safe(v) {
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  }
  function withTimeout(promise,ms,label='Source'){
    let timer;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error(`${label} trop lente (> ${Math.round(ms/1000)} s)`);error.code='ANALYTICS_OPTIONAL_TIMEOUT';reject(error)},ms)})
    ]).finally(()=>clearTimeout(timer))
  }

  function pulseRows() {
    return core()?.readyRows?.() || [];
  }

  function decisionData(){return window.RETAIL_DECISION_INTELLIGENCE?.getData?.()||null}
  function enrollmentByStore(){
    return new Map((state.enrollmentData?.stores||[]).map(x=>[x.storeId,x]))
  }
  async function loadEnrollments(){
    const api=core();if(!api||state.enrollmentLoading)return;
    const scope=cashierScope(),ids=scope.stores.map(s=>s.id).filter(Boolean);
    if(!scope.start||!scope.end||!ids.length)return;
    const key=[scope.start,scope.end,ids.join(',')].join('|');
    if(state.enrollmentKey===key)return;
    state.enrollmentKey=key;
    state.enrollmentLoading=true;
    state.enrollmentData=null;
    try{
      const qs=new URLSearchParams({start:scope.start,end:scope.end,storeIds:ids.join(',')});
      const data=await withTimeout(api.api('/api/analytics/loyalty-range?'+qs,{noRetry:true}),25000,'Inscriptions fidélité');
      if(state.enrollmentKey===key)state.enrollmentData=data;
    }catch{
      if(state.enrollmentKey===key)state.enrollmentData={status:'UNAVAILABLE',stores:[]};
    }finally{
      state.enrollmentLoading=false;
      renderLoyalty();
      if(state.enrollmentKey!==key&&api.getState?.()?.section==='loyalty')loadEnrollments();
    }
  }

  function loyaltyAggregate() {
    const d=decisionData(),cur=d?.summary?.current||null;
    if(cur){
      const sales=safe(cur.sales)||0,tickets=safe(cur.tickets)||0,identifiedSales=safe(cur.identifiedSales),identifiedTickets=safe(cur.identifiedTickets);
      const nonLoyaltySales=identifiedSales!=null?sales-identifiedSales:null,nonMemberTickets=identifiedTickets!=null?Math.max(0,tickets-identifiedTickets):null;
      const memberBasket=identifiedTickets>0?identifiedSales/identifiedTickets:null,nonMemberBasket=nonLoyaltySales!=null&&nonMemberTickets>0?nonLoyaltySales/nonMemberTickets:null,uplift=memberBasket!=null&&nonMemberBasket?((memberBasket/nonMemberBasket)-1)*100:null;
      return{rows:d.stores||[],sales,tickets,identifiedSales,identifiedShare:safe(cur.identifiedSalesShare),identifiedTickets,identifiedTicketRate:safe(cur.identifiedTicketRate),nonLoyaltyTickets:nonMemberTickets,memberBasket,nonMemberBasket,uplift,coverage:d.coverage?.currentStoresReady||0,identifiedCustomers:d.crm?.identifiedCustomers??null,repeatRate:d.crm?.repeatRate??null,frequentCustomers:d.crm?.frequentCustomers??null,averageVisitsPerCustomer:d.crm?.averageVisitsPerCustomer??null}
    }
    const rows=pulseRows();let sales=0,identifiedSales=0,identifiedSalesKnown=0,tickets=0,identifiedTickets=0,identifiedTicketsKnown=0,nonLoyaltyTickets=0,nonLoyaltyTicketsKnown=0;
    for(const {pulse} of rows){const k=pulse?.snapshot?.kpis||{};sales+=Number(k.netSales||0);tickets+=Number(k.tickets||0);if(k.identifiedSales!=null){identifiedSales+=Number(k.identifiedSales||0);identifiedSalesKnown++}if(k.identifiedTickets!=null){identifiedTickets+=Number(k.identifiedTickets||0);identifiedTicketsKnown++}if(k.nonLoyaltyTickets!=null){nonLoyaltyTickets+=Number(k.nonLoyaltyTickets||0);nonLoyaltyTicketsKnown++}}
    const identifiedKnown=identifiedSalesKnown>0,ticketKnown=identifiedTicketsKnown>0,nonLoyaltyKnown=nonLoyaltyTicketsKnown>0,nonLoyaltySales=identifiedKnown?sales-identifiedSales:null,memberBasket=ticketKnown&&identifiedTickets>0?identifiedSales/identifiedTickets:null,nonMemberTickets=nonLoyaltyKnown?nonLoyaltyTickets:(ticketKnown?Math.max(0,tickets-identifiedTickets):null),nonMemberBasket=nonLoyaltySales!=null&&nonMemberTickets>0?nonLoyaltySales/nonMemberTickets:null,uplift=memberBasket!=null&&nonMemberBasket?(memberBasket/nonMemberBasket-1)*100:null;
    return{rows,sales,tickets,identifiedSales:identifiedKnown?identifiedSales:null,identifiedShare:identifiedKnown&&sales?identifiedSales/sales*100:null,identifiedTickets:ticketKnown?identifiedTickets:null,identifiedTicketRate:ticketKnown&&tickets?identifiedTickets/tickets*100:null,nonLoyaltyTickets:nonMemberTickets,memberBasket,nonMemberBasket,uplift,coverage:rows.length,identifiedCustomers:null,repeatRate:null,frequentCustomers:null}
  }

  function aggregatePaymentMix(){
    const map=new Map();
    for(const result of state.walletStores){
      if(!result.ok)continue;
      for(const row of result.data?.paymentMix||[]){
        const key=row.kind||row.label||row.id,cur=map.get(key)||{key,kind:row.kind||'OTHER',label:row.label||row.id||key,amount:0,transactions:0};
        cur.amount+=Number(row.amount||0);cur.transactions+=Number(row.transactions||0);map.set(key,cur)
      }
    }
    const rows=[...map.values()].sort((a,b)=>b.amount-a.amount),total=rows.reduce((s,x)=>s+x.amount,0);
    return rows.map(x=>({...x,sharePct:total?x.amount/total*100:null}))
  }

  function renderPaymentMix(){
    const api=core(),panel=$('#paymentMixPanel');if(!api||!panel)return;
    const rows=aggregatePaymentMix();
    if(state.walletLoading&&!rows.length){panel.innerHTML='<div class="table-loading">Chargement des paiements…</div>';return}
    if(!rows.length){panel.innerHTML='<div class="table-loading">Répartition des paiements indisponible.</div>';return}
    const label={CASH:'Espèces',CARD:'Carte',WALLET:'Wallet',OTHER:'Autres'};
    panel.innerHTML=rows.map(r=>`<div class="payment-mix-row"><div class="payment-mix-head"><strong>${api.escapeHtml(label[r.kind]||r.label)}</strong><span>${api.money(r.amount,true)} · ${api.percent(r.sharePct)}</span></div><div class="payment-mix-track"><span style="width:${Math.min(100,Math.max(0,r.sharePct||0))}%"></span></div><small>${api.number(r.transactions)} transaction(s) · ${api.escapeHtml(r.label)}</small></div>`).join('')
  }

  function renderLoyalty() {
    const api = core();
    if (!api || !$('#loyaltyKpis')) return;
    const a = loyaltyAggregate();
    const totalStores = api.getSelectedStores?.().length || 0;

    $('#loyaltyCoverage').textContent = `${a.coverage}/${totalStores} magasin(s) disponible(s)`;

    const walletReady=state.walletStores.filter(x=>x.ok&&x.data?.status==='READY'),walletBurn=totalStores>0&&walletReady.length===totalStores&&walletReady.every(x=>safe(x.data.burn)!=null)?walletReady.reduce((s,x)=>s+Number(x.data.burn),0):null,walletTx=walletReady.reduce((s,x)=>s+Number(x.data?.walletTransactions||0),0);
    const evidence=state.enrollmentData?.coverage;
    const enrollmentCoverage=state.enrollmentLoading?'Lecture en cours':evidence?`${evidence.ready}/${evidence.total} magasins couverts`:'Source indisponible';
    const cards = [
      ['CA identifié', api.money(a.identifiedSales, true), a.identifiedShare == null ? 'Part N/A' : api.percent(a.identifiedShare)],
      ['Part du CA identifié', api.percent(a.identifiedShare), a.identifiedSales == null ? 'Source indisponible' : 'sur CA total'],
      ['Tickets identifiés', api.number(a.identifiedTickets), a.identifiedTicketRate == null ? 'Taux N/A' : api.percent(a.identifiedTicketRate)],
      ['Clients identifiés', api.number(a.identifiedCustomers), a.repeatRate == null ? 'retour N/A' : api.percent(a.repeatRate)+' avec ≥2 visites'],
      ['Visites / client', api.number(a.averageVisitsPerCustomer,2), 'tickets identifiés / client'],
      ['Créations de comptes', 'N/D', 'Date de création du compte non vérifiée'],
      ['Inscriptions fidélité', enrollmentCoverage, 'Voir le détail par magasin'],
      ['Panier identifié', api.money(a.memberBasket), a.nonMemberBasket == null ? 'comparaison N/A' : 'vs '+api.money(a.nonMemberBasket)],
      ['Écart de panier', api.percent(a.uplift), 'tickets identifiés vs non identifiés'],
      ['Cashback crédité', 'N/D', 'Source des mouvements de crédit à vérifier'],
      ['Cashback consommé · burn Wallet', api.money(walletBurn,true), walletBurn==null?`${walletReady.length}/${totalStores} magasins avec paiements Wallet disponibles`:api.number(walletTx)+' paiement(s) Wallet'],
      ['Burn / CA identifié', a.identifiedSales&&walletBurn!=null?api.percent(walletBurn/a.identifiedSales*100):'N/A', 'usage cashback sur la période']
    ];

    $('#loyaltyKpis').innerHTML = cards.map(([label, value, sub]) => `
      <div class="loyalty-kpi">
        <small>${label}</small>
        <strong>${value}</strong>
        <span>${sub}</span>
      </div>
    `).join('');

    renderLoyaltyTable();
    renderBasketUplift(a);
    renderWalletStatus();
    renderPaymentMix();
  }

  function renderLoyaltyTable() {
    const api = core();
    const body = $('#loyaltyBody');
    if (!body) return;
    const d = decisionData();
    const walletByStore = new Map(state.walletStores.map(x => [x.store?.id, x])),enrollByStore=enrollmentByStore();
    let rows = [];

    if (d?.stores?.length) {
      rows = d.stores.map(s => {
        const identifiedSales = s.identifiedSalesShare != null ? Number(s.sales||0) * Number(s.identifiedSalesShare)/100 : null;
        const identifiedTickets = s.identifiedTicketRate != null ? Number(s.tickets||0) * Number(s.identifiedTicketRate)/100 : null;
        const nonMemberSales = identifiedSales != null ? Number(s.sales||0)-identifiedSales : null;
        const nonMemberTickets = identifiedTickets != null ? Math.max(0,Number(s.tickets||0)-identifiedTickets) : null;
        const memberBasket = identifiedTickets > 0 ? identifiedSales/identifiedTickets : null;
        const nonMemberBasket = nonMemberSales != null && nonMemberTickets > 0 ? nonMemberSales/nonMemberTickets : null;
        const wallet=walletByStore.get(s.storeId),enrollment=enrollByStore.get(s.storeId);
        return {
          id:s.storeId,name:s.storeName,identifiedSales,
          identifiedShare:s.identifiedSalesShare,identifiedTickets,
          identifiedTicketRate:s.identifiedTicketRate,memberBasket,nonMemberBasket,
          uplift:memberBasket!=null&&nonMemberBasket?((memberBasket/nonMemberBasket)-1)*100:null,enrollment,
          walletBurn:wallet?.data?.status==='READY'?safe(wallet.data.burn):null,
          walletTransactions:wallet?.data?.status==='READY'?safe(wallet.data.walletTransactions):null
        };
      }).sort((a,b)=>(b.identifiedShare ?? -1)-(a.identifiedShare ?? -1));
    } else {
      rows = pulseRows().map(({ store, pulse }) => {
        const k = pulse?.snapshot?.kpis || {}, wallet=walletByStore.get(store.id),enrollment=enrollByStore.get(store.id);
        return {
          id:store.id,name:store.name,identifiedSales:safe(k.identifiedSales),identifiedShare:safe(k.identifiedSalesShare),
          identifiedTickets:safe(k.identifiedTickets),identifiedTicketRate:safe(k.identifiedTicketRate),
          memberBasket:safe(k.identifiedAverageBasket),nonMemberBasket:safe(k.nonLoyaltyAverageBasket),uplift:safe(k.basketUpliftIdentified),enrollment,
          walletBurn:wallet?.data?.status==='READY'?safe(wallet.data.burn):null,
          walletTransactions:wallet?.data?.status==='READY'?safe(wallet.data.walletTransactions):null
        };
      }).sort((a,b)=>(b.identifiedShare ?? -1)-(a.identifiedShare ?? -1));
    }

    const identityLabels={CUSTOMER_ACCOUNT:'Par compte inscrit',LOYALTY_CARD:'Par carte inscrite',MIXED_ACCOUNT_AND_CARD:'Compte ou carte selon la ligne'};
    const enrollmentStatus={TRUNCATED:'Lecture incomplète',INCOMPLETE_IDENTITY:'Identifiants manquants'};
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="12"><div class="table-loading">Données fidélité indisponibles.</div></td></tr>';
      return;
    }

    body.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${api.escapeHtml(r.name)}</strong></td>
        <td>${api.money(r.identifiedSales, true)}</td>
        <td>${api.percent(r.identifiedShare)}</td>
        <td>${api.number(r.identifiedTickets)}</td>
        <td>${api.percent(r.identifiedTicketRate)}</td>
        <td>${api.money(r.memberBasket)}</td>
        <td>${api.money(r.nonMemberBasket)}</td>
        <td>${api.percent(r.uplift)}</td>
        <td>${r.enrollment?.enrollments==null?(enrollmentStatus[r.enrollment?.status]||'N/D'):`${api.number(r.enrollment.enrollments)} <small>${identityLabels[r.enrollment.enrollmentIdentityBasis]||'Inscription enregistrée'}</small>`}</td>
        <td>N/D</td>
        <td>${api.money(r.walletBurn,true)}</td>
        <td>${api.number(r.walletTransactions)}</td>
      </tr>
    `).join('');
  }

  function renderBasketUplift(a) {
    const api = core();
    const host = $('#basketUpliftPanel');
    if (!host) return;

    host.innerHTML = `
      <div class="uplift-hero">${api.percent(a.uplift)}</div>
      <div class="uplift-caption">Écart de panier moyen entre tickets avec client identifié et tickets non identifiés sur le périmètre courant.</div>
      <div class="uplift-bars">
        <div class="uplift-row"><span>Panier identifié</span><strong>${api.money(a.memberBasket)}</strong></div>
        <div class="uplift-row"><span>Panier non identifié</span><strong>${api.money(a.nonMemberBasket)}</strong></div>
        <div class="uplift-row"><span>Tickets identifiés</span><strong>${api.number(a.identifiedTickets)}</strong></div>
      </div>
    `;
  }

  function renderWalletStatus() {
    const api = core();
    const value = $('#walletBurnValue');
    const status = $('#walletBurnStatus');
    if (!api || !value || !status) return;

    if (state.walletLoading) {
      value.textContent = '…';
      status.textContent = 'Recherche de la source paiement Wallet dans Dynamics…';
      return;
    }

    const ready = state.walletStores.filter(x => x.ok && x.data?.status === 'READY');
    const mixOnly = state.walletStores.filter(x => x.ok && x.data?.status === 'PAYMENT_MIX_READY_WALLET_UNMAPPED');
    const signIssues = state.walletStores.filter(x => x.ok && x.data?.status === 'SIGN_VALIDATION_REQUIRED');
    const unavailable = state.walletStores.filter(x => !x.ok || x.data?.status === 'UNAVAILABLE');

    if (signIssues.length) {
      const gross = signIssues.reduce((s,x)=>s+Number(x.data?.signProfile?.grossAbsoluteAmount||0),0);
      value.textContent = 'À valider';
      status.textContent = `Wallet trouvé sur ${signIssues.length} magasin(s), mais les signes débit/crédit sont mixtes. Volume absolu observé : ${api.money(gross, true)}. Aucun burn net n'est affiché avant validation métier.`;
      return;
    }

    if (ready.length) {
      const expected=api.getSelectedStores?.().length||0;
      if(ready.length!==expected||ready.some(result=>safe(result.data.burn)==null)){
        value.textContent='N/D';
        status.textContent=`Paiements Wallet disponibles pour ${ready.length}/${expected} magasin(s). Le détail par magasin reste consultable.`;
        return;
      }
      const burn = ready.reduce((s,x)=>s+Number(x.data?.burn||0),0);
      const transactions = ready.reduce((s,x)=>s+Number(x.data?.walletTransactions||0),0);
      value.textContent = api.money(burn, true);
      status.textContent = `${transactions} transaction(s) Wallet · ${ready.length}/${state.walletStores.length} magasin(s) lus directement depuis la transaction de paiement Dynamics.`;
      return;
    }
    if(mixOnly.length){
      value.textContent='N/A';
      status.textContent='Les transactions de paiement sont disponibles, mais le code Tender correspondant à Wallet n’est pas encore identifié de façon fiable. La répartition Espèces / Carte / Autres reste affichée sans inventer le burn.';
      return;
    }

    value.textContent = 'N/A';
    if (unavailable.length) {
      const reason = unavailable[0]?.data?.diagnostics?.error?.message || unavailable[0]?.data?.message || unavailable[0]?.error?.message;
      status.textContent = reason
        ? `Source Wallet indisponible : ${reason}`
        : 'La Data Entity de paiement Wallet n’a pas encore été identifiée automatiquement. Aucun burn n’est reconstruit.';
    } else {
      status.textContent = 'Tender Wallet non disponible sur ce périmètre.';
    }
  }

  const walletScopeKey=scope=>`${scope.start}|${scope.end}|${scope.stores.map(store=>store.id).sort().join(',')}`;

  async function loadWallet(force = false) {
    const api = core();
    if (!api || state.walletLoading) return;
    const scope = cashierScope();
    const key = walletScopeKey(scope);
    if (!force && state.walletKey === key) {
      renderWalletStatus();
      renderLoyalty();
      return;
    }

    state.walletLoading = true;
    const controller=new AbortController();
    state.walletController=controller;
    if(state.walletKey!==key)state.walletStores=[];
    renderWalletStatus();

    try {
      let cursor = 0;
      const results = new Array(scope.stores.length);
      const worker = async () => {
        while (!controller.signal.aborted&&cursor < scope.stores.length) {
          const i = cursor++;
          const store = scope.stores[i];
          try {
            const qs = new URLSearchParams({ storeId: store.id, start: scope.start, end: scope.end });
            if (force) qs.set('force','1');
            const data = await withTimeout(api.api(`/api/analytics/wallet-range?${qs}`, { noRetry: true,signal:controller.signal }),25000,'Paiements Wallet');
            results[i] = { store, ok: true, data };
          } catch (error) {
            results[i] = { store, ok: false, error };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, Math.max(1, scope.stores.length)) }, worker));
      if(controller.signal.aborted||walletScopeKey(cashierScope())!==key)return;
      state.walletStores = results.filter(Boolean);
      state.walletKey = key;
    } finally {
      state.walletLoading = false;
      state.walletController=null;
      if((controller.signal.aborted||walletScopeKey(cashierScope())!==key)&&api.getState?.()?.section==='loyalty')loadWallet();
      renderWalletStatus();
      renderLoyalty();
    }
  }

  function cashierScope() {
    const api = core();
    const appState = api?.getState?.();
    if (!appState) return { stores: [], date: null, start: null, end: null };
    return {
      stores: api.getSelectedStores?.() || appState.stores || [],
      date: appState.businessDate,
      start: appState.periodStart || appState.businessDate,
      end: appState.periodEnd || appState.businessDate
    };
  }

  function hydrateCashiersFromDecision(){
    const d=decisionData(),items=d?.cashiers?.items||[];if(!items.length)return false;
    const app=core()?.getState?.()||{},stores=new Map((app.stores||[]).map(s=>[s.id,s])),groups=new Map();
    for(const row of items){
      const store=stores.get(row.storeId)||{id:row.storeId||'unknown',name:row.storeId||'Magasin'},key=store.id;
      if(!groups.has(key))groups.set(key,{store,ok:true,data:{status:'READY',source:'SALES_RANGE_REUSE',items:[]}});
      groups.get(key).data.items.push({...row,name:row.name||row.staffId,rateEligible:Number(row.tickets||0)>=10})
    }
    state.cashierStores=[...groups.values()];state.cashierKey='decision|'+(d.period?.startDate||'')+'|'+(d.period?.endDate||'');renderCashiers();return true
  }

  async function loadCashiers(force = false) {
    const api = core();
    if (!api || state.cashierLoading) return;
    if(!force&&hydrateCashiersFromDecision())return;
    const scope = cashierScope();
    const key = `${scope.date}|${state.cashierDays}|${scope.stores.map(s=>s.id).join(',')}`;
    if (!force && state.cashierKey === key) {
      renderCashiers();
      return;
    }

    state.cashierLoading = true;
    if ($('#cashierBody')) $('#cashierBody').innerHTML = '<tr><td colspan="9"><div class="table-loading">Chargement performance caissiers…</div></td></tr>';

    try {
      state.cashierStores = await Promise.all(scope.stores.map(async store => {
        try {
          const data = await withTimeout(api.api(`/api/stores/${encodeURIComponent(store.id)}/cashier-performance?date=${encodeURIComponent(scope.date)}&days=${state.cashierDays}`,{noRetry:true}),25000,'Performance caissiers');
          return { store, ok: data?.status === 'READY' || data?.status === 'TRUNCATED', data };
        } catch (error) {
          return { store, ok: false, error };
        }
      }));
      state.cashierKey = key;
      renderCashiers();
    } finally {
      state.cashierLoading = false;
    }
  }

  function cashierRows() {
    const q = state.cashierSearch.trim().toLowerCase();
    const rows = [];
    for (const result of state.cashierStores) {
      if (!result.ok) continue;
      for (const row of result.data?.items || []) {
        const cardEnrollments=row.recruitmentStatus==='ENROLLMENT_DIRECT_STAFF'?safe(row.recruitments):null;
        const item={...row,cardEnrollments,storeId:result.store.id,storeName:result.store.name};
        if (!q || [item.name,item.staffId,item.storeName].some(v=>String(v||'').toLowerCase().includes(q))) rows.push(item);
      }
    }
    return rows.sort((a,b)=>
      Number(b.rateEligible)-Number(a.rateEligible) ||
      Number(b.identifiedTicketRate ?? -1)-Number(a.identifiedTicketRate ?? -1) ||
      Number(b.tickets||0)-Number(a.tickets||0)
    );
  }

  function renderCashiers() {
    const api = core();
    const body = $('#cashierBody');
    if (!api || !body) return;
    const rows = cashierRows();

    const readyStores = state.cashierStores.filter(x=>x.ok);
    const allItems = readyStores.flatMap(x=>x.data?.items || []);
    const eligible = rows.filter(x=>x.rateEligible);
    const totalTickets = rows.reduce((s,x)=>s+Number(x.tickets||0),0);
    const weightedIdentification = totalTickets
      ? rows.reduce((s,x)=>s+Number(x.identifiedTickets||0),0)/totalTickets*100
      : null;

    $('#cashierSummary').innerHTML = [
      ['Caissiers analysés', api.number(allItems.length), `${readyStores.length}/${state.cashierStores.length} magasin(s)`],
      ['Éligibles classement', api.number(eligible.length), 'Seuil volume appliqué'],
      ['Tickets', api.number(totalTickets), decisionData()?.cashiers?.source==='SALES_RANGE_REUSE'?'période globale sélectionnée':`${state.cashierDays} derniers jours`],
      ['Taux d’identification', api.percent(weightedIdentification), 'Tickets identifiés / tickets de la sélection']
    ].map(([label,value,sub])=>`
      <div class="cashier-stat"><small>${label}</small><strong>${value}</strong><span>${sub}</span></div>
    `).join('');

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="table-loading">Aucune donnée caissier disponible sur ce périmètre.</div></td></tr>';
      return;
    }

    body.innerHTML = rows.slice(0,250).map(r=>`
      <tr>
        <td><div class="cashier-name"><strong>${api.escapeHtml(r.name || r.staffId)}</strong><span>${api.escapeHtml(r.staffId || '')}</span></div></td>
        <td>${api.escapeHtml(r.storeName)}</td>
        <td>${api.money(r.sales,true)}</td>
        <td>${api.number(r.tickets)}</td>
        <td>${api.percent(r.identifiedTicketRate)}</td>
        <td>${api.percent(r.identifiedSalesShare)}</td>
        <td>${api.number(r.cardEnrollments)}</td>
        <td>N/D</td>
        <td><span class="eligibility-pill ${r.rateEligible?'':'low'}">${r.rateEligible?'Oui':'Volume faible'}</span></td>
      </tr>
    `).join('');
  }

  function bind() {
    $('#cashierWindow')?.addEventListener('change', e => {
      state.cashierDays = Math.max(1, Math.min(90, Number(e.target.value) || 30));
      state.cashierKey = null;
      loadCashiers(true);
    });

    $('#cashierSearch')?.addEventListener('input', e => {
      state.cashierSearch = e.target.value || '';
      renderCashiers();
    });

    const loadVisibleModule = () => {
      const section = core()?.getState?.()?.section;
      if (section === 'loyalty') {
        renderLoyalty();
        loadEnrollments();
        loadWallet(false);
      } else if (section === 'cashiers') {
        // Always try the already-loaded decision rows first, then fall back to the
        // dedicated staff endpoint if the sales mapping doesn't expose staffId.
        loadCashiers(false);
      }
    };

    document.addEventListener('retail-intelligence:data', () => {
      renderLoyalty();
      loadVisibleModule();
    });
    document.addEventListener('retail-intelligence:decision', () => {
      renderLoyalty();
      loadVisibleModule();
    });
    document.addEventListener('retail-intelligence:period', () => {
      state.walletController?.abort();
      state.walletKey = null;
      state.walletStores = [];
      state.cashierKey = null;
      state.enrollmentKey = null;
      state.enrollmentData = null;
      loadVisibleModule();
    });
    document.addEventListener('retail-intelligence:section', loadVisibleModule);

    const existing = core()?.getState?.();
    if (existing?.pulses?.length) {
      renderLoyalty();
      loadVisibleModule();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();