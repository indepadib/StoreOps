function cleanUrl(v=''){ return String(v||'').trim().replace(/\/+$/,''); }
function parseStoreMap(v=''){
  const raw=String(v||'').trim();
  if(!raw)return{};
  if(raw.startsWith('{')){try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'?Object.fromEntries(Object.entries(parsed).map(([k,val])=>[String(k).trim(),String(val||'').trim()]).filter(([,val])=>val)):{};}catch{}}
  return Object.fromEntries(raw.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(x=>x&&x[0]&&x[1]));
}
function source(v,fallback='storeops'){const s=String(v||fallback).trim().toLowerCase();return ['storeops','d365'].includes(s)?s:fallback}

export const config = {
  appVersion: process.env.STOREOPS_VERSION || '1.29.0',
  port: Number(process.env.PORT || 8787),
  nodeEnv: process.env.NODE_ENV || 'development',
  authMode: process.env.AUTH_MODE || 'demo', // demo | local | entra
  entra: {
    tenantId: process.env.ENTRA_TENANT_ID || '',
    apiClientId: process.env.ENTRA_API_CLIENT_ID || '',
    allowedTenantId: process.env.ENTRA_ALLOWED_TENANT_ID || process.env.ENTRA_TENANT_ID || '',
    requiredScope: process.env.ENTRA_REQUIRED_SCOPE || ''
  },
  pilot: {
    staffingSource: source(process.env.STOREOPS_STAFFING_SOURCE,'storeops'),
    cashOpeningSource: source(process.env.STOREOPS_CASH_OPENING_SOURCE,'storeops')
  },
  dynamics: {
    mode: process.env.D365_MODE || 'simulated', // simulated | live
    baseUrl: cleanUrl(process.env.D365_BASE_URL),
    tenantId: process.env.D365_TENANT_ID || process.env.ENTRA_TENANT_ID || '',
    clientId: process.env.D365_CLIENT_ID || '',
    clientSecret: process.env.D365_CLIENT_SECRET || '',
    oauthVersion: process.env.D365_OAUTH_VERSION || 'v2',
    dataAreaId: process.env.D365_DATA_AREA_ID || '',
    dataAreaField: process.env.D365_DATA_AREA_FIELD || 'dataAreaId',
    productEntity: process.env.D365_PRODUCT_ENTITY || '',
    barcodeEntity: process.env.D365_BARCODE_ENTITY || '',
    productNumberField: process.env.D365_PRODUCT_NUMBER_FIELD || 'ProductNumber',
    productNameField: process.env.D365_PRODUCT_NAME_FIELD || 'ProductName',
    barcodeField: process.env.D365_BARCODE_FIELD || 'Barcode',
    barcodeProductField: process.env.D365_BARCODE_PRODUCT_FIELD || 'ItemNumber',
    barcodeDescriptionField: process.env.D365_BARCODE_DESCRIPTION_FIELD || 'Description',
    barcodeUnitField: process.env.D365_BARCODE_UNIT_FIELD || 'UnitID',
    defaultPriceGroup: process.env.D365_DEFAULT_PRICE_GROUP || 'Franprix',
    storePriceGroups: parseStoreMap(process.env.D365_STORE_PRICE_GROUPS || ''),
    odataPageSize: Math.max(50,Math.min(2000,Number(process.env.D365_ODATA_PAGE_SIZE)||500)),
    odataMaxRows: Math.max(500,Math.min(100000,Number(process.env.D365_ODATA_MAX_ROWS)||25000))
  }
};

export function productionMisconfig(){
  const issues=[];
  if(config.authMode==='local'){
    if(!process.env.STOREOPS_VF_MANAGER_EMAIL) issues.push('STOREOPS_VF_MANAGER_EMAIL manquant');
    if(!process.env.STOREOPS_VF_MANAGER_PASSWORD) issues.push('STOREOPS_VF_MANAGER_PASSWORD manquant');
    if(!process.env.STOREOPS_OPS_DIRECTOR_EMAIL) issues.push('STOREOPS_OPS_DIRECTOR_EMAIL manquant');
    if(!process.env.STOREOPS_OPS_DIRECTOR_PASSWORD) issues.push('STOREOPS_OPS_DIRECTOR_PASSWORD manquant');
  }
  if(config.authMode==='entra'){
    if(!config.entra.tenantId) issues.push('ENTRA_TENANT_ID manquant');
    if(!config.entra.apiClientId) issues.push('ENTRA_API_CLIENT_ID manquant');
    if(!config.entra.requiredScope) issues.push('ENTRA_REQUIRED_SCOPE manquant');
  }
  if(config.dynamics.mode==='live'){
    if(!config.dynamics.baseUrl) issues.push('D365_BASE_URL manquant');
    if(!config.dynamics.tenantId) issues.push('D365_TENANT_ID manquant');
    if(!config.dynamics.clientId) issues.push('D365_CLIENT_ID manquant');
    if(!config.dynamics.clientSecret) issues.push('D365_CLIENT_SECRET manquant');
  }
  return issues;
}
