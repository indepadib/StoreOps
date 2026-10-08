const clean = value => String(value ?? '').trim();

export function usableProductName(value, productNumber = '') {
  const name = clean(value);
  return !!name && name.toUpperCase() !== clean(productNumber).toUpperCase()
    && !/^HS-\d+$/i.test(name)
    && !/^(article|item|product)(\s|$)/i.test(name);
}

// Search names are identifiers/search aids, not the customer's article label.
export function resolveProductLabel(row = {}, {configuredField = '', fallback = '', productNumber = ''} = {}) {
  const sku = productNumber || row.ProductNumber || row.ItemNumber || '';
  const keys = Object.keys(row);
  for (const candidate of [configuredField, 'ProductName', 'ProductDescription', 'Description']) {
    if (!candidate || /^(product)?searchname$/i.test(candidate)) continue;
    const field = keys.find(key => key.toLowerCase() === candidate.toLowerCase());
    if (field && usableProductName(row[field], sku)) return {name: clean(row[field]), field, quality: 'DISPLAY_NAME'};
  }
  const searchField=keys.find(key=>key.toLowerCase()==='productsearchname');
  if(searchField&&usableProductName(row[searchField],sku))return{name:clean(row[searchField]),field:searchField,quality:'SEARCH_FALLBACK'};
  return usableProductName(fallback, sku)
    ? {name: clean(fallback), field: null, quality: 'FALLBACK'}
    : {name: null, field: null, quality: 'MISSING'};
}
