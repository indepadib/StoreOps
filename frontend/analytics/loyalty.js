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
    walletStores: []
  };

  function safe(v) {
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  }

  function pulseRows() {
    return core()?.readyRows?.() || [];
  }

  function decisionData(){return window.RETAIL_DECISION_INTELLIGENCE?.getData?.()||null}
  function loyaltyAggregate() {
    const d=decisionData(),cur=d?.summary?.current||null;
    if(cur){
      const sales=safe(cur.sales)||0,tickets=safe(cur.tickets)||0,identifiedSales=safe(cur.identifiedSales),identifiedTickets=safe(cur.identifiedTickets);
      const nonLoyaltySales=identifiedSales!=null?sales-identifiedSales:null,nonMemberTickets=identifiedTickets!=null?Math.max(0,tickets-identifiedTickets):null;
      const memberBasket=identifiedTickets>0?identifiedSales/identifiedTickets:null,nonMemberBasket=nonLoyaltySales!=null&&nonMemberTickets>0?nonLoyaltySales/nonMemberTickets:null,uplift=memberBasket!=null&&nonMemberBasket?((memberBasket/nonMemberBasket)-1)*100:null;
      return{rows:d.stores||[],sales,tickets,identifiedSales,identifiedShare:safe(cur.identifiedSalesShare),identifiedTickets,identifiedTicketRate:safe(cur.identifiedTicketRate),recruitments:null,nonLoyaltyTickets:nonMemberTickets,recruitmentRate:null,memberBasket,nonMemberBasket,uplift,coverage:d.coverage?.currentStoresReady||0,identifiedCustomers:d.crm?.identifiedCustomers??null,repeatRate:d.crm?.repeatRate??null,frequentCustomers:d.crm?.frequentCustomers??null}
    }
    const rows=pulseRows();let sales=0,identifiedSales=0,identifiedSalesKnown=0,tickets=0,identifiedTickets=0,identifiedTicketsKnown=0,recruitments=0,recruitmentsKnown=0,nonLoyaltyTickets=0,nonLoyaltyTicketsKnown=0;
    for(const {pulse} of rows){const k=pulse?.snapshot?.kpis||{};sales+=Number(k.netSales||0);tickets+=Number(k.tickets||0);if(k.identifiedSales!=null){identifiedSales+=Number(k.identifiedSales||0);identifiedSalesKnown++}if(k.identifiedTickets!=null){identifiedTickets+=Number(k.identifiedTickets||0);identifiedTicketsKnown++}if(k.recruitments!=null){recruitments+=Number(k.recruitments||0);recruitmentsKnown++}if(k.nonLoyaltyTickets!=null){nonLoyaltyTickets+=Number(k.nonLoyaltyTickets||0);nonLoyaltyTicketsKnown++}}
    const identifiedKnown=identifiedSalesKnown>0,ticketKnown=identifiedTicketsKnown>0,recruitmentKnown=recruitmentsKnown>0,nonLoyaltyKnown=nonLoyaltyTicketsKnown>0,nonLoyaltySales=identifiedKnown?sales-identifiedSales:null,memberBasket=ticketKnown&&identifiedTickets>0?identifiedSales/identifiedTickets:null,nonMemberTickets=nonLoyaltyKnown?nonLoyaltyTickets:(ticketKnown?Math.max(0,tickets-identifiedTickets):null),nonMemberBasket=nonLoyaltySales!=null&&nonMemberTickets>0?nonLoyaltySales/nonMemberTickets:null,uplift=memberBasket!=null&&nonMemberBasket?(memberBasket/nonMemberBasket-1)*100:null;
    return{rows,sales,tickets,identifiedSales:identifiedKnown?identifiedSales:null,identifiedShare:identifiedKnown&&sales?identifiedSales/sales*100:null,identifiedTickets:ticketKnown?identifiedTickets:null,identifiedTicketRate:ticketKnown&&tickets?identifiedTickets/tickets*100:null,recruitments:recruitmentKnown?recruitments:null,nonLoyaltyTickets:nonMemberTickets,recruitmentRate:recruitmentKnown&&nonMemberTickets>0?recruitments/nonMemberTickets*100:null,memberBasket,nonMemberBasket,uplift,coverage:rows.length,identifiedCustomers:null,repeatRate:null,frequentCustomers:null}
  }

  function renderLoyalty() {
    const api = core();
    if (!api || !$('#loyaltyKpis')) return;
    const a = loyaltyAggregate();
    const appState = api.getState?.() || {};
    const totalStores = appState.selectedStore === 'ALL' ? appState.stores?.length || 0 : 1;

    $('#loyaltyCoverage').textContent = `${a.coverage}/${totalStores} magasin(s) disponible(s)`;

    const walletReady=state.walletStores.filter(x=>x.ok&&x.data?.status==='READY'),walletBurn=walletReady.length?walletReady.reduce((s,x)=>s+Number(x.data?.burn||0),0):null,walletTx=walletReady.reduce((s,x)=>s+Number(x.data?.walletTransactions||0),0);
    const cards = [
      ['CA fidélisé', api.money(a.identifiedSales, true), a.identifiedShare == null ? 'Part N/A' : api.percent(a.identifiedShare)],
      ['Poids CA fidélisé', api.percent(a.identifiedShare), a.identifiedSales == null ? 'Source indisponible' : 'sur CA total'],
      ['Tickets fidélisés', api.number(a.identifiedTickets), a.identifiedTicketRate == null ? 'Taux N/A' : api.percent(a.identifiedTicketRate)],
      ['Clients identifiés', api.number(a.identifiedCustomers), a.repeatRate == null ? 'repeat N/A' : api.percent(a.repeatRate)+' repeat'],
      ['Panier membre', api.money(a.memberBasket), a.nonMemberBasket == null ? 'comparaison N/A' : 'vs '+api.money(a.nonMemberBasket)],
      ['Uplift panier', api.percent(a.uplift), 'membre vs non-membre'],
      ['Burn Wallet', api.money(walletBurn,true), walletBurn==null?'source paiement en cours':api.number(walletTx)+' paiement(s) Wallet'],
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
  }

  function renderLoyaltyTable() {
    const api = core();
    const body = $('#loyaltyBody');
    if (!body) return;
    const d = decisionData();
    const walletByStore = new Map(state.walletStores.map(x => [x.store?.id, x]));
    let rows = [];

    if (d?.stores?.length) {
      rows = d.stores.map(s => {
        const identifiedSales = s.identifiedSalesShare != null ? Number(s.sales||0) * Number(s.identifiedSalesShare)/100 : null;
        const identifiedTickets = s.identifiedTicketRate != null ? Number(s.tickets||0) * Number(s.identifiedTicketRate)/100 : null;
        const nonMemberSales = identifiedSales != null ? Number(s.sales||0)-identifiedSales : null;
        const nonMemberTickets = identifiedTickets != null ? Math.max(0,Number(s.tickets||0)-identifiedTickets) : null;
        const memberBasket = identifiedTickets > 0 ? identifiedSales/identifiedTickets : null;
        const nonMemberBasket = nonMemberSales != null && nonMemberTickets > 0 ? nonMemberSales/nonMemberTickets : null;
        const wallet = walletByStore.get(s.storeId);
        return {
          id:s.storeId,name:s.storeName,identifiedSales,
          identifiedShare:s.identifiedSalesShare,identifiedTickets,
          identifiedTicketRate:s.identifiedTicketRate,memberBasket,nonMemberBasket,
          uplift:memberBasket!=null&&nonMemberBasket?((memberBasket/nonMemberBasket)-1)*100:null,
          walletBurn:wallet?.data?.status==='READY'?safe(wallet.data.burn):null,
          walletTransactions:wallet?.data?.status==='READY'?safe(wallet.data.walletTransactions):null
        };
      }).sort((a,b)=>(b.identifiedShare ?? -1)-(a.identifiedShare ?? -1));
    } else {
      rows = pulseRows().map(({ store, pulse }) => {
        const k = pulse?.snapshot?.kpis || {}, wallet=walletByStore.get(store.id);
        return {
          id:store.id,name:store.name,identifiedSales:safe(k.identifiedSales),identifiedShare:safe(k.identifiedSalesShare),
          identifiedTickets:safe(k.identifiedTickets),identifiedTicketRate:safe(k.identifiedTicketRate),
          memberBasket:safe(k.identifiedAverageBasket),nonMemberBasket:safe(k.nonLoyaltyAverageBasket),uplift:safe(k.basketUpliftIdentified),
          walletBurn:wallet?.data?.status==='READY'?safe(wallet.data.burn):null,
          walletTransactions:wallet?.data?.status==='READY'?safe(wallet.data.walletTransactions):null
        };
      }).sort((a,b)=>(b.identifiedShare ?? -1)-(a.identifiedShare ?? -1));
    }

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10"><div class="table-loading">Données fidélité indisponibles.</div></td></tr>';
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
        <div class="uplift-row"><span>Panier membre</span><strong>${api.money(a.memberBasket)}</strong></div>
        <div class="uplift-row"><span>Panier non-membre</span><strong>${api.money(a.nonMemberBasket)}</strong></div>
        <div class="uplift-row"><span>Tickets fidélisés</span><strong>${api.number(a.identifiedTickets)}</strong></div>
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
    const signIssues = state.walletStores.filter(x => x.ok && x.data?.status === 'SIGN_VALIDATION_REQUIRED');
    const unavailable = state.walletStores.filter(x => !x.ok || x.data?.status === 'UNAVAILABLE');

    if (signIssues.length) {
      const gross = signIssues.reduce((s,x)=>s+Number(x.data?.signProfile?.grossAbsoluteAmount||0),0);
      value.textContent = 'À valider';
      status.textContent = `Wallet trouvé sur ${signIssues.length} magasin(s), mais les signes débit/crédit sont mixtes. Volume absolu observé : ${api.money(gross, true)}. Aucun burn net n'est affiché avant validation métier.`;
      return;
    }

    if (ready.length) {
      const burn = ready.reduce((s,x)=>s+Number(x.data?.burn||0),0);
      const transactions = ready.reduce((s,x)=>s+Number(x.data?.walletTransactions||0),0);
      value.textContent = api.money(burn, true);
      status.textContent = `${transactions} transaction(s) Wallet · ${ready.length}/${state.walletStores.length} magasin(s) lus directement depuis la transaction de paiement Dynamics.`;
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

  async function loadWallet(force = false) {
    const api = core();
    if (!api || state.walletLoading) return;
    const scope = cashierScope();
    const key = `${scope.start}|${scope.end}|${scope.stores.map(s=>s.id).join(',')}`;
    if (!force && state.walletKey === key) {
      renderWalletStatus();
      renderLoyalty();
      return;
    }

    state.walletLoading = true;
    renderWalletStatus();

    try {
      let cursor = 0;
      const results = new Array(scope.stores.length);
      const worker = async () => {
        while (cursor < scope.stores.length) {
          const i = cursor++;
          const store = scope.stores[i];
          try {
            const qs = new URLSearchParams({ storeId: store.id, start: scope.start, end: scope.end });
            if (force) qs.set('force','1');
            const data = await api.api(`/api/analytics/wallet-range?${qs}`, { noRetry: true });
            results[i] = { store, ok: true, data };
          } catch (error) {
            results[i] = { store, ok: false, error };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, Math.max(1, scope.stores.length)) }, worker));
      state.walletStores = results.filter(Boolean);
      state.walletKey = key;
    } finally {
      state.walletLoading = false;
      renderWalletStatus();
      renderLoyalty();
    }
  }

  function cashierScope() {
    const api = core();
    const appState = api?.getState?.();
    if (!appState) return { stores: [], date: null, start: null, end: null };
    return {
      stores: appState.selectedStore === 'ALL'
        ? appState.stores
        : appState.stores.filter(s => s.id === appState.selectedStore),
      date: appState.businessDate,
      start: appState.periodStart || appState.businessDate,
      end: appState.periodEnd || appState.businessDate
    };
  }

  async function loadCashiers(force = false) {
    const api = core();
    if (!api || state.cashierLoading) return;
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
          const data = await api.api(`/api/stores/${encodeURIComponent(store.id)}/cashier-performance?date=${encodeURIComponent(scope.date)}&days=${state.cashierDays}`);
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
        const item = { ...row, storeId: result.store.id, storeName: result.store.name };
        if (!q || [item.name,item.staffId,item.storeName].some(v=>String(v||'').toLowerCase().includes(q))) rows.push(item);
      }
    }
    return rows.sort((a,b)=>
      Number(b.rateEligible)-Number(a.rateEligible) ||
      Number(b.recruitmentRateNonLoyalty ?? -1)-Number(a.recruitmentRateNonLoyalty ?? -1) ||
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
    const eligible = allItems.filter(x=>x.rateEligible);
    const totalTickets = allItems.reduce((s,x)=>s+Number(x.tickets||0),0);
    const totalRecruitments = allItems.reduce((s,x)=>s+Number(x.recruitments||0),0);
    const weightedIdentification = totalTickets
      ? allItems.reduce((s,x)=>s+Number(x.identifiedTickets||0),0)/totalTickets*100
      : null;

    $('#cashierSummary').innerHTML = [
      ['Caissiers analysés', api.number(allItems.length), `${readyStores.length}/${state.cashierStores.length} magasin(s)`],
      ['Éligibles classement', api.number(eligible.length), 'Seuil volume appliqué'],
      ['Tickets', api.number(totalTickets), `${state.cashierDays} derniers jours`],
      ['Recrutements', api.number(totalRecruitments), weightedIdentification == null ? 'Identification N/A' : api.percent(weightedIdentification) + ' tickets identifiés']
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
        <td>${api.number(r.recruitments)}</td>
        <td>${api.percent(r.recruitmentRateNonLoyalty)}</td>
        <td><span class="eligibility-pill ${r.rateEligible?'':'low'}">${r.rateEligible?'Oui':'Volume faible'}</span></td>
      </tr>
    `).join('');
  }

  function bind() {
    $('#cashierWindow')?.addEventListener('change', e => {
      state.cashierDays = Math.max(1, Math.min(90, Number(e.target.value) || 30));
      state.cashierKey = null;
      loadCashiers(false);
    });

    $('#cashierSearch')?.addEventListener('input', e => {
      state.cashierSearch = e.target.value || '';
      renderCashiers();
    });

    const loadVisibleModule = () => {
      const section = core()?.getState?.()?.section;
      if (section === 'loyalty') {
        renderLoyalty();
        loadWallet(false);
      } else if (section === 'cashiers') {
        loadCashiers(false);
      }
    };

    document.addEventListener('retail-intelligence:data', () => {
      renderLoyalty();
      loadVisibleModule();
    });
    document.addEventListener('retail-intelligence:decision', () => {
      renderLoyalty();
      if (core()?.getState?.()?.section === 'loyalty') loadWallet(false);
    });
    document.addEventListener('retail-intelligence:period', () => {
      state.walletKey = null;
      state.cashierKey = null;
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