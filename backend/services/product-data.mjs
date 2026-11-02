import {config} from '../config.mjs';
import {odataGetAll} from './dynamics.mjs';
import {releasedProductSourcingMany} from './released-product-sourcing.mjs';
import {cachedProductByProductNumber,rememberProductIdentity} from './product-cache.mjs';
import {usableProductName,resolveProductLabel} from './product-label.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const valid=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(v||'');

// Shared by analytics and operational lists. Uses the same barcode description
// and remembered scan identity as the single-article lookup, in bounded batches.
export async function productDataMany(productNumbers=[], {readReleased=releasedProductSourcingMany,readRows=odataGetAll}={}) {
  const skus=[...new Set(productNumbers.map(clean).filter(Boolean))];
  const refs=await readReleased(skus);
  const missing=[],searchFallbacks=new Map(),deferredCache=new Map();
  for(const sku of skus){
    const ref={...(refs.get(sku)||{productNumber:sku})};
    const cached=cachedProductByProductNumber(sku);
    if(usableProductName(ref.productName,sku)&&ref.nameQuality!=='SEARCH_FALLBACK')ref.productNameSource=ref.source?ref.source+(ref.nameField?'.'+ref.nameField:''):'RELEASED_PRODUCTS';
    else if(ref.nameQuality!=='SEARCH_FALLBACK'&&usableProductName(cached?.name,sku)){
      ref.productName=cached.name;ref.productNameSource='SCANNED_IDENTITY_CACHE';ref.identitySyncedAt=cached.cacheSyncedAt;
    }else{if(ref.nameQuality==='SEARCH_FALLBACK'&&usableProductName(ref.productName,sku))searchFallbacks.set(sku,ref.productName);if(cached)deferredCache.set(sku,cached);ref.productName=null;missing.push(sku)}
    refs.set(sku,ref);
  }
  const c=config.dynamics;
  // A configured product master may expose ProductName where the released-item
  // view only supplies a search aid. Never let that aid be promoted by an old cache.
  if(c.mode==='live'&&valid(c.productEntity)&&valid(c.productNumberField)){
    const pending=missing.filter(sku=>refs.get(sku)?.source!==`D365/${c.productEntity}`);
    for(let i=0;i<pending.length;i+=30){const chunk=pending.slice(i,i+30),filter=[`(${chunk.map(sku=>`${c.productNumberField} eq '${esc(sku)}'`).join(' or ')})`,c.dataAreaId?`${c.dataAreaField} eq '${esc(c.dataAreaId)}'`:null].filter(Boolean).join(' and ');
      try{const data=await readRows(c.productEntity,{filter,pageSize:500,maxRows:2000,extra:c.dataAreaId?'cross-company=true':''});for(const row of data.value||[]){const sku=clean(row[c.productNumberField]),ref=refs.get(sku),label=resolveProductLabel(row,{configuredField:c.productNameField,productNumber:sku});if(chunk.includes(sku)&&ref&&label.quality==='DISPLAY_NAME'){ref.productName=label.name;ref.productNameSource=`D365/${c.productEntity}.${label.field}`;ref.nameQuality='DISPLAY_NAME';}}}catch{/* Barcode descriptions may still provide a verified display label. */}
    }
  }
  for(const sku of missing){const ref=refs.get(sku),cached=deferredCache.get(sku);if(!ref.productName&&usableProductName(cached?.name,sku)&&clean(cached.name)!==clean(searchFallbacks.get(sku))){ref.productName=cached.name;ref.productNameSource='SCANNED_IDENTITY_CACHE';}}
  if(c.mode==='live'&&valid(c.barcodeEntity)&&valid(c.barcodeProductField)){
    const chunks=[];for(let i=0;i<missing.length;i+=30)chunks.push(missing.slice(i,i+30).filter(sku=>!refs.get(sku)?.productName));
    let cursor=0;const workers=Math.min(4,Math.max(1,chunks.length));
    await Promise.all(Array.from({length:workers},async()=>{while(cursor<chunks.length){
      const chunk=chunks[cursor++];if(!chunk.length)continue;const filters=[`(${chunk.map(sku=>`${c.barcodeProductField} eq '${esc(sku)}'`).join(' or ')})`];
      if(c.dataAreaId)filters.push(`${c.dataAreaField} eq '${esc(c.dataAreaId)}'`);
      try{
        const payload=await readRows(c.barcodeEntity,{filter:filters.join(' and '),pageSize:500,maxRows:10000,extra:c.dataAreaId?'cross-company=true':''});
        for(const row of payload.value||[]){
          const sku=clean(row[c.barcodeProductField]),ref=refs.get(sku);
          if(!chunk.includes(sku)||!ref||usableProductName(ref.productName,sku))continue;
          const name=[row[c.barcodeDescriptionField],row.Description,row.description].find(v=>usableProductName(v,sku));
          if(!name)continue;
          ref.productName=clean(name);ref.productNameSource=`D365/${c.barcodeEntity}`;ref.nameQuality='DISPLAY_NAME';
          rememberProductIdentity({ean:clean(row[c.barcodeField])||`ITEM:${sku}`,productNumber:sku,name:ref.productName,unit:row[c.barcodeUnitField]||null,source:ref.productNameSource});
        }
      }catch(error){for(const sku of chunk)refs.get(sku).identityError=error.code||'PRODUCT_LABEL_READ_FAILED'}
    }}));
  }
  for(const sku of skus){const ref=refs.get(sku);if(!ref.productName&&searchFallbacks.has(sku)){ref.productName=null;ref.searchName=searchFallbacks.get(sku);ref.productNameSource=null;ref.identityStatus='SEARCH_ONLY'}else ref.identityStatus=usableProductName(ref.productName,sku)?'RESOLVED':'MISSING';}
  return refs;
}
