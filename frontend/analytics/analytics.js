(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const PREF_KEY = 'one-retail-intelligence:prefs:v1';

  const TENANTS = {
    franprix: {
      label: 'Franprix',
      accent: '#e5004f',
      connected: true,
      sourceLabel: 'Dynamics 365 / Commerce',
      description: 'Réseau Franprix Maroc'
    },
    flormar: {
      label: 'Flormar',
      accent: '#d9175b',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Beauté & cosmétique'
    },
    mrbricolage: {
      label: 'Mr.Bricolage',
      accent: '#e53935',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Maison & bricolage'
    },
    venezia: {
      label: 'Venezia Ice',
      accent: '#8b5e3c',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Restauration & glace'
    },
    dahab: {
      label: 'Dahab',
      accent: '#b88a2a',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Retail'
    },
    beautyforyou: {
      label: 'Beauty For You',
      accent: '#a92b73',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Beauté'
    },
    intersport: {
      label: 'Intersport',
      accent: '#1d5fbf',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Sport'
    },
    primor: {
      label: 'Primor',
      accent: '#2c2c2c',
      connected: false,
      sourceLabel: 'À connecter',
      description: 'Beauté'
    }
  };

  const state = {
    tenant: 'franprix',
    session: null,
    stores: [],
    pulses: [],
    selectedStore: 'ALL',
    businessDate: isoDate(new Date()),
    sort: { key: 'sales', dir: 'desc' },
    storeSearch: '',
    loading: false,
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

  async function api(path) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
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
      await loadTenant();
    });
    applyTenant();
  }

  function applyTenant() {
    const tenant = TENANTS[state.tenant];
    document.documentElement.style.setProperty('--accent', tenant.accent);
    document.documentElement.style.setProperty('--accent-soft', hexToSoft(tenant.accent));
    $('#brandStatus').textContent = tenant.connected
      ? `Connecté · ${tenant.sourceLabel}`
      : `${tenant.description} · source non branchée`;
    $('#eyebrow').textContent = tenant.connected ? `PERFORMANCE · ${tenant.label.toUpperCase()}` : 'ENSEIGNE À CONNECTER';
    $('#emptyBrandTitle').textContent = `${tenant.label} est prête côté Analytics`;
    $('#emptyBrandText').textContent = `La structure multi-enseigne est en place. Il reste à brancher la source ${tenant.label} pour alimenter les KPIs réels, sans générer de données fictives.`;
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

    $('#businessDate').value = state.businessDate;
    updatePeriodSummary();

    try {
      const [session, stores] = await Promise.all([api('/api/session'), api('/api/stores')]);
      state.session = session;
      state.stores = Array.isArray(stores) ? stores : [];
      hydrateStoreFilter();
      await loadTenant();
    } catch (error) {
      setFreshness('error', 'Connexion indisponible');
      renderFatal(error);
    }
  }

  function hydrateStoreFilter() {
    const select = $('#storeFilter');
    const current = state.selectedStore;
    select.innerHTML = '<option value="ALL">Tous les magasins</option>' +
      state.stores.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    select.value = state.stores.some(s => s.id === current) ? current : 'ALL';
    state.selectedStore = select.value;
  }

  async function loadData(force = false) {
    if (state.loading) return;
    state.loading = true;
    setLoading();
    setFreshness('', 'Actualisation…');

    const targetStores = state.selectedStore === 'ALL'
      ? state.stores
      : state.stores.filter(s => s.id === state.selectedStore);

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
    renderInsights(agg);
    renderKpis(agg);
    renderHourly(agg);
    renderDrivers(agg);
    renderNetwork();
    renderDepartments();
    renderDataQuality(agg);
  }

  function updateHeadings(agg) {
    const store = state.selectedStore === 'ALL'
      ? null
      : state.stores.find(s => s.id === state.selectedStore);
    $('#scopeLabel').textContent = store ? store.name : `${agg.ready}/${agg.totalStores} magasins disponibles`;
    $('#dateLabel').textContent = formatDate(state.businessDate);
    $('#pageTitle').textContent = store ? `Comment va ${store.name} ?` : 'Comment va le réseau ?';
    $('#pageSubtitle').textContent = store
      ? 'Performance commerciale, fidélité et signaux de stock sur le magasin sélectionné.'
      : 'Lecture consolidée du réseau avec comparaison J-7 et possibilité de descendre au magasin.';
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
    if (best && state.selectedStore === 'ALL') {
      items.push({
        tone: best.change >= 0 ? 'positive' : 'warning',
        title: `${best.name} affiche la meilleure dynamique réseau.`,
        detail: `${best.change >= 0 ? '+' : ''}${best.change.toFixed(1).replace('.', ',')} % vs J-7 · ${money(best.sales)} de CA.`
      });
    }
    if (worst && best?.storeId !== worst.storeId && state.selectedStore === 'ALL') {
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
        state.selectedStore = tr.dataset.store;
        $('#storeFilter').value = state.selectedStore;
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
    $('#periodSummary').textContent = `Période : ${formatDate(state.businessDate)} · comparaison : ${formatDate(shiftDate(state.businessDate, -7))}`;
  }

  function bindEvents() {
    $('#storeFilter').addEventListener('change', e => {
      state.selectedStore = e.target.value;
      loadData();
    });

    $('#businessDate').addEventListener('change', e => {
      state.businessDate = e.target.value || isoDate(new Date());
      $('#periodPreset').value = 'date';
      updatePeriodSummary();
      loadData();
    });

    $('#periodPreset').addEventListener('change', e => {
      const v = e.target.value;
      if (v === 'today') state.businessDate = isoDate(new Date());
      if (v === 'yesterday') state.businessDate = shiftDate(isoDate(new Date()), -1);
      $('#businessDate').value = state.businessDate;
      updatePeriodSummary();
      if (v !== 'date') loadData();
    });

    $('#refreshBtn').addEventListener('click', () => loadData(true));

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
      $('#filterbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    $('#resetPrefs').addEventListener('click', () => {
      localStorage.removeItem(PREF_KEY);
      state.prefs = { density: 'comfortable', widgets: {} };
      applyPreferences();
      toast('Vue réinitialisée');
    });

    $$('.side-nav button:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.side-nav button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        const section = btn.dataset.section;
        const target = section === 'network'
          ? $('[data-widget="network"]')
          : section === 'sales'
            ? $('[data-widget="hourly"]')
            : $('.hero');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function openDrawer() {
    $('#customizeDrawer').classList.add('open');
    $('#customizeDrawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').hidden = false;
  }

  function closeDrawer() {
    $('#customizeDrawer').classList.remove('open');
    $('#customizeDrawer').setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').hidden = true;
  }

  function applyPreferences() {
    document.body.classList.toggle('compact', state.prefs.density === 'compact');
    $('#densitySelect').value = state.prefs.density || 'comfortable';
    $$('[data-widget]').forEach(el => {
      const key = el.dataset.widget;
      if (key === 'hero') return;
      const visible = state.prefs.widgets[key] !== false;
      el.hidden = !visible;
    });
    $$('[data-widget-toggle]').forEach(input => {
      input.checked = state.prefs.widgets[input.dataset.widgetToggle] !== false;
    });
  }

  function exportCsv() {
    const rows = networkRows();
    if (!rows.length) return toast('Aucune donnée à exporter');
    const headers = ['Magasin','Code','CA TTC','Delta CA %','Tickets','Panier moyen','CA fidélisé %','Recrutements','Taux recrutement %','Ruptures','Stock négatif','Statut'];
    const body = rows.map(r => [
      r.name, r.code, r.sales, r.change, r.tickets, r.basket, r.identifiedShare,
      r.recruitments, r.recruitmentRate, r.oos, r.negative, r.status
    ]);
    const csv = [headers, ...body]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `one-retail-analytics-${state.tenant}-${state.businessDate}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Export réseau généré');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  bootstrap();
})();