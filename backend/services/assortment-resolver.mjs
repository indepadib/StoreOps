import { assortmentIndex as legacyAssortmentIndex,assortmentMembership as legacyAssortmentMembership } from './assortment.mjs';
import { relationalAssortmentIndex,relationalAssortmentMembership } from './assortment-relations.mjs';

export function assortmentIndex(storeId,opts={}){
 const relational=relationalAssortmentIndex(storeId,opts);
 if(relational.status!=='UNCONFIGURED')return relational;
 const legacy=legacyAssortmentIndex(storeId,opts);
 return {...legacy,model:'SNAPSHOT'}
}

export function assortmentMembership(storeId,productNumber,opts={}){
 const idx=opts.index||assortmentIndex(storeId,opts);
 if(idx.model==='RELATIONAL')return relationalAssortmentMembership(storeId,productNumber,{...opts,index:idx});
 return legacyAssortmentMembership(storeId,productNumber,{...opts,index:idx})
}
