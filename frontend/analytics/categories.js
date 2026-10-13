(() => {
  const core = () => window.ONE_RETAIL_ANALYTICS;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const ui = {
    level: 'department',
    search: ''
  };

  const LABELS = {
    department: 'Départements',
    rayon: 'Rayons',
    family: 'Familles',
    subfamily: 'Sous-familles',
    subsubfamily: 'Sous-sous-familles',
    product: 'Produits'
  };

  function ready() {
    return core()?.readyRows?.() || [];
  }

  function safe(v) {
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
  }

  function aggregateHierarchy(level) {
    if (level === 'product') return aggregateProducts();

    const map = new Map();
    for (const { pulse } of ready()) {
      const rows = pulse?.snapshot?.hierarchyRankings?.[level] || [];
      for (const row of rows) {
        const key = String(row.key ?? row.label ?? 'UNKNOWN');
        const cur = map.get(key) || {
          key,
          label: row.label || key,
          sales: 0,
          previous: 0,
          previousKnown: false,
          units: 0,
          articles: 0,
          unclassified: row.unclassified === true
        };
        cur.sales += Number(row.sales || 0);
        cur.units += Number(row.units || 0);
        cur.articles += Number(row.articles || 0);
        if (row.previous !== null && row.previous !== undefined) {
          cur.previous += Number(row.previous || 0);
          cur.previousKnown = true;
        }
        map.set(key, cur);
      }
    }

    return rankRows([...map.values()]);
  }

  function aggregateProducts() {
    const current = new Map();
    const previous = new Map();

    for (const { store, pulse } of ready()) {
      for (const row of pulse?.snapshot?.breakdowns?.products || []) {
        const key = String(row.key || '');
        if (!key) continue;
        const cur = current.get(key) || {
          key,
          label: row.label || key,
          sales: 0,
          previous: 0,
          previousKnown: false,
          units: 0,
          articles: 1,
          hierarchy: row.hierarchy || null,
          rayonLabel: row.rayonLabel || null,
          identityStatus: row.identityStatus || null,
          stores: []
        };
        cur.sales += Number(row.sales || 0);
        cur.units += Number(row.units || 0);
        cur.hierarchy = cur.hierarchy || row.hierarchy || null;
        cur.rayonLabel = cur.rayonLabel || row.rayonLabel || null;
        cur.stores.push({
          id: store.id,
          name: store.name,
          sales: Number(row.sales || 0),
          units: Number(row.units || 0)
        });
        current.set(key, cur);
      }

      for (const row of pulse?.snapshot?.hierarchyPreviousProducts || []) {
        const key = String(row.key || '');
        if (!key) continue;
        previous.set(key, (previous.get(key) || 0) + Number(row.sales || 0));
      }
    }

    for (const [key, row] of current.entries()) {
      if (previous.has(key)) {
        row.previous = previous.get(key);
        row.previousKnown = true;
      }
    }

    for (const [key, prev] of previous.entries()) {
      if (!current.has(key)) {
        current.set(key, {
          key,
          label: key,
          sales: 0,
          previous: prev,
          previousKnown: true,
          units: 0,
          articles: 1,
          hierarchy: null,
          rayonLabel: null,
          identityStatus: 'MISSING',
          stores: []
        });
      }
    }

    return rankRows([...current.values()]);
  }

  function rankRows(rows) {
    const currentSorted = [...rows].sort((a, b) => b.sales - a.sales || a.label.localeCompare(b.label, 'fr'));
    currentSorted.forEach((row, i) => row.rank = i + 1);

    const previousEligible = rows.filter(r => r.previousKnown);
    const previousSorted = [...previousEligible].sort((a, b) => b.previous - a.previous || a.label.localeCompare(b.label, 'fr'));
    const previousRank = new Map(previousSorted.map((row, i) => [row.key, i + 1]));

    const total = currentSorted.reduce((sum, row) => sum + Number(row.sales || 0), 0);

    return currentSorted.map(row => {
      const prevRank = previousRank.get(row.key) ?? null;
      const changePct = row.previousKnown && row.previous
        ? ((row.sales - row.previous) / row.previous) * 100
        : row.previousKnown && row.previous === 0 && row.sales > 0
          ? null
          : null;

      return {
        ...row,
        sharePct: total ? row.sales / total * 100 : null,
        previousRank: prevRank,
        rankDelta: prevRank == null ? null : prevRank - row.rank,
        changePct
      };
    });
  }

  function filteredRows() {
    const rows = aggregateHierarchy(ui.level);
    const q = ui.search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      String(row.label || '').toLowerCase().includes(q) ||
      String(row.key || '').toLowerCase().includes(q)
    );
  }

  function rankDeltaHtml(delta, previousRank) {
    if (previousRank == null) return '<span class="rank-move flat">Nouveau</span>';
    if (delta > 0) return `<span class="rank-move up">▲ +${delta}</span>`;
    if (delta < 0) return `<span class="rank-move down">▼ ${Math.abs(delta)}</span>`;
    return '<span class="rank-move flat">▬ Stable</span>';
  }

  function deltaHtml(change) {
    if (change == null || !Number.isFinite(Number(change))) return '<span class="rank-move flat">N/A</span>';
    const n = Number(change);
    if (Math.abs(n) < .05) return '<span class="rank-move flat">▬ 0,0 %</span>';
    return n > 0
      ? `<span class="rank-move up">▲ +${n.toFixed(1).replace('.', ',')} %</span>`
      : `<span class="rank-move down">▼ ${Math.abs(n).toFixed(1).replace('.', ',')} %</span>`;
  }

  function render() {
    if (!core()) return;
    renderTable();
    renderSummary();
    renderPareto();
    renderMovers();
  }

  function renderTable() {
    const api = core();
    const body = $('#categoryBody');
    if (!body) return;

    const rows = filteredRows();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="table-loading">Aucune donnée disponible pour ce niveau.</div></td></tr>';
      return;
    }

    body.innerHTML = rows.slice(0, 250).map(row => {
      const subtitle = ui.level === 'product'
        ? row.key
        : row.unclassified
          ? 'Non classé'
          : row.key;

      return `<tr class="${ui.level === 'product' ? 'product-row' : ''}" data-key="${api.escapeHtml(row.key)}">
        <td><span class="category-rank">${row.rank}</span></td>
        <td>
          <div class="category-name">
            <div class="category-name-main">
              <strong>${api.escapeHtml(row.label)}</strong>
              <small>${api.escapeHtml(subtitle)}</small>
            </div>
          </div>
        </td>
        <td><strong>${api.money(row.sales, true)}</strong></td>
        <td>${deltaHtml(row.changePct)}</td>
        <td><span class="share-pill">${api.percent(row.sharePct)}</span></td>
        <td>${api.number(row.units, 1)}</td>
        <td>${ui.level === 'product' ? '1' : api.number(row.articles)}</td>
        <td>${row.previousRank == null ? '—' : '#' + row.previousRank}</td>
        <td>${rankDeltaHtml(row.rankDelta, row.previousRank)}</td>
      </tr>`;
    }).join('');

    if (ui.level === 'product') {
      $$('.product-row', body).forEach(tr => {
        tr.addEventListener('click', () => openProduct(tr.dataset.key));
      });
    }
  }

  function renderSummary() {
    const api = core();
    const rows = aggregateHierarchy(ui.level);
    const sales = rows.reduce((s, r) => s + Number(r.sales || 0), 0);
    const top10 = rows.slice(0, 10).reduce((s, r) => s + Number(r.sales || 0), 0);
    const topShare = sales ? top10 / sales * 100 : null;
    let cumulative = 0;
    let count80 = 0;
    for (const row of rows) {
      cumulative += Number(row.sales || 0);
      count80 += 1;
      if (sales && cumulative / sales >= .8) break;
    }

    $('#categorySummary').innerHTML = [
      ['Niveau', LABELS[ui.level], `${api.number(rows.length)} lignes`],
      ['CA analysé', api.money(sales, true), 'Périmètre courant'],
      ['Poids Top 10', api.percent(topShare), 'Concentration CA'],
      ['Seuil 80 %', api.number(count80), `${ui.level === 'product' ? 'SKU' : LABELS[ui.level].toLowerCase()} nécessaires`]
    ].map(([label, value, sub]) => `
      <div class="category-stat">
        <small>${label}</small>
        <strong>${value}</strong>
        <span>${sub}</span>
      </div>
    `).join('');
  }

  function renderPareto() {
    const api = core();
    const products = aggregateProducts();
    const total = products.reduce((s, r) => s + Number(r.sales || 0), 0);
    const shareN = n => total ? products.slice(0, n).reduce((s, r) => s + Number(r.sales || 0), 0) / total * 100 : null;

    let cumulative = 0;
    let count80 = 0;
    for (const row of products) {
      cumulative += Number(row.sales || 0);
      count80++;
      if (total && cumulative / total >= .8) break;
    }

    $('#paretoSummary').innerHTML = total
      ? `<strong>${api.number(count80)} SKU</strong> génèrent 80 % du CA sur <strong>${api.number(products.length)}</strong> références vendues.`
      : 'Données produit insuffisantes pour calculer la concentration.';

    const values = [
      ['Top 10', shareN(10)],
      ['Top 20', shareN(20)],
      ['Top 50', shareN(50)]
    ];

    $('#paretoBars').innerHTML = values.map(([label, value]) => `
      <div class="pareto-row">
        <span>${label}</span>
        <div class="pareto-track"><span style="width:${Math.max(0, Math.min(Number(value || 0), 100))}%"></span></div>
        <span class="pareto-value">${api.percent(value)}</span>
      </div>
    `).join('');
  }

  function renderMovers() {
    const api = core();
    const rows = aggregateHierarchy(ui.level)
      .filter(r => r.previousRank != null && r.rankDelta !== 0)
      .sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta))
      .slice(0, 6);

    if (!rows.length) {
      $('#categoryMovers').innerHTML = '<div class="table-loading">Pas assez d’historique comparable.</div>';
      return;
    }

    $('#categoryMovers').innerHTML = rows.map(row => `
      <div class="mover">
        <div class="mover-name">
          <strong title="${api.escapeHtml(row.label)}">${api.escapeHtml(row.label)}</strong>
          <span>#${row.previousRank} → #${row.rank}</span>
        </div>
        <div class="mover-delta">${rankDeltaHtml(row.rankDelta, row.previousRank)}</div>
      </div>
    `).join('');
  }

  function openProduct(key) {
    const api = core();
    const products = aggregateProducts();
    const product = products.find(p => p.key === key);
    if (!product) return;

    const hierarchy = product.hierarchy?.levels || {};
    const stores = [...(product.stores || [])].sort((a, b) => b.sales - a.sales);
    const averagePrice = product.units ? product.sales / product.units : null;
    const previous = product.previousKnown ? product.previous : null;
    const change = previous ? (product.sales - previous) / previous * 100 : null;
    const ub = product.hierarchy?.ub || hierarchy.ub?.id || null;

    $('#productDrawerTitle').textContent = product.label;
    $('#productDrawerMeta').textContent = `${product.key} · rang #${product.rank} · ${stores.length} magasin(s)`;

    const fact = (label, value) => `<div class="product-fact"><span>${label}</span><strong>${api.escapeHtml(value ?? 'N/A')}</strong></div>`;
    const hierarchyFacts = [
      ['ItemId', product.key],
      ['UB', ub || 'N/A'],
      ['Département', hierarchy.department?.label || 'N/A'],
      ['Rayon', hierarchy.rayon?.label || product.rayonLabel || 'N/A'],
      ['Famille', hierarchy.family?.label || 'N/A'],
      ['Sous-famille', hierarchy.subfamily?.label || 'N/A'],
      ['Sous-sous-famille', hierarchy.subsubfamily?.label || 'N/A'],
      ['Qualité identité', product.identityStatus || 'N/A']
    ];

    $('#productDrawerBody').innerHTML = `
      <div class="product-grid">
        <div class="product-card"><small>CA</small><strong>${api.money(product.sales, true)}</strong><span>Périmètre sélectionné</span></div>
        <div class="product-card"><small>Δ CA</small><strong>${api.percent(change)}</strong><span>vs J-7</span></div>
        <div class="product-card"><small>Quantité</small><strong>${api.number(product.units, 1)}</strong><span>Unités vendues</span></div>
        <div class="product-card"><small>Prix moyen</small><strong>${api.money(averagePrice)}</strong><span>CA / quantité</span></div>
      </div>

      <div class="product-section">
        <h3>Identité & hiérarchie</h3>
        <div class="product-facts">
          ${hierarchyFacts.map(([l, v]) => fact(l, v)).join('')}
        </div>
      </div>

      <div class="product-section">
        <h3>Performance par magasin</h3>
        <div class="product-store-list">
          ${stores.length ? stores.map(s => `
            <div class="product-store">
              <strong>${api.escapeHtml(s.name)}</strong>
              <span>${api.money(s.sales, true)}</span>
              <span>${api.number(s.units, 1)} u.</span>
            </div>
          `).join('') : '<div class="table-loading">Pas de vente sur le périmètre courant.</div>'}
        </div>
      </div>

      <div class="product-note">
        Stock, couverture, fournisseur, EAN et prix catalogue ne sont pas inventés ici :
        ils seront affichés dès que le module Product 360 sera branché aux sources article / stock correspondantes.
      </div>
    `;

    $('#productDrawer').classList.add('open');
    $('#productDrawer').setAttribute('aria-hidden', 'false');
    $('#productBackdrop').hidden = false;
  }

  function closeProduct() {
    $('#productDrawer')?.classList.remove('open');
    $('#productDrawer')?.setAttribute('aria-hidden', 'true');
    if ($('#productBackdrop')) $('#productBackdrop').hidden = true;
  }

  function bind() {
    $$('#categoryLevelTabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#categoryLevelTabs button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        ui.level = btn.dataset.level;
        render();
      });
    });

    $('#categorySearch')?.addEventListener('input', e => {
      ui.search = e.target.value || '';
      renderTable();
    });

    $('#closeProductDrawer')?.addEventListener('click', closeProduct);
    $('#productBackdrop')?.addEventListener('click', closeProduct);

    const categoryNav = document.querySelector('.side-nav button[data-section="categories"]');
    categoryNav?.addEventListener('click', () => {
      setTimeout(() => $('#categoryCommander')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
    });

    document.addEventListener('one-retail:data', render);

    const existing = core()?.getState?.();
    if (existing?.pulses?.length) render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();