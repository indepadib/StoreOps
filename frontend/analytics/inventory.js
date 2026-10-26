(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const core = () => window.RETAIL_INTELLIGENCE || window.ONE_RETAIL_ANALYTICS;
  function withTimeout(promise,ms,label='Source'){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error(`${label} trop lente (> ${Math.round(ms/1000)} s)`);e.code='ANALYTICS_OPTIONAL_TIMEOUT';reject(e)},ms)})]).finally(()=>clearTimeout(timer))}

  const state = {
    view: 'all',
    search: '',
    loading: false,
    loadedKey: null,
    rows: [],
    stores: [],
    summaries: []
  };

  function safeNumber(v) {
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  }

  function signalLabel(type) {
    return {
      OUT: 'Rupture',
      LOW: 'Faible couverture',
      NEGATIVE: 'Stock négatif',
      GHOST: 'Stock fantôme',
      OUTSIDE_ASSORTMENT: 'Hors assortiment'
    }[type] || type || 'Signal';
  }

  function currentScope() {
    const c = core();
    const appState = c?.getState?.();
    if (!appState) return { stores: [], businessDate: null, selectedStore: 'ALL' };
    const stores = c.getSelectedStores?.() || appState.stores || [];
    return {
      stores,
      businessDate: new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),
      selectedStore: appState.selectedStore,
      selectedStoreIds: appState.selectedStoreIds || []
    };
  }

  async function load(force = false) {
    const c = core();
    if (!c || state.loading) return;
    const scope = currentScope();
    const key = `${scope.businessDate}|${scope.stores.map(s => s.id).join(',')}`;
    if (!force && state.loadedKey === key) {
      render();
      return;
    }

    state.loading = true;
    setLoading();

    try {
      const results = await Promise.all(scope.stores.map(async store => {
        try {
          const data = await withTimeout(c.api(`/api/stores/${encodeURIComponent(store.id)}/stock-signals?date=${encodeURIComponent(scope.businessDate)}${force ? '&force=1' : ''}`,{noRetry:true}),25000,'Image stock D365');
          return { store, ok: true, data };
        } catch (error) {
          return { store, ok: false, error };
        }
      }));

      state.rows = [];
      state.summaries = [];
      state.stores = results;

      for (const result of results) {
        if (!result.ok) continue;
        state.summaries.push({
          storeId: result.store.id,
          storeName: result.store.name,
          summary: result.data?.summary || {},
          source: result.data?.source || null,
          checkedAt: result.data?.checkedAt || null
        });
        for (const item of result.data?.items || []) {
          state.rows.push({
            ...item,
            storeId: result.store.id,
            storeName: result.store.name,
            source: result.data?.source || null,
            checkedAt: result.data?.checkedAt || null
          });
        }
      }

      state.loadedKey = key;
      const badge=$('#inventorySnapshotBadge'),checked=state.summaries.map(x=>x.checkedAt).filter(Boolean).sort().at(-1);
      if(badge)badge.textContent=checked?`Image stock D365 · ${new Date(checked).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'Image stock D365 · dernière disponibilité';
      render();
      window.RETAIL_INVENTORY = {
        getState: () => state,
        getStockForProduct,
        reload: () => load(true)
      };
      document.dispatchEvent(new CustomEvent('retail-intelligence:inventory', { detail: { state } }));
    } finally {
      state.loading = false;
    }
  }

  function aggregateSummary() {
    const available = state.summaries.length;
    const totalStores = state.stores.length;

    const sumKnown = key => {
      if (!available) return null;
      const vals = state.summaries.map(x => safeNumber(x.summary?.[key]));
      if (vals.some(v => v == null)) return null;
      return vals.reduce((s, v) => s + v, 0);
    };

    return {
      available,
      totalStores,
      out: sumKnown('outOfStock'),
      low: sumKnown('nearOutOfStock'),
      negative: sumKnown('negative'),
      ghost: sumKnown('ghostStock'),
      total: sumKnown('total'),
      risk: sumKnown('salesRisk24h'),
      warehouseRecoverable: sumKnown('recoverableWarehouseRisk24h'),
      supplierRisk: sumKnown('supplierRisk24h'),
      unknownRisk: sumKnown('unknownSupplyRisk24h')
    };
  }

  function setLoading() {
    const kpis = $('#inventoryKpis');
    const body = $('#inventoryBody');
    if (kpis) kpis.innerHTML = Array.from({ length: 6 }, () => '<div class="inventory-kpi skeleton-card"></div>').join('');
    if (body) body.innerHTML = '<tr><td colspan="9"><div class="table-loading">Chargement des signaux stock…</div></td></tr>';
  }

  function render() {
    renderKpis();
    renderTable();
    renderRisk();
    renderCoverage();
  }

  function renderKpis() {
    const c = core();
    const s = aggregateSummary();
    if (!$('#inventoryKpis')) return;

    const cards = [
      { label: 'Ruptures', value: c.number(s.out), sub: 'Vendu récemment + stock 0', tone: s.out > 0 ? 'danger' : '' },
      { label: 'Faible couverture', value: c.number(s.low), sub: 'Sous le seuil de couverture', tone: s.low > 0 ? 'warning' : '' },
      { label: 'Stock négatif', value: c.number(s.negative), sub: 'Anomalie stock à analyser', tone: s.negative > 0 ? 'danger' : '' },
      { label: 'Stock fantôme', value: c.number(s.ghost), sub: 'Stock positif + silence de vente', tone: s.ghost > 0 ? 'warning' : '' },
      { label: 'Risque 24h', value: c.money(s.risk, true), sub: 'ESTIMATION basée sur ventes récentes', tone: s.risk > 0 ? 'warning' : '' },
      { label: 'Couverture data', value: `${s.available}/${s.totalStores}`, sub: s.available === s.totalStores ? 'Tous les magasins lus' : 'Lecture partielle', tone: s.available === s.totalStores ? '' : 'warning' }
    ];

    $('#inventoryKpis').innerHTML = cards.map(card => `
      <div class="inventory-kpi ${card.tone}">
        <small>${card.label}</small>
        <strong>${card.value}</strong>
        <span>${card.sub}</span>
      </div>
    `).join('');
  }

  function filteredRows() {
    const q = state.search.trim().toLowerCase();
    const priority = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return state.rows
      .filter(row => state.view === 'all' || row.type === state.view)
      .filter(row => !q || [
        row.product,
        row.productNumber,
        row.ean,
        row.supplier,
        row.supplierAccount,
        row.storeName,
        row.rayonLabel
      ].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) =>
        (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9) ||
        Number(b.salesRisk24h || 0) - Number(a.salesRisk24h || 0) ||
        Number(a.coverageDays ?? 9999) - Number(b.coverageDays ?? 9999)
      );
  }

  function renderTable() {
    const c = core();
    const body = $('#inventoryBody');
    if (!body) return;
    const rows = filteredRows();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="table-loading">Aucun signal sur ce filtre. Les absences de données ne sont pas remplacées par zéro.</div></td></tr>';
      return;
    }

    body.innerHTML = rows.slice(0, 300).map(row => {
      const stock = safeNumber(row.availableQty);
      const coverage = safeNumber(row.coverageDays);
      const sales30 = safeNumber(row.salesValue30d);
      const risk = safeNumber(row.salesRisk24h);
      const source = row.supplyMode === 'WAREHOUSE'
        ? `DC · ${row.supplyWarehouse || 'entrepôt'}`
        : row.supplyMode === 'DIRECT_SUPPLIER'
          ? 'Direct fournisseur'
          : 'Source à confirmer';

      return `<tr data-product="${c.escapeHtml(row.productNumber || '')}">
        <td><span class="priority-pill ${row.priority || ''}">${c.escapeHtml(row.priority || '—')}</span></td>
        <td>
          <div class="inventory-product">
            <strong title="${c.escapeHtml(row.product || row.productNumber)}">${c.escapeHtml(row.product || row.productNumber)}</strong>
            <small>${c.escapeHtml(row.productNumber || '')}${row.ean ? ' · ' + c.escapeHtml(row.ean) : ''}</small>
          </div>
        </td>
        <td>${c.escapeHtml(row.storeName)}</td>
        <td><span class="signal-pill ${row.type || ''}">${c.escapeHtml(signalLabel(row.type))}</span></td>
        <td>${stock == null ? '<span class="stock-na">N/A</span>' : c.number(stock, 2)}</td>
        <td>${coverage == null ? '<span class="stock-na">N/A</span>' : c.number(coverage, 1) + ' j'}</td>
        <td>${sales30 == null ? '<span class="stock-na">N/A</span>' : c.money(sales30, true)}</td>
        <td>${risk == null ? '<span class="stock-na">N/A</span>' : c.money(risk, true)}</td>
        <td>
          <div class="inventory-source">
            <strong>${c.escapeHtml(source)}</strong>
            <span>${row.supplier ? c.escapeHtml(row.supplier) : row.supplierAccount ? c.escapeHtml(row.supplierAccount) : 'fournisseur N/A'}</span>
          </div>
        </td>
      </tr>`;
    }).join('');

    $$('tr[data-product]', body).forEach(tr => {
      tr.addEventListener('click', () => {
        const productNumber = tr.dataset.product;
        if (productNumber) document.dispatchEvent(new CustomEvent('retail-intelligence:open-product', { detail: { productNumber } }));
      });
    });
  }

  function renderRisk() {
    const c = core();
    const s = aggregateSummary();
    const host = $('#riskBreakdown');
    if (!host) return;

    host.innerHTML = `
      <div class="risk-total">${c.money(s.risk, true)}</div>
      <div class="risk-caption">ESTIMATION du CA journalier exposé. Ce montant n'est pas une perte comptable constatée.</div>
      <div class="risk-list">
        <div class="risk-row"><span>Récupérable depuis entrepôt</span><strong>${c.money(s.warehouseRecoverable, true)}</strong></div>
        <div class="risk-row"><span>Risque fournisseur</span><strong>${c.money(s.supplierRisk, true)}</strong></div>
        <div class="risk-row"><span>Source supply inconnue</span><strong>${c.money(s.unknownRisk, true)}</strong></div>
      </div>
    `;
  }

  function renderCoverage() {
    const c = core();
    const counts = new Map();
    for (const row of state.rows) counts.set(row.type, (counts.get(row.type) || 0) + 1);
    const ordered = ['OUT', 'LOW', 'NEGATIVE', 'GHOST', 'OUTSIDE_ASSORTMENT'];
    const host = $('#coverageBreakdown');
    if (!host) return;

    host.innerHTML = `<div class="coverage-list">${ordered
      .filter(type => counts.has(type))
      .map(type => `
        <div class="coverage-row">
          <span>${signalLabel(type)}</span>
          <strong>${c.number(counts.get(type))}</strong>
        </div>
      `).join('') || '<div class="table-loading">Aucun signal disponible.</div>'}</div>`;
  }

  function getStockForProduct(productNumber) {
    const key = String(productNumber || '').trim();
    return state.rows
      .filter(row => String(row.productNumber || '').trim() === key)
      .map(row => ({
        storeId: row.storeId,
        storeName: row.storeName,
        type: row.type,
        priority: row.priority,
        availableQty: safeNumber(row.availableQty),
        physicalQty: safeNumber(row.physicalQty),
        coverageDays: safeNumber(row.coverageDays),
        centralStock: safeNumber(row.centralStock),
        supplyMode: row.supplyMode || null,
        supplyWarehouse: row.supplyWarehouse || null,
        supplier: row.supplier || null,
        supplierAccount: row.supplierAccount || null,
        ean: row.ean || null,
        lastSaleDate: row.lastSaleDate || null,
        lastSaleDaysAgo: safeNumber(row.lastSaleDaysAgo),
        salesValue30d: safeNumber(row.salesValue30d),
        salesUnits30: safeNumber(row.salesUnits30),
        dailySales: safeNumber(row.dailySales),
        salesRisk24h: safeNumber(row.salesRisk24h),
        rayonLabel: row.rayonLabel || null
      }));
  }

  function bind() {
    $$('#inventoryTabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#inventoryTabs button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        state.view = btn.dataset.stockView || 'all';
        renderTable();
      });
    });

    $('#inventorySearch')?.addEventListener('input', e => {
      state.search = e.target.value || '';
      renderTable();
    });

    document.addEventListener('retail-intelligence:data', () => {
      if(core()?.getState?.()?.section==='inventory')load(false)
    });
    document.addEventListener('retail-intelligence:section', () => {
      if(core()?.getState?.()?.section==='inventory')load(false)
    });

    const existing = core()?.getState?.();
    if (existing?.section==='inventory') load(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();