(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const PREF_KEY = 'retail-intelligence:prefs:v1';

  const TENANTS = window.RETAIL_INTELLIGENCE_TENANTS || {};

  const state = {
    tenant: 'franprix',
    session: null,
    stores: [],
    pulses: [],
    selectedStore: 'ALL',
    selectedStoreIds: [],
    section: 'overview',
    periodPreset: '7d',
    periodStart: shiftDate(isoDate(new Date()), -6),
    periodEnd: isoDate(new Date()),
    comparisonMode: 'previous_period',
    compareStart: shiftDate(isoDate(new Date()), -13),
    compareEnd: shiftDate(isoDate(new Date()), -7),
    businessDate: isoDate(new Date()),
    sort: { key: 'sales', dir: 'desc' },
    storeSearch: '',
    loading: false,
    savedViews: [],
    prefs: loadPrefs()
  };

  function isoDate(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function shiftDate(iso, days) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return isoDate(d);
  }

  function daysBetween(start, end) {
    const a = Date.parse(`${start}T12:00:00Z`), b = Date.parse(`${end}T12:00:00Z`);
    return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.floor((b - a) / 86400000) + 1 : 1;
  }

  function monthBounds(iso, offset = 0) {
    const d = new Date(`${iso}T12:00:00`);
    const first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
    return { start: isoDate(first), end: isoDate(last) };
  }

  function applyPresetToState(preset = state.periodPreset) {
    const today = isoDate(new Date());
    state.periodPreset = preset;
    if (preset === 'today') state.periodStart = state.periodEnd = today;
    else if (preset === 'yesterday') state.periodStart = state.periodEnd = shiftDate(today, -1);
    else if (preset === '7d') { state.periodEnd = today; state.periodStart = shiftDate(today, -6); }
    else if (preset === '30d') { state.periodEnd = today; state.periodStart = shiftDate(today, -29); }
    else if (preset === 'month') { const m = monthBounds(today, 0); state.periodStart = m.start; state.periodEnd = today; }
    else if (preset === 'previous_month') { const m = monthBounds(today, -1); state.periodStart = m.start; state.periodEnd = m.end; }
    state.businessDate = state.periodEnd;
    applyComparisonToState(state.comparisonMode);
  }

  function applyComparisonToState(mode = state.comparisonMode) {
    state.comparisonMode = mode;
    if (mode === 'custom') return;
    const days = daysBetween(state.periodStart, state.periodEnd);
    if (mode === 'previous_period') {
      state.compareEnd = shiftDate(state.periodStart, -1);
      state.compareStart = shiftDate(state.compareEnd, -(days - 1));
    } else if (mode === 'previous_month') {
      const m = monthBounds(state.periodStart, -1);
      state.compareStart = m.start;
      state.compareEnd = m.end;
    } else if (mode === 'previous_year') {
      const start = new Date(`${state.periodStart}T12:00:00`), end = new Date(`${state.periodEnd}T12:00:00`);
      start.setFullYear(start.getFullYear() - 1); end.setFullYear(end.getFullYear() - 1);
      state.compareStart = isoDate(start); state.compareEnd = isoDate(end);
    }
  }

  function syncPeriodControls() {
    if ($('#periodPreset')) $('#periodPreset').value = state.periodPreset;
    if ($('#periodStart')) $('#periodStart').value = state.periodStart;
    if ($('#periodEnd')) $('#periodEnd').value = state.periodEnd;
    if ($('#comparisonMode')) $('#comparisonMode').value = state.comparisonMode;
    if ($('#compareStart')) $('#compareStart').value = state.compareStart;
    if ($('#compareEnd')) $('#compareEnd').value = state.compareEnd;
    $$('.compare-date-group').forEach(el => el.hidden = state.comparisonMode !== 'custom');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  }

  function money(v, compact = false) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return 'N/A';
    const n = Number(v);
    if (compact && Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace('.', ',')} M DH`;
    if (compact && Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k DH`;
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' DH';
  }

  function number(v, digits = 0) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return 'N/A';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(v));
  }

  function percent(v, digits = 1) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return 'N/A';
    return `${Number(v).toFixed(digits).replace('.', ',')} %`;
  }

  function deltaHtml(v, suffix = '%') {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '<span class="delta flat">N/A</span>';
    const n = Number(v);
    const cls = Math.abs(n) < 0.05 ? 'flat' : n > 0 ? 'up' : 'down';
    const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '▬';
    const sign = n > 0 ? '+' : '';
    return `<span class="delta ${cls}">${arrow} ${sign}${n.toFixed(1).replace('.', ',')}${suffix}</span>`;
  }

  function pctChange(current, previous) {
    const c = Number(current), p = Number(previous);
    return Number.isFinite(c) && Number.isFinite(p) && p !== 0 ? ((c - p) / p) * 100 : null;
  }

  function safe(v) {
    return v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  }

  function loadPrefs() {
    try {
      return {
        density: 'comfortable',
        widgets: {},
        ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
      };
    } catch {
      return { density: 'comfortable', widgets: {} };
    }
  }

  function savePrefs() {
    localStorage.setItem(PREF_KEY, JSON.stringify(state.prefs));
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function api(path, options = {}) {
    if (typeof window.RETAIL_INTELLIGENCE_API === 'function') {
      return window.RETAIL_INTELLIGENCE_API(path, options);
    }
    const res = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      cache: 'no-store'
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `Erreur API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function setupTenantSelect() {
    const select = $('#brandSelect');
    select.innerHTML = Object.entries(TENANTS)
      .map(([key, t]) => `<option value="${key}">${t.label}${t.connected ? '' : ' · à connecter'}</option>`)
      .join('');
    select.value = state.tenant;
    select.addEventListener('change', async () => {
      state.tenant = select.value;
      applyTenant();
      await loadSavedViews();
      await loadTenant();
    });
    applyTenant();
  }

  function applyTenant() {
    const tenant = TENANTS[state.tenant] || TENANTS.franprix;
    if (!tenant) return;
    document.documentElement.style.setProperty('--accent', tenant.accent);
    document.documentElement.style.setProperty('--accent-soft', hexToSoft(tenant.accent));
    $('#brandStatus').textContent = tenant.connected
      ? `Connecté · ${tenant.sourceLabel}`
      : `${tenant.description} · source non branchée`;
    $('#eyebrow').textContent = tenant.connected ? `PERFORMANCE · ${tenant.label.toUpperCase()}` : 'ENSEIGNE À CONNECTER';
    $('#emptyBrandTitle').textContent = `${tenant.label} est prête côté Analytics`;
    $('#emptyBrandText').textContent = `La structure multi-enseigne est en place. Il reste à brancher la source ${tenant.label} pour alimenter les KPIs réels, sans générer de données fictives.`;

    const modules = tenant.modules || {};
    $$('.side-nav button[data-section]').forEach(btn => {
      const section = btn.dataset.section;
      if (Object.prototype.hasOwnProperty.call(modules, section)) btn.hidden = modules[section] === false;
    });

    const storeLabel = tenant.terminology?.store || 'Magasin';
    const storeFilterLabel = $('#storeFilter')?.closest('.filter-group')?.querySelector('label');
    if (storeFilterLabel) storeFilterLabel.textContent = storeLabel;
  }

  function hexToSoft(hex) {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return '#f5f5f5';
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},.08)`;
  }

  async function loadTenant() {
    const tenant = TENANTS[state.tenant];
    const unavailable = $('#brandUnavailable');
    const content = $('#analyticsContent');
    if (!tenant.connected) {
      unavailable.hidden = false;
      content.hidden = true;
      setFreshness('partial', 'Source à connecter');
      return;
    }
    unavailable.hidden = true;
    content.hidden = false;
    await loadData();
  }

  async function bootstrap() {
    setupTenantSelect();
    applyPreferences();
    bindEvents();

    syncPeriodControls();
    updatePeriodSummary();

    try {
      const [session, stores] = await Promise.all([api('/api/session'), api('/api/stores')]);
      state.session = session;
      state.stores = Array.isArray(stores) ? stores : [];
      hydrateStoreFilter();
      await loadSavedViews();
      await loadTenant();
    } catch (error) {
      setFreshness('error', 'Connexion indisponible');
      renderFatal(error);
    }
  }

  function selectedStores(){
    if(!Array.isArray(state.selectedStoreIds)||!state.selectedStoreIds.length)return state.stores;
    const wanted=new Set(state.selectedStoreIds);
    return state.stores.filter(s=>wanted.has(s.id))
  }

  function syncStoreSelectionState(){
    const valid=(state.selectedStoreIds||[]).filter(id=>state.stores.some(s=>s.id===id));
    state.selectedStoreIds=[...new Set(valid)];
    state.selectedStore=state.selectedStoreIds.length===0?'ALL':state.selectedStoreIds.length===1?state.selectedStoreIds[0]:'MULTI';
  }

  function storeScopeLabel(){
    const rows=selectedStores();
    if(!state.selectedStoreIds.length)return 'Tous les magasins';
    if(rows.length===1)return rows[0]?.name||'1 magasin';
    if(rows.length<=3)return rows.map(x=>x.name).join(' + ');
    return `${rows.length} magasins sélectionnés`
  }

  function hydrateStoreFilter() {
    if(!state._storeScopeInitialized){const defaults=(TENANTS[state.tenant]?.defaultStoreIds||[]).filter(id=>state.stores.some(s=>s.id===id));if(defaults.length)state.selectedStoreIds=defaults;state._storeScopeInitialized=true}
    syncStoreSelectionState();
    const host=$('#storeMultiOptions'),all=$('#storeAllCheck'),label=$('#storeSelectionLabel');
    if(host){
      const selected=new Set(state.selectedStoreIds);
      host.innerHTML=state.stores.map(s=>`<label class="store-option"><input type="checkbox" value="${escapeHtml(s.id)}" ${selected.has(s.id)?'checked':''}><span>${escapeHtml(s.name)}</span></label>`).join('');
    }
    if(all)all.checked=state.selectedStoreIds.length===0;
    if(label)label.textContent=storeScopeLabel();
  }

  async function loadData(force = false) {
    if (state.loading) return;
    state.loading = true;

    const targetStores = selectedStores();

    const decisionSections = new Set(['overview','sales','network','categories','suppliers','crm','loyalty','cashiers']);
    const snapshotSections = new Set(['inventory','promotions']);
    if (decisionSections.has(state.section) || snapshotSections.has(state.section)) {
      state.pulses = [];
      const scope = storeScopeLabel();
      if ($('#scopeLabel')) $('#scopeLabel').textContent = scope;
      const snapshotLabel=state.section==='inventory'?`Stock au ${formatDate(state.periodEnd)}`:state.section==='promotions'?`Promotions au ${formatDate(state.periodEnd)}`:'Analyse période';
      setFreshness('live', snapshotSections.has(state.section)?snapshotLabel:'Analyse période');
      document.dispatchEvent(new CustomEvent('retail-intelligence:period', { detail: { state, force, snapshotDate: state.periodEnd } }));
      state.loading = false;
      return;
    }

    setLoading();
    setFreshness('', 'Actualisation…');
    try {
      const results = await Promise.all(targetStores.map(async store => {
        try {
          const pulse = await api(`/api/stores/${encodeURIComponent(store.id)}/business-pulse?date=${state.businessDate}${force ? '&force=1' : ''}`);
          return { store, pulse, ok: pulse?.status === 'READY' };
        } catch (error) {
          return { store, pulse: null, ok: false, error };
        }
      }));
      state.pulses = results;
      renderAll();
    } catch (error) {
      renderFatal(error);
    } finally {
      state.loading = false;
    }
  }

  function readyRows() {
    return state.pulses.filter(r => r.ok && r.pulse?.snapshot?.kpis);
  }

  function aggregate() {
    const rows = readyRows();
    const totalStores = state.pulses.length;
    const ready = rows.length;

    let sales = 0, comparison = 0, tickets = 0, units = 0;
    let identifiedSales = 0, identifiedSalesKnown = 0;
    let nonLoyaltyTickets = 0, recruitments = 0, recruitmentKnown = 0;
    let oos = 0, oosKnown = 0, negative = 0, negativeKnown = 0;
    let refreshedAt = null;

    for (const { pulse } of rows) {
      const k = pulse.snapshot.kpis || {};
      sales += Number(k.netSales || 0);
      comparison += Number(k.comparison || 0);
      tickets += Number(k.tickets || 0);
      units += Number(k.units || 0);

      if (k.identifiedSales != null) {
        identifiedSales += Number(k.identifiedSales || 0);
        identifiedSalesKnown += 1;
      }
      if (k.nonLoyaltyTickets != null) nonLoyaltyTickets += Number(k.nonLoyaltyTickets || 0);
      if (k.recruitments != null) {
        recruitments += Number(k.recruitments || 0);
        recruitmentKnown += 1;
      }
      if (k.outOfStockCount != null) {
        oos += Number(k.outOfStockCount || 0);
        oosKnown += 1;
      }
      if (k.negativeStockCount != null) {
        negative += Number(k.negativeStockCount || 0);
        negativeKnown += 1;
      }
      if (pulse.refreshedAt && (!refreshedAt || pulse.refreshedAt > refreshedAt)) refreshedAt = pulse.refreshedAt;
    }

    const avgBasket = tickets ? sales / tickets : null;
    const change = comparison ? ((sales - comparison) / comparison) * 100 : null;
    const identifiedShare = identifiedSalesKnown ? (sales ? identifiedSales / sales * 100 : null) : null;
    const recruitmentRate = recruitmentKnown && nonLoyaltyTickets ? recruitments / nonLoyaltyTickets * 100 : null;

    return {
      rows, totalStores, ready, sales, comparison, tickets, units, avgBasket, change,
      identifiedSales: identifiedSalesKnown ? identifiedSales : null,
      identifiedShare,
      recruitments: recruitmentKnown ? recruitments : null,
      recruitmentRate,
      oos: oosKnown === ready && ready ? oos : null,
      negative: negativeKnown === ready && ready ? negative : null,
      refreshedAt
    };
  }

  function renderAll() {
    const agg = aggregate();
    updateHeadings(agg);
    updateFreshness(agg);
    renderExecutiveDeck(agg);
    renderAttentionRail(agg);
    renderInsights(agg);
    renderKpis(agg);
    renderHourly(agg);
    renderDrivers(agg);
    renderNetwork();
    renderDepartments();
    renderDataQuality(agg);
  }

  function updateHeadings(agg) {
    const scopedStores=selectedStores();
    const store = scopedStores.length===1 ? scopedStores[0] : null;
    const tenant = TENANTS[state.tenant] || {};
    const storeLabel = tenant.terminology?.store || 'Magasin';
    const sectionCopy = {
      overview: {
        eyebrow: 'VUE EXÉCUTIVE',
        title: store ? `Comment va ${store.name} ?` : 'Comment va le réseau ?',
        subtitle: store
          ? 'Les signaux essentiels pour comprendre la performance du magasin sans parcourir dix écrans.'
          : 'Les signaux essentiels du réseau, hiérarchisés pour comprendre rapidement ce qui accélère, ce qui décroche et où regarder.'
      },
      sales: {
        eyebrow: 'VENTES',
        title: store ? `Dynamique commerciale · ${store.name}` : 'Dynamique commerciale',
        subtitle: 'Chiffre d’affaires, fréquentation, panier et rythme de vente avec comparaison homogène.'
      },
      network: {
        eyebrow: 'RÉSEAU',
        title: 'Comparer les magasins',
        subtitle: `Une lecture homogène des ${storeLabel.toLowerCase()}s pour repérer immédiatement les écarts de performance.`
      },
      categories: {
        eyebrow: 'CATÉGORIES & PRODUITS',
        title: 'Comprendre ce qui se vend vraiment',
        subtitle: 'Du département au SKU : poids, rang, évolution et concentration du chiffre d’affaires.'
      },
      crm: {
        eyebrow: 'CLIENTS & CRM',
        title: 'Qui sont mes clients ?',
        subtitle: 'Valeur, fréquence, concentration et comportements d’achat sur la période sélectionnée.'
      },
      inventory: {
        eyebrow: 'STOCK',
        title: 'Disponibilité & risque commercial',
        subtitle: `Photo de stock au ${formatDate(state.periodEnd)} uniquement : ruptures, couverture et risque commercial. La période sélectionnée n'est pas additionnée au stock.`
      },
      loyalty: {
        eyebrow: 'FIDÉLITÉ',
        title: 'Valeur client & recrutement',
        subtitle: 'Identification, panier membre, recrutement et burn Wallet lorsque la source paiement est disponible.'
      },
      cashiers: {
        eyebrow: 'CAISSIERS',
        title: 'Performance fidélité par staff',
        subtitle: 'Identifier les écarts de recrutement et d’identification en tenant compte du volume traité.'
      },
      promotions: {
        eyebrow: 'PROMOTIONS',
        title: 'Promotion Control Tower',
        subtitle: 'Suivre les offres, la profondeur de remise, leur validité et leur exposition au risque stock.'
      }
    };
    const copy = sectionCopy[state.section] || sectionCopy.overview;

    $('#scopeLabel').textContent = store ? store.name : `${agg.ready}/${agg.totalStores} magasins disponibles`;
    $('#dateLabel').textContent = state.periodStart === state.periodEnd ? formatDate(state.periodEnd) : `${formatDate(state.periodStart)} → ${formatDate(state.periodEnd)}`;
    $('#eyebrow').textContent = `${copy.eyebrow} · ${String(tenant.label || '').toUpperCase()}`;
    $('#pageTitle').textContent = copy.title;
    $('#pageSubtitle').textContent = copy.subtitle;
  }

  function updateFreshness(agg) {
    if (!agg.totalStores || !agg.ready) {
      setFreshness('error', 'Données indisponibles');
      return;
    }
    const partial = agg.ready < agg.totalStores;
    const time = agg.refreshedAt ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(agg.refreshedAt)) : '—';
    setFreshness(partial ? 'partial' : 'live', partial ? `${agg.ready}/${agg.totalStores} · ${time}` : `À jour · ${time}`);
  }

  function setFreshness(tone, text) {
    const pill = $('#freshnessPill');
    pill.classList.remove('live', 'partial', 'error');
    if (tone) pill.classList.add(tone);
    $('#freshnessText').textContent = text;
  }

  function executiveDriverChanges() {
    const rows = readyRows();
    const trafficValues = rows.map(r => safe(r.pulse?.analysis?.trafficChangePct)).filter(v => v != null);
    const basketValues = rows.map(r => safe(r.pulse?.analysis?.basketChangePct)).filter(v => v != null);
    const avg = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    return { traffic: avg(trafficValues), basket: avg(basketValues) };
  }

  function signedPercentHtml(value) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="executive-trend neutral">N/A</span>';
    const n = Number(value);
    const cls = Math.abs(n) < .05 ? 'neutral' : n > 0 ? 'positive' : 'negative';
    const symbol = cls === 'positive' ? '↗' : cls === 'negative' ? '↘' : '→';
    const sign = n > 0 ? '+' : '';
    return `<span class="executive-trend ${cls}">${symbol} ${sign}${n.toFixed(1).replace('.', ',')} %</span>`;
  }

  function renderExecutiveDeck(a) {
    if (!$('#executiveDeck')) return;
    const drivers = executiveDriverChanges();
    const gap = a.comparison != null ? a.sales - a.comparison : null;

    $('#executiveSalesValue').textContent = money(a.sales, true);
    $('#executiveSalesDelta').innerHTML = signedPercentHtml(a.change);
    $('#executiveComparisonValue').textContent = a.comparison == null ? 'N/A' : money(a.comparison, true);
    $('#executiveSalesGap').textContent = gap == null ? 'N/A' : `${gap > 0 ? '+' : ''}${money(gap, true)}`;
    $('#executiveSalesGap').className = gap == null ? '' : gap > 0 ? 'executive-positive' : gap < 0 ? 'executive-negative' : '';
    $('#executiveScopeValue').textContent = state.selectedStoreIds.length===0
      ? `${a.ready}/${a.totalStores} magasins`
      : storeScopeLabel();

    $('#executiveTickets').textContent = number(a.tickets);
    $('#executiveTrafficDelta').innerHTML = signedPercentHtml(drivers.traffic);
    $('#executiveBasket').textContent = money(a.avgBasket);
    $('#executiveBasketDelta').innerHTML = signedPercentHtml(drivers.basket);

    const trafficWidth = drivers.traffic == null ? 12 : Math.max(8, Math.min(100, 50 + drivers.traffic * 2.2));
    const basketWidth = drivers.basket == null ? 12 : Math.max(8, Math.min(100, 50 + drivers.basket * 2.2));
    $('#executiveTrafficBar').style.width = `${trafficWidth}%`;
    $('#executiveBasketBar').style.width = `${basketWidth}%`;
    $('#executiveTrafficBar').className = drivers.traffic != null && drivers.traffic < 0 ? 'negative' : '';
    $('#executiveBasketBar').className = drivers.basket != null && drivers.basket < 0 ? 'negative' : '';

    $('#healthLoyalty').textContent = percent(a.identifiedShare);
    if ($('#healthCustomers')) $('#healthCustomers').textContent = 'N/A';
    if ($('#healthRepeat')) $('#healthRepeat').textContent = 'N/A';
    $('#healthCoverage').textContent = a.totalStores ? `${Math.round(a.ready / a.totalStores * 100)} %` : 'N/A';

    let health = 'Stable';
    let tone = 'stable';
    if (a.change != null && a.change >= 5 && (a.oos == null || a.oos < 20)) {
      health = 'Solide';
      tone = 'strong';
    } else if ((a.change != null && a.change < -5) || (a.oos != null && a.oos >= 30)) {
      health = 'Sous tension';
      tone = 'risk';
    } else if ((a.change != null && a.change > 0) || (a.identifiedShare != null && a.identifiedShare >= 45)) {
      health = 'En progression';
      tone = 'positive';
    }
    const healthLabel = $('#executiveHealthLabel');
    healthLabel.textContent = health;
    healthLabel.className = `health-label ${tone}`;
  }

  function renderAttentionRail(a) {
    const host = $('#attentionItems');
    if (!host) return;

    const items = [];
    const stores = networkRows().filter(r => r.status === 'READY');

    const worst = [...stores]
      .filter(r => r.change != null)
      .sort((x, y) => x.change - y.change)[0];

    if (worst && worst.change < 0) {
      items.push({
        tone: 'negative',
        label: worst.name,
        text: `${worst.change.toFixed(1).replace('.', ',')} % vs J-7`,
        target: 'network'
      });
    }

    if (a.oos != null && a.oos > 0) {
      items.push({
        tone: a.oos >= 20 ? 'negative' : 'warning',
        label: 'Ruptures',
        text: `${number(a.oos)} référence(s) à surveiller`,
        target: 'inventory'
      });
    }

    if (a.identifiedShare != null && a.identifiedShare < 40) {
      items.push({
        tone: 'warning',
        label: 'Fidélité',
        text: `Seulement ${percent(a.identifiedShare)} du CA identifié`,
        target: 'loyalty'
      });
    }

    if (a.recruitmentRate != null && a.recruitmentRate < 8) {
      items.push({
        tone: 'warning',
        label: 'Recrutement',
        text: `${percent(a.recruitmentRate)} des tickets recrutables`,
        target: 'loyalty'
      });
    }

    if (a.ready < a.totalStores) {
      items.push({
        tone: 'neutral',
        label: 'Data',
        text: `${a.ready}/${a.totalStores} magasins disponibles`,
        target: 'dataQuality'
      });
    }

    if (!items.length) {
      items.push({
        tone: 'positive',
        label: 'Réseau',
        text: 'Aucun signal prioritaire détecté sur les métriques disponibles',
        target: 'overview'
      });
    }

    host.innerHTML = items.slice(0, 4).map(item => `
      <button class="attention-item ${item.tone}" data-attention-target="${item.target}">
        <span class="attention-item-label">${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.text)}</strong>
        <span class="attention-arrow">→</span>
      </button>
    `).join('');

    $$('[data-attention-target]', host).forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.attentionTarget;
        const node = target === 'network' ? $('[data-widget="network"]')
          : target === 'inventory' ? $('#inventoryIntelligence')
          : target === 'loyalty' ? $('#loyaltyIntelligence')
          : target === 'dataQuality' ? $('[data-widget="dataQuality"]')
          : $('.hero');
        node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderKpis(a) {
    const cards = [
      { label: 'CA TTC', value: money(a.sales, true), delta: a.change, compare: 'vs J-7', progress: 82 },
      { label: 'Tickets', value: number(a.tickets), delta: null, compare: `${a.ready} magasin(s)`, progress: 66 },
      { label: 'Panier moyen', value: money(a.avgBasket), delta: null, compare: 'périmètre courant', progress: 58 },
      { label: 'CA fidélisé', value: percent(a.identifiedShare), delta: null, compare: a.identifiedSales == null ? 'source indisponible' : money(a.identifiedSales, true), progress: a.identifiedShare || 0 },
      { label: 'Recrutements', value: number(a.recruitments), delta: null, compare: a.recruitmentRate == null ? 'taux N/A' : `${percent(a.recruitmentRate)} recrutables`, progress: Math.min(a.recruitmentRate || 0, 100) },
      { label: 'Ruptures', value: number(a.oos), delta: null, compare: a.oos == null ? 'calcul en attente' : 'vendu 30j + stock 0', progress: a.oos == null ? 0 : Math.min(a.oos, 100) }
    ];

    $('#kpiGrid').innerHTML = cards.map(c => `
      <article class="kpi-card">
        <div>
          <div class="kpi-top">
            <span class="kpi-label">${c.label}</span>
            <span class="kpi-badge">${c.compare}</span>
          </div>
          <div class="kpi-value">${c.value}</div>
        </div>
        <div class="kpi-foot">
          ${c.delta == null ? '<span class="delta flat">—</span>' : deltaHtml(c.delta)}
          <div class="mini-bar"><span style="width:${Math.max(0, Math.min(c.progress, 100))}%"></span></div>
        </div>
      </article>
    `).join('');
  }

  function renderInsights(a) {
    const items = [];

    if (a.change != null) {
      items.push({
        tone: a.change >= 0 ? 'positive' : 'negative',
        title: `Le CA est ${a.change >= 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(a.change).toFixed(1).replace('.', ',')} % vs J-7.`,
        detail: `${money(a.sales)} aujourd'hui contre ${money(a.comparison)} sur la comparaison.`
      });
    }

    const storeRows = networkRows().filter(r => r.status === 'READY' && r.change != null);
    const best = [...storeRows].sort((x, y) => y.change - x.change)[0];
    const worst = [...storeRows].sort((x, y) => x.change - y.change)[0];
    if (best && selectedStores().length > 1) {
      items.push({
        tone: best.change >= 0 ? 'positive' : 'warning',
        title: `${best.name} affiche la meilleure dynamique réseau.`,
        detail: `${best.change >= 0 ? '+' : ''}${best.change.toFixed(1).replace('.', ',')} % vs J-7 · ${money(best.sales)} de CA.`
      });
    }
    if (worst && best?.storeId !== worst.storeId && selectedStores().length > 1) {
      items.push({
        tone: worst.change < 0 ? 'negative' : 'warning',
        title: `${worst.name} est le magasin à surveiller en priorité.`,
        detail: `${worst.change >= 0 ? '+' : ''}${worst.change.toFixed(1).replace('.', ',')} % vs J-7.`
      });
    }

    if (a.oos != null) {
      items.push({
        tone: a.oos > 0 ? 'warning' : 'positive',
        title: a.oos > 0 ? `${number(a.oos)} rupture(s) détectée(s) sur le périmètre.` : 'Aucune rupture détectée sur le périmètre.',
        detail: 'Règle actuelle : produit vendu sur la fenêtre de référence avec stock magasin à zéro.'
      });
    }

    if (a.identifiedShare != null) {
      items.push({
        tone: a.identifiedShare >= 45 ? 'positive' : 'warning',
        title: `${percent(a.identifiedShare)} du CA est identifié fidélité.`,
        detail: a.recruitments == null ? 'Recrutements non disponibles.' : `${number(a.recruitments)} nouveau(x) recrutement(s) sur la date.`
      });
    }

    const selected = items.slice(0, 3);
    if (!selected.length) {
      $('#insightsGrid').innerHTML = '<div class="insight"><div><strong>Pas assez de données pour générer un insight fiable.</strong><span>Les valeurs indisponibles ne sont pas remplacées par zéro.</span></div></div>';
      return;
    }

    $('#insightsGrid').innerHTML = selected.map((x, i) => `
      <div class="insight ${x.tone}">
        <div class="insight-index">${String(i + 1).padStart(2, '0')}</div>
        <div><strong>${x.title}</strong><span>${x.detail}</span></div>
      </div>
    `).join('');
  }

  function aggregateHourly() {
    const map = new Map();
    for (const { pulse } of readyRows()) {
      for (const row of pulse.snapshot?.breakdowns?.hourly || []) {
        const key = String(row.label || row.key || '');
        map.set(key, (map.get(key) || 0) + Number(row.sales || 0));
      }
    }
    return [...map.entries()]
      .map(([label, sales]) => ({ label, sales }))
      .sort((a, b) => hourKey(a.label) - hourKey(b.label));
  }

  function hourKey(label) {
    const m = String(label).match(/(\d{1,2})/);
    return m ? Number(m[1]) : 99;
  }

  function renderHourly(a) {
    const data = aggregateHourly();
    const svg = $('#hourlyChart');
    const empty = $('#hourlyEmpty');
    $('#salesDeltaMini').innerHTML = a.change == null ? 'Comparaison N/A' : deltaHtml(a.change);
    $('#chartCoverage').textContent = `${a.ready}/${a.totalStores} magasin(s) inclus`;

    if (!data.length) {
      svg.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const w = 900, h = 290, pad = { l: 48, r: 18, t: 16, b: 36 };
    const max = Math.max(...data.map(d => d.sales), 1);
    const x = i => pad.l + (i * (w - pad.l - pad.r)) / Math.max(data.length - 1, 1);
    const y = v => h - pad.b - (v / max) * (h - pad.t - pad.b);

    let html = '';
    for (let i = 0; i <= 4; i++) {
      const val = max * (1 - i / 4);
      const yy = pad.t + i * (h - pad.t - pad.b) / 4;
      html += `<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}"></line>`;
      html += `<text class="chart-axis" x="${pad.l - 8}" y="${yy + 3}" text-anchor="end">${money(val, true).replace(' DH','')}</text>`;
    }

    const points = data.map((d, i) => [x(i), y(d.sales)]);
    const linePath = points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
    const areaPath = `${linePath} L ${x(data.length - 1)} ${h - pad.b} L ${x(0)} ${h - pad.b} Z`;
    html += `<path class="chart-area" d="${areaPath}"></path><path class="chart-line" d="${linePath}"></path>`;

    data.forEach((d, i) => {
      const showLabel = data.length <= 12 || i % 2 === 0;
      html += `<circle class="chart-dot" cx="${x(i)}" cy="${y(d.sales)}" r="4"><title>${d.label} · ${money(d.sales)}</title></circle>`;
      if (showLabel) html += `<text class="chart-axis" x="${x(i)}" y="${h - 12}" text-anchor="middle">${escapeHtml(d.label)}</text>`;
    });
    svg.innerHTML = html;
  }

  function renderDrivers(a) {
    const rows = readyRows();
    const trafficValues = rows.map(r => safe(r.pulse?.analysis?.trafficChangePct)).filter(v => v != null);
    const basketValues = rows.map(r => safe(r.pulse?.analysis?.basketChangePct)).filter(v => v != null);
    const avg = values => values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const traffic = avg(trafficValues);
    const basket = avg(basketValues);

    const drivers = [
      {
        label: 'Variation CA',
        value: a.change,
        note: 'Comparaison J-7 consolidée'
      },
      {
        label: 'Effet fréquentation',
        value: traffic,
        note: traffic == null ? 'Comparaison tickets indisponible' : 'Moyenne des variations magasins'
      },
      {
        label: 'Effet panier',
        value: basket,
        note: basket == null ? 'Comparaison panier indisponible' : 'Moyenne des variations magasins'
      },
      {
        label: 'Poids fidélisé',
        value: a.identifiedShare,
        note: 'Part du CA avec client identifié'
      }
    ];

    const max = Math.max(...drivers.map(d => Math.abs(d.value || 0)), 1);
    $('#driversList').innerHTML = drivers.map(d => `
      <div class="driver">
        <div class="driver-head"><span>${d.label}</span><span class="driver-value">${d.value == null ? 'N/A' : percent(d.value)}</span></div>
        <div class="driver-track"><span style="width:${d.value == null ? 0 : Math.min(Math.abs(d.value) / max * 100, 100)}%;background:${d.value != null && d.value < 0 ? 'var(--danger)' : 'var(--accent)'}"></span></div>
        <small>${d.note}</small>
      </div>
    `).join('');
  }

  function networkRows() {
    return state.pulses.map(({ store, pulse, ok, error }) => {
      if (!ok || !pulse?.snapshot?.kpis) {
        return {
          storeId: store.id, name: store.name, code: store.code, status: 'UNAVAILABLE',
          sales: null, change: null, tickets: null, basket: null, identifiedShare: null,
          recruitments: null, recruitmentRate: null, oos: null, negative: null,
          error: pulse?.error?.message || error?.message || 'Source indisponible'
        };
      }
      const k = pulse.snapshot.kpis;
      return {
        storeId: store.id, name: store.name, code: store.code, status: 'READY',
        sales: safe(k.netSales),
        change: safe(k.changeVsComparison),
        tickets: safe(k.tickets),
        basket: safe(k.averageBasket),
        identifiedShare: safe(k.identifiedSalesShare),
        recruitments: safe(k.recruitments),
        recruitmentRate: safe(k.recruitmentRateNonLoyalty),
        oos: safe(k.outOfStockCount),
        negative: safe(k.negativeStockCount),
        refreshedAt: pulse.refreshedAt,
        coverage: pulse.snapshot?.dataCoverage || null
      };
    });
  }

  function renderNetwork() {
    const body = $('#networkBody');
    let rows = networkRows().filter(r => r.name.toLowerCase().includes(state.storeSearch.toLowerCase()));

    const { key, dir } = state.sort;
    rows.sort((a, b) => {
      const av = key === 'name' ? a.name : a[key];
      const bv = key === 'name' ? b.name : b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv, 'fr') : av - bv;
      return dir === 'asc' ? cmp : -cmp;
    });

    const ready = rows.filter(r => r.status === 'READY').length;
    $('#networkCoverage').textContent = `${ready}/${rows.length} disponible(s)`;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="11"><div class="table-loading">Aucun magasin trouvé.</div></td></tr>';
      return;
    }

    body.innerHTML = rows.map(r => {
      if (r.status !== 'READY') {
        return `<tr>
          <td><div class="store-name"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.code || '')}</span></div></td>
          <td colspan="9" style="text-align:left;color:var(--muted)">Données indisponibles — ${escapeHtml(r.error)}</td>
          <td><span class="quality-pill error">Indisponible</span></td>
        </tr>`;
      }
      const quality = r.coverage?.ubResolved != null && r.coverage?.products
        ? Math.round(r.coverage.ubResolved / Math.max(r.coverage.products, 1) * 100)
        : null;
      const qualityClass = quality == null ? 'partial' : quality >= 90 ? '' : quality >= 70 ? 'partial' : 'error';
      return `<tr data-store="${r.storeId}">
        <td><div class="store-name"><strong>${escapeHtml(r.name)}</strong><span>${escapeHtml(r.code || '')}</span></div></td>
        <td><strong>${money(r.sales, true)}</strong></td>
        <td>${deltaHtml(r.change)}</td>
        <td>${number(r.tickets)}</td>
        <td>${money(r.basket)}</td>
        <td>${percent(r.identifiedShare)}</td>
        <td>${number(r.recruitments)}</td>
        <td>${percent(r.recruitmentRate)}</td>
        <td>${number(r.oos)}</td>
        <td>${number(r.negative)}</td>
        <td><span class="quality-pill ${qualityClass}">${quality == null ? 'Partiel' : quality + '% UB'}</span></td>
      </tr>`;
    }).join('');

    $$('tbody tr[data-store]', body).forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        state.selectedStoreIds=[tr.dataset.store];
        syncStoreSelectionState();
        hydrateStoreFilter();
        loadData();
      });
    });
  }

  function aggregateDepartments() {
    const map = new Map();
    for (const { pulse } of readyRows()) {
      for (const row of pulse.snapshot?.breakdowns?.departments || []) {
        const key = String(row.label || row.key || 'Non classé');
        map.set(key, (map.get(key) || 0) + Number(row.sales || 0));
      }
    }
    return [...map.entries()].map(([label, sales]) => ({ label, sales })).sort((a, b) => b.sales - a.sales);
  }

  function renderDepartments() {
    const rows = aggregateDepartments().slice(0, 8);
    const wrap = $('#departmentBars');
    if (!rows.length) {
      wrap.innerHTML = '<div class="table-loading">Hiérarchie indisponible sur ce périmètre.</div>';
      return;
    }
    const max = Math.max(...rows.map(r => r.sales), 1);
    wrap.innerHTML = rows.map(r => `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</div>
        <div class="bar-track"><span style="width:${r.sales / max * 100}%"></span></div>
        <div class="bar-value">${money(r.sales, true)}</div>
      </div>
    `).join('');
  }

  function renderDataQuality(a) {
    const rows = readyRows();
    let products = 0, namesResolved = 0, ubResolved = 0;
    let sourceRows = 0;
    for (const { pulse } of rows) {
      const c = pulse.snapshot?.dataCoverage || {};
      products += Number(c.products || 0);
      namesResolved += Number(c.namesResolved || 0);
      ubResolved += Number(c.ubResolved || 0);
      sourceRows += Number(pulse.diagnostics?.includedRows || 0);
    }

    const cards = [
      { label: 'Magasins', value: `${a.ready}/${a.totalStores}`, sub: a.ready === a.totalStores ? 'Couverture complète' : 'Couverture partielle' },
      { label: 'Lignes ventes', value: number(sourceRows), sub: 'Lignes incluses dans le calcul' },
      { label: 'Noms produits', value: products ? percent(namesResolved / products * 100, 0) : 'N/A', sub: `${number(namesResolved)} / ${number(products)} résolus` },
      { label: 'Hiérarchie UB', value: products ? percent(ubResolved / products * 100, 0) : 'N/A', sub: `${number(ubResolved)} / ${number(products)} classés` }
    ];

    $('#dataQualityGrid').innerHTML = cards.map(c => `
      <div class="quality-card"><small>${c.label}</small><strong>${c.value}</strong><span>${c.sub}</span></div>
    `).join('');
  }

  function setLoading() {
    $('#kpiGrid').innerHTML = Array.from({ length: 6 }, () => '<div class="kpi-card skeleton-card"></div>').join('');
    $('#insightsGrid').innerHTML = '<div class="skeleton insight-skeleton"></div><div class="skeleton insight-skeleton"></div><div class="skeleton insight-skeleton"></div>';
    $('#networkBody').innerHTML = '<tr><td colspan="11"><div class="table-loading">Chargement du réseau…</div></td></tr>';
    $('#driversList').innerHTML = '<div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:72px"></div>';
  }

  function renderFatal(error) {
    $('#analyticsContent').innerHTML = `
      <section class="empty-product">
        <div class="empty-icon">!</div>
        <h1>Analytics n'a pas pu charger les données</h1>
        <p>${escapeHtml(error?.message || 'Erreur inconnue')}. Aucune valeur n'a été remplacée artificiellement par zéro.</p>
      </section>`;
  }

  function updatePeriodSummary() {
    const current = state.periodStart === state.periodEnd ? formatDate(state.periodEnd) : `${formatDate(state.periodStart)} → ${formatDate(state.periodEnd)}`;
    const compare = state.compareStart === state.compareEnd ? formatDate(state.compareEnd) : `${formatDate(state.compareStart)} → ${formatDate(state.compareEnd)}`;
    $('#periodSummary').textContent = `Période : ${current} · comparaison : ${compare}`;
  }

  async function refreshForPeriod(force = false) {
    state.businessDate = state.periodEnd;
    syncPeriodControls();
    updatePeriodSummary();
    await loadData(force);
  }

  function bindEvents() {
    $('#storeAllCheck')?.addEventListener('change',e=>{
      if(e.target.checked)state.selectedStoreIds=[];
      else if(!state.selectedStoreIds.length)state.selectedStoreIds=state.stores.slice(0,1).map(s=>s.id);
      syncStoreSelectionState();hydrateStoreFilter();refreshForPeriod(false)
    });
    $('#storeMultiOptions')?.addEventListener('change',e=>{
      const input=e.target.closest('input[type="checkbox"]');if(!input)return;
      const selected=new Set(state.selectedStoreIds);
      if(input.checked)selected.add(input.value);else selected.delete(input.value);
      state.selectedStoreIds=[...selected];syncStoreSelectionState();hydrateStoreFilter();refreshForPeriod(false)
    });

    $('#periodPreset')?.addEventListener('change', e => {
      if (e.target.value === 'custom') {
        state.periodPreset = 'custom';
        syncPeriodControls();
        return;
      }
      applyPresetToState(e.target.value);
      refreshForPeriod(false);
    });

    $('#periodStart')?.addEventListener('change', e => {
      state.periodPreset = 'custom';
      state.periodStart = e.target.value || state.periodStart;
      if (state.periodStart > state.periodEnd) state.periodEnd = state.periodStart;
      applyComparisonToState(state.comparisonMode);
      refreshForPeriod(false);
    });

    $('#periodEnd')?.addEventListener('change', e => {
      state.periodPreset = 'custom';
      state.periodEnd = e.target.value || state.periodEnd;
      if (state.periodEnd < state.periodStart) state.periodStart = state.periodEnd;
      applyComparisonToState(state.comparisonMode);
      refreshForPeriod(false);
    });

    $('#comparisonMode')?.addEventListener('change', e => {
      applyComparisonToState(e.target.value);
      syncPeriodControls();
      if (state.comparisonMode !== 'custom') refreshForPeriod(false);
    });

    $('#compareStart')?.addEventListener('change', e => {
      state.compareStart = e.target.value || state.compareStart;
      updatePeriodSummary();
      refreshForPeriod(false);
    });
    $('#compareEnd')?.addEventListener('change', e => {
      state.compareEnd = e.target.value || state.compareEnd;
      updatePeriodSummary();
      refreshForPeriod(false);
    });

    $('#refreshBtn').addEventListener('click', () => refreshForPeriod(false));

    $('#storeSearch').addEventListener('input', e => {
      state.storeSearch = e.target.value || '';
      renderNetwork();
    });

    $$('.network-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        else state.sort = { key, dir: key === 'name' ? 'asc' : 'desc' };
        renderNetwork();
      });
    });

    $('#exportBtn').addEventListener('click', exportCsv);

    $('#customizeBtn').addEventListener('click', openDrawer);
    $('#closeDrawer').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    $('#mobileFiltersBtn').addEventListener('click', () => {
      document.body.classList.toggle('mobile-nav-open');
    });

    $$('[data-widget-toggle]').forEach(input => {
      input.addEventListener('change', e => {
        state.prefs.widgets[e.target.dataset.widgetToggle] = e.target.checked;
        savePrefs();
        applyPreferences();
      });
    });

    $('#densitySelect').addEventListener('change', e => {
      state.prefs.density = e.target.value;
      savePrefs();
      applyPreferences();
    });

    $('#saveViewBtn')?.addEventListener('click', saveCurrentView);
    $('#applyViewBtn')?.addEventListener('click', applySavedView);
    $('#deleteViewBtn')?.addEventListener('click', deleteSavedView);
    $('#savedViewName')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveCurrentView();
    });

    $('#resetPrefs').addEventListener('click', () => {
      localStorage.removeItem(PREF_KEY);
      state.prefs = { density: 'comfortable', widgets: {} };
      applyPreferences();
      toast('Vue locale réinitialisée');
    });

    $$('.side-nav button:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        state.section = btn.dataset.section || 'overview';
        applySectionView();
        document.body.classList.remove('mobile-nav-open');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        refreshForPeriod(false);
      });
    });
  }

  function currentViewPayload() {
    return {
      tenant: state.tenant,
      selectedStore: state.selectedStore,
      selectedStoreIds: [...state.selectedStoreIds],
      section: state.section,
      businessDate: state.businessDate,
      periodPreset: state.periodPreset,
      periodStart: state.periodStart,
      periodEnd: state.periodEnd,
      comparisonMode: state.comparisonMode,
      compareStart: state.compareStart,
      compareEnd: state.compareEnd,
      prefs: JSON.parse(JSON.stringify(state.prefs || {}))
    };
  }

  async function loadSavedViews() {
    const select = $('#savedViewsSelect');
    if (!select) return;
    try {
      const data = await api(`/api/analytics/views?tenant=${encodeURIComponent(state.tenant)}`);
      state.savedViews = Array.isArray(data?.items) ? data.items : [];
      renderSavedViews();
      const status = $('#savedViewsStatus');
      if (status) status.textContent = state.savedViews.length
        ? `${state.savedViews.length} vue(s) enregistrée(s) pour ${TENANTS[state.tenant]?.label || state.tenant}.`
        : 'Aucune vue enregistrée pour cette enseigne.';
    } catch (error) {
      state.savedViews = [];
      renderSavedViews();
      const status = $('#savedViewsStatus');
      if (status) status.textContent = `Vues indisponibles : ${error?.message || 'erreur de lecture'}`;
    }
  }

  function renderSavedViews() {
    const select = $('#savedViewsSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Choisir une vue…</option>' +
      state.savedViews.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join('');
    if (state.savedViews.some(v => v.id === current)) select.value = current;
  }

  async function saveCurrentView() {
    const input = $('#savedViewName');
    const name = String(input?.value || '').trim();
    if (!name) return toast('Donne un nom à la vue');
    const btn = $('#saveViewBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
    try {
      const saved = await api(`/api/analytics/views?tenant=${encodeURIComponent(state.tenant)}`, {
        method: 'POST',
        body: { name, payload: currentViewPayload() }
      });
      if (input) input.value = '';
      await loadSavedViews();
      if ($('#savedViewsSelect')) $('#savedViewsSelect').value = saved.id || '';
      toast(`Vue « ${name} » enregistrée`);
    } catch (error) {
      toast(error?.message || 'Impossible d’enregistrer la vue');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
  }

  async function applySavedView() {
    const id = $('#savedViewsSelect')?.value;
    const view = state.savedViews.find(v => v.id === id);
    if (!view) return toast('Choisis une vue sauvegardée');
    const payload = view.payload || {};

    if (payload.tenant && TENANTS[payload.tenant]) {
      state.tenant = payload.tenant;
      $('#brandSelect').value = state.tenant;
      applyTenant();
    }

    state.section = SECTION_WIDGETS[payload.section] ? payload.section : state.section;
    state.periodPreset = payload.periodPreset || state.periodPreset;
    state.periodStart = payload.periodStart || payload.businessDate || state.periodStart;
    state.periodEnd = payload.periodEnd || payload.businessDate || state.periodEnd;
    state.comparisonMode = payload.comparisonMode || state.comparisonMode;
    state.compareStart = payload.compareStart || state.compareStart;
    state.compareEnd = payload.compareEnd || state.compareEnd;
    state.businessDate = state.periodEnd;
    syncPeriodControls();

    state.prefs = {
      density: 'comfortable',
      widgets: {},
      ...(payload.prefs || {})
    };
    savePrefs();
    applyPreferences();

    const requestedIds=Array.isArray(payload.selectedStoreIds)?payload.selectedStoreIds.filter(id=>state.stores.some(s=>s.id===id)):[];
    if(requestedIds.length)state.selectedStoreIds=requestedIds;
    else{
      const requestedStore=payload.selectedStore||'ALL';
      state.selectedStoreIds=requestedStore!=='ALL'&&state.stores.some(s=>s.id===requestedStore)?[requestedStore]:[];
    }
    syncStoreSelectionState();
    hydrateStoreFilter();

    updatePeriodSummary();
    closeDrawer();
    await loadTenant();
    toast(`Vue « ${view.name} » appliquée`);
  }

  async function deleteSavedView() {
    const id = $('#savedViewsSelect')?.value;
    const view = state.savedViews.find(v => v.id === id);
    if (!view) return toast('Choisis une vue à supprimer');
    try {
      await api(`/api/analytics/views/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadSavedViews();
      toast(`Vue « ${view.name} » supprimée`);
    } catch (error) {
      toast(error?.message || 'Suppression impossible');
    }
  }

  document.addEventListener('click', e => {
    if (!document.body.classList.contains('mobile-nav-open')) return;
    const sidebar = $('.sidebar');
    const trigger = $('#mobileFiltersBtn');
    if (sidebar?.contains(e.target) || trigger?.contains(e.target)) return;
    document.body.classList.remove('mobile-nav-open');
  });

  function openDrawer() {
    document.body.classList.remove('mobile-nav-open');
    loadSavedViews();
    $('#customizeDrawer').classList.add('open');
    $('#customizeDrawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').hidden = false;
  }

  function closeDrawer() {
    $('#customizeDrawer').classList.remove('open');
    $('#customizeDrawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').hidden = true;
  }

  const SECTION_WIDGETS = {
    overview: ['executiveDeck','storeBenchmark'],
    sales: ['decisionSales'],
    network: ['storeBenchmark'],
    categories: ['productPerformance'],
    suppliers: ['supplierIntelligence'],
    crm: ['crmIntelligence'],
    inventory: ['inventory'],
    loyalty: ['loyalty'],
    cashiers: ['cashiers'],
    promotions: ['promotions']
  };

  function applySectionView() {
    const allowed = new Set(SECTION_WIDGETS[state.section] || SECTION_WIDGETS.overview);
    document.body.dataset.analyticsSection = state.section;

    $$('[data-widget]').forEach(el => {
      const key = el.dataset.widget;
      if (key === 'hero') {
        el.hidden = false;
        return;
      }
      const inSection = allowed.has(key);
      const enabled = state.prefs.widgets[key] !== false;
      el.hidden = !(inSection && enabled);
    });

    const salesGrid = $('#salesOverviewGrid');
    if (salesGrid) {
      const anyVisible = !($('[data-widget="hourly"]')?.hidden ?? true) || !($('[data-widget="mix"]')?.hidden ?? true);
      salesGrid.hidden = !(allowed.has('hourly') || allowed.has('mix')) || !anyVisible;
    }

    const bottomGrid = $('#overviewBottomGrid');
    if (bottomGrid) {
      const anyVisible = !($('[data-widget="departments"]')?.hidden ?? true) || !($('[data-widget="dataQuality"]')?.hidden ?? true);
      bottomGrid.hidden = state.section !== 'overview' || !anyVisible;
    }

    $$('.side-nav button[data-section]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === state.section);
    });

    const agg = aggregate();
    updateHeadings(agg);
    document.dispatchEvent(new CustomEvent('retail-intelligence:section', { detail: { section: state.section } }));
  }

  function applyPreferences() {
    document.body.classList.toggle('compact', state.prefs.density === 'compact');
    $('#densitySelect').value = state.prefs.density || 'comfortable';
    $$('[data-widget-toggle]').forEach(input => {
      input.checked = state.prefs.widgets[input.dataset.widgetToggle] !== false;
    });
    applySectionView();
  }

  async function downloadCsv(filename,rows){
    const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const file=new File([blob],filename,{type:'text/csv;charset=utf-8'});
    // iOS/Safari is much more reliable when the native share sheet handles the file.
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:'Retail Intelligence',text:'Export Retail Intelligence'});return{shared:true}}
      catch(error){if(error?.name==='AbortError')return{shared:false,cancelled:true}}
    }
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);return{shared:false}
  }

  function visibleTableRows(){
    const tables=$$('main [data-widget]:not([hidden]) table').filter(t=>t.offsetParent!==null);
    const rows=[];
    for(const table of tables){
      const title=table.closest('[data-widget]')?.querySelector('h2,h3')?.textContent?.trim()||state.section;
      if(rows.length)rows.push([]);
      rows.push([title]);
      const headers=$$('thead th',table).map(th=>th.textContent.trim());if(headers.length)rows.push(headers);
      for(const tr of $$('tbody tr',table)){
        const cells=$$('td',tr).map(td=>td.textContent.replace(/\s+/g,' ').trim());
        if(cells.length&&cells.some(Boolean))rows.push(cells)
      }
    }
    return rows
  }

  function decisionFallbackRows(){
    const d=window.RETAIL_DECISION_INTELLIGENCE?.getData?.();if(!d)return[];
    const cur=d.summary?.current||{},prev=d.summary?.previous||{};
    return[
      ['Indicateur','Période','Comparaison'],
      ['CA',cur.sales,prev.sales],['Tickets',cur.tickets,prev.tickets],['Panier moyen',cur.averageBasket,prev.averageBasket],
      ['Marge',cur.marginValue,prev.marginValue],['Taux marge',cur.marginRate,prev.marginRate],['Poids CA fidélisé',cur.identifiedSalesShare,prev.identifiedSalesShare]
    ]
  }

  async function exportCsv() {
    let rows=visibleTableRows();
    if(!rows.length)rows=decisionFallbackRows();
    if(!rows.length)return toast('Aucune donnée visible à exporter');
    const scope=state.selectedStoreIds.length?state.selectedStoreIds.join('-'):'reseau';
    const result=await downloadCsv(`retail-intelligence-${state.section}-${scope}-${state.periodStart}-${state.periodEnd}.csv`,rows);
    if(!result?.cancelled)toast(result?.shared?'Export prêt à partager':'Export de la vue généré');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.RETAIL_INTELLIGENCE = {
    getState: () => state,
    getSelectedStores: () => selectedStores(),
    getStoreScopeKey: () => state.selectedStoreIds.length ? [...state.selectedStoreIds].sort().join(',') : 'ALL',
    getStoreScopeLabel: () => storeScopeLabel(),
    api,
    money,
    number,
    percent,
    escapeHtml,
    readyRows,
    aggregate,
    reload: () => loadData(true)
  };
  window.ONE_RETAIL_ANALYTICS = window.RETAIL_INTELLIGENCE;

  document.addEventListener('retail-intelligence:rendered', () => {});
  const originalRenderAll = renderAll;
  renderAll = function(){
    originalRenderAll();
    document.dispatchEvent(new CustomEvent('retail-intelligence:data', { detail: { state } }));
  };

  bootstrap();
})();