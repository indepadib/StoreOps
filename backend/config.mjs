function cleanUrl(v=''){ return String(v||'').trim().replace(/\/+$/,''); }

export const config = {
  port: Number(process.env.PORT || 8787),
  nodeEnv: process.env.NODE_ENV || 'development',
  authMode: process.env.AUTH_MODE || 'demo', // demo | entra
  entra: {
    tenantId: process.env.ENTRA_TENANT_ID || '',
    apiClientId: process.env.ENTRA_API_CLIENT_ID || '',
    allowedTenantId: process.env.ENTRA_ALLOWED_TENANT_ID || process.env.ENTRA_TENANT_ID || ''
  },
  dynamics: {
    mode: process.env.D365_MODE || 'simulated', // simulated | live
    baseUrl: cleanUrl(process.env.D365_BASE_URL),
    tenantId: process.env.D365_TENANT_ID || process.env.ENTRA_TENANT_ID || '',
    clientId: process.env.D365_CLIENT_ID || '',
    clientSecret: process.env.D365_CLIENT_SECRET || '',
    oauthVersion: process.env.D365_OAUTH_VERSION || 'v2',
    productEntity: process.env.D365_PRODUCT_ENTITY || '',
    barcodeEntity: process.env.D365_BARCODE_ENTITY || '',
    productNumberField: process.env.D365_PRODUCT_NUMBER_FIELD || 'ProductNumber',
    productNameField: process.env.D365_PRODUCT_NAME_FIELD || 'ProductName',
    barcodeField: process.env.D365_BARCODE_FIELD || 'Barcode',
    barcodeProductField: process.env.D365_BARCODE_PRODUCT_FIELD || 'ItemNumber'
  }
};

export function productionMisconfig(){
  const issues=[];
  if(config.authMode==='entra'){
    if(!config.entra.tenantId) issues.push('ENTRA_TENANT_ID manquant');
    if(!config.entra.apiClientId) issues.push('ENTRA_API_CLIENT_ID manquant');
  }
  if(config.dynamics.mode==='live'){
    if(!config.dynamics.baseUrl) issues.push('D365_BASE_URL manquant');
    if(!config.dynamics.tenantId) issues.push('D365_TENANT_ID manquant');
    if(!config.dynamics.clientId) issues.push('D365_CLIENT_ID manquant');
    if(!config.dynamics.clientSecret) issues.push('D365_CLIENT_SECRET manquant');
  }
  return issues;
}
