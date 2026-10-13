import { db } from '../db.mjs';
import { canAccessStore } from './permissions.mjs';
import { productDataMany } from './product-data.mjs';
import { getStoreStockByProductNumber, getSupplyStockByProductNumber } from './dynamics-stock.mjs';

const clean = value => String(value ?? '').trim();

function safeError(error){
  return {
    code: error?.code || 'ANALYTICS_SOURCE_FAILED',
    message: error?.message || String(error || 'Source indisponible')
  };
}

export async function handleAnalyticsApi({ req, url, user }){
  if(req.method !== 'GET') return null;
  if(url.pathname !== '/api/analytics/product') return null;

  const itemId = clean(url.searchParams.get('itemId'));
  if(!itemId) return { status: 400, data: { error: 'itemId requis.' } };

  const requestedStore = clean(url.searchParams.get('storeId'));
  const allowedStores = db.prepare('SELECT id,name,code FROM stores WHERE active=1 ORDER BY name')
    .all()
    .filter(store => canAccessStore(user, store.id))
    .filter(store => !requestedStore || requestedStore === 'ALL' || store.id === requestedStore);

  if(requestedStore && requestedStore !== 'ALL' && !allowedStores.length){
    return { status: 403, data: { error: 'Accès interdit à ce magasin.' } };
  }

  const refs = await productDataMany([itemId]);
  const product = refs.get(itemId) || { productNumber: itemId, productName: null, identityStatus: 'MISSING' };

  const stores = await Promise.all(allowedStores.map(async store => {
    const [storeStock, supplyStock] = await Promise.allSettled([
      getStoreStockByProductNumber(store.id, itemId),
      getSupplyStockByProductNumber(store.id, itemId)
    ]);

    const local = storeStock.status === 'fulfilled' ? storeStock.value : null;
    const supply = supplyStock.status === 'fulfilled' ? supplyStock.value : null;

    return {
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      warehouseId: local?.warehouseId || null,
      stock: {
        onHand: local?.onHandQuantity ?? null,
        available: local?.availableOnHandQuantity ?? null,
        reserved: local?.reservedOnHandQuantity ?? null,
        ordered: local?.orderedQuantity ?? null,
        onOrder: local?.onOrderQuantity ?? null,
        totalAvailable: local?.totalAvailableQuantity ?? null,
        complete: local?.complete === true,
        source: local?.source || null,
        batches: local?.batches || [],
        error: storeStock.status === 'rejected' ? safeError(storeStock.reason) : null
      },
      supply: {
        warehouseId: supply?.warehouseId || null,
        onHand: supply?.onHandQuantity ?? null,
        available: supply?.availableOnHandQuantity ?? null,
        complete: supply?.complete === true,
        source: supply?.source || null,
        error: supplyStock.status === 'rejected' ? safeError(supplyStock.reason) : null
      }
    };
  }));

  return {
    status: 200,
    data: {
      status: 'READY',
      itemId,
      product: {
        productNumber: itemId,
        productName: product.productName || null,
        identityStatus: product.identityStatus || null,
        productNameSource: product.productNameSource || null,
        ean: product.ean || null,
        inventoryUnit: product.inventoryUnit || null,
        salesUnit: product.salesUnit || null,
        purchaseUnit: product.purchaseUnit || null,
        salesPrice: product.salesPrice ?? null,
        supplyMode: product.supplyMode || null,
        primaryVendorAccount: product.primaryVendorAccount || null,
        rayonCode: product.rayonCode || null,
        rayonLabel: product.rayonLabel || null,
        retailScope: product.retailScope || null,
        financialDimension: product.financialDimension || null
      },
      stores,
      checkedAt: new Date().toISOString()
    }
  };
}