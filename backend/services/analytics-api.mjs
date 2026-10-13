import { db, uid } from '../db.mjs';
import { canAccessStore } from './permissions.mjs';
import { productDataMany } from './product-data.mjs';
import { getStoreStockByProductNumber, getSupplyStockByProductNumber } from './dynamics-stock.mjs';
import { readWalletBurn } from './dynamics-tender.mjs';

const clean = value => String(value ?? '').trim();


function readBody(req){
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',chunk=>{raw+=chunk;if(raw.length>1_000_000)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});
    req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});
    req.on('error',reject);
  });
}

function parsePayload(row){
  try{return JSON.parse(row.payload_json||'{}')}catch{return{}}
}

function savedView(row){
  return {
    id:row.id,
    tenantKey:row.tenant_key,
    name:row.name,
    payload:parsePayload(row),
    createdAt:row.created_at,
    updatedAt:row.updated_at
  };
}

function safeError(error){
  return {
    code: error?.code || 'ANALYTICS_SOURCE_FAILED',
    message: error?.message || String(error || 'Source indisponible')
  };
}

export async function handleAnalyticsApi({ req, url, user }){
  if(url.pathname === '/api/analytics/views'){
    const tenantKey=clean(url.searchParams.get('tenant'))||'franprix';

    if(req.method==='GET'){
      const rows=db.prepare('SELECT * FROM analytics_saved_views WHERE user_id=? AND tenant_key=? ORDER BY updated_at DESC,name')
        .all(user.id,tenantKey);
      return {status:200,data:{items:rows.map(savedView)}};
    }

    if(req.method==='POST'){
      const body=await readBody(req),name=clean(body.name),payload=body.payload&&typeof body.payload==='object'?body.payload:{};
      if(!name)return{status:400,data:{error:'Nom de vue requis.'}};
      if(name.length>80)return{status:400,data:{error:'Nom de vue trop long.'}};
      const existing=db.prepare('SELECT id FROM analytics_saved_views WHERE user_id=? AND tenant_key=? AND name=?').get(user.id,tenantKey,name);
      const id=existing?.id||uid('av');
      if(existing){
        db.prepare('UPDATE analytics_saved_views SET payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?')
          .run(JSON.stringify(payload),id,user.id);
      }else{
        db.prepare('INSERT INTO analytics_saved_views(id,user_id,tenant_key,name,payload_json) VALUES(?,?,?,?,?)')
          .run(id,user.id,tenantKey,name,JSON.stringify(payload));
      }
      const row=db.prepare('SELECT * FROM analytics_saved_views WHERE id=? AND user_id=?').get(id,user.id);
      return{status:200,data:savedView(row)};
    }

    return null;
  }

  const viewMatch=url.pathname.match(/^\/api\/analytics\/views\/([^/]+)$/);
  if(viewMatch&&req.method==='DELETE'){
    const id=decodeURIComponent(viewMatch[1]);
    const result=db.prepare('DELETE FROM analytics_saved_views WHERE id=? AND user_id=?').run(id,user.id);
    return{status:result.changes?200:404,data:result.changes?{ok:true}:{error:'Vue introuvable.'}};
  }

  if(req.method==='GET'&&url.pathname==='/api/analytics/wallet'){
    const storeId=clean(url.searchParams.get('storeId'));
    const businessDate=clean(url.searchParams.get('date'))||new Date().toISOString().slice(0,10);
    const force=url.searchParams.get('force')==='1';
    if(!storeId)return{status:400,data:{error:'storeId requis.'}};
    if(!canAccessStore(user,storeId))return{status:403,data:{error:'Accès interdit à ce magasin.'}};
    return{status:200,data:await readWalletBurn(storeId,{businessDate,force})};
  }

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