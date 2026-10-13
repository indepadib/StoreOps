window.RETAIL_INTELLIGENCE_TENANTS = Object.freeze({
  franprix: {
    label: 'Franprix',
    accent: '#e5004f',
    connected: true,
    sourceLabel: 'Dynamics 365 / Commerce',
    description: 'Réseau Franprix Maroc',
    modules: {
      overview: true,
      sales: true,
      network: true,
      categories: true,
      inventory: true,
      loyalty: true,
      promotions: true,
      cashiers: true,
      customers: true,
      supply: true,
      shrink: true,
      dataQuality: true
    },
    priorities: ['sales','network','inventory','loyalty','categories'],
    terminology: {
      store: 'Magasin',
      product: 'Article',
      department: 'Département',
      category: 'Rayon'
    }
  },
  flormar: {
    label: 'Flormar',
    accent: '#d9175b',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Beauté & cosmétique',
    modules: {
      overview: true,
      sales: true,
      network: true,
      categories: true,
      inventory: true,
      loyalty: true,
      promotions: true,
      cashiers: true,
      customers: true,
      supply: true,
      shrink: true,
      dataQuality: true
    },
    priorities: ['sales','loyalty','customers','categories','promotions'],
    terminology: {
      store: 'Boutique',
      product: 'Produit',
      department: 'Univers',
      category: 'Catégorie'
    }
  },
  mrbricolage: {
    label: 'Mr.Bricolage',
    accent: '#e53935',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Maison & bricolage',
    modules: {
      overview: true,
      sales: true,
      network: true,
      categories: true,
      inventory: true,
      loyalty: true,
      promotions: true,
      cashiers: true,
      customers: true,
      supply: true,
      shrink: true,
      dataQuality: true
    },
    priorities: ['inventory','sales','categories','supply','promotions'],
    terminology: {
      store: 'Magasin',
      product: 'Article',
      department: 'Département',
      category: 'Rayon'
    }
  },
  venezia: {
    label: 'Venezia Ice',
    accent: '#8b5e3c',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Restauration & glace',
    modules: {
      overview: true,
      sales: true,
      network: true,
      categories: true,
      inventory: true,
      loyalty: true,
      promotions: true,
      cashiers: true,
      customers: true,
      supply: false,
      shrink: true,
      dataQuality: true
    },
    priorities: ['sales','network','categories','customers','inventory'],
    terminology: {
      store: 'Point de vente',
      product: 'Produit',
      department: 'Famille',
      category: 'Sous-famille'
    }
  },
  dahab: {
    label: 'Dahab',
    accent: '#b88a2a',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Retail',
    modules: {
      overview: true, sales: true, network: true, categories: true, inventory: true,
      loyalty: true, promotions: true, cashiers: true, customers: true, supply: true,
      shrink: true, dataQuality: true
    },
    priorities: ['sales','network','categories','inventory','loyalty']
  },
  beautyforyou: {
    label: 'Beauty For You',
    accent: '#a92b73',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Beauté',
    modules: {
      overview: true, sales: true, network: true, categories: true, inventory: true,
      loyalty: true, promotions: true, cashiers: true, customers: true, supply: true,
      shrink: true, dataQuality: true
    },
    priorities: ['sales','loyalty','customers','categories','promotions']
  },
  intersport: {
    label: 'Intersport',
    accent: '#1d5fbf',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Sport',
    modules: {
      overview: true, sales: true, network: true, categories: true, inventory: true,
      loyalty: true, promotions: true, cashiers: true, customers: true, supply: true,
      shrink: true, dataQuality: true
    },
    priorities: ['sales','inventory','categories','promotions','network']
  },
  primor: {
    label: 'Primor',
    accent: '#2c2c2c',
    connected: false,
    sourceLabel: 'Source à connecter',
    description: 'Beauté',
    modules: {
      overview: true, sales: true, network: true, categories: true, inventory: true,
      loyalty: true, promotions: true, cashiers: true, customers: true, supply: true,
      shrink: true, dataQuality: true
    },
    priorities: ['sales','loyalty','customers','promotions','categories']
  }
});