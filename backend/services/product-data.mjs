import {config} from '../config.mjs';
import {odataGetAll} from './dynamics.mjs';
import {releasedProductSourcingMany} from './released-product-sourcing.mjs';
import {cachedProductByProductNumber,rememberProductIdentity} from './product-cache.mjs';
import {usableProductName} from './product-label.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const valid=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(v||'');

// Shared by analytics and operational lists. Uses the same barcode description
// and remembered scan identity as the single-article lookup, in bounded batches.
export async function productDataMany(productNumbers=[], {readReleased=releasedProductSourcingMany,readRows=odataGetAll}={}) {
  const skus=[...new Set(productNumbers.map(clean).filter(Boolean))];
  const refs=await readReleased(skus);
  const missing=[],searchFallbacks=new Map();
  for(const sku of skus){
    const ref={...(refs.get(sku)||{productNumber:sku})};
    const cached=cachedProductByProductNumber(sku);
    if(usableProductName(ref.productName,sku)&&ref.nameQuality!=='SEARCH_FALLBACK')ref.productNameSource=ref.source||'RELEASED_PRODUCTS';
    else if(usableProductName(cached?.name,sku)){
      ref.productName=cached.name;ref.productNameSource='SCANNED_IDENTITY_CACHE';ref.identitySyncedAt=cached.cacheSyncedAt;
    }else{if(ref.nameQuality==='SEARCH_FALLBACK'&&usableProductName(ref.productName,sku))searchFallbacks.set(sku,ref.productName);ref.productName=null;missing.push(sku)}
    refs.set(sku,ref);
  }
  const c=config.dynamics;
  if(c.mode==='live'&&valid(c.barcodeEntity)&&valid(c.barcodeProductField)){
    for(let i=0;i<missing.length;i+=30){
      const chunk=missing.slice(i,i+30);
      const filters=[`(${chunk.map(sku=>`${c.barcodeProductField} eq '${esc(sku)}'`).join(' or ')})`];
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
    }
  }
  for(const sku of skus){const ref=refs.get(sku);if(!ref.productName&&searchFallbacks.has(sku)){ref.productName=searchFallbacks.get(sku);ref.productNameSource='RELEASED_PRODUCTS_SEARCH_FALLBACK';ref.identityStatus='FALLBACK'}else ref.identityStatus=usableProductName(ref.productName,sku)?'RESOLVED':'MISSING';}
  return refs;
}
