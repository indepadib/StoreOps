import { listProductAssortmentCatalog,saveStoreAssortmentAssignments,getStoreAssortmentAssignments } from './assortment-admin.mjs';
import { parseAssortmentLabel,PRODUCT_ASSORTMENT_SOURCE } from './assortment-category-mapping.mjs';

const clean=v=>String(v??'').trim();
const ascii=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9+]+/g,'_').replace(/^_+|_+$/g,'');
export const STORE_ASSORTMENT_PROFILES=Object.freeze({
 COMPLEMENTAIRE_PLUS:{
  code:'COMPLEMENTAIRE_PLUS',
  label:'Complémentaire +',
  required:[
   {brand:'FRANPRIX',tier:'DEPANNAGE'},
   {brand:'FRANPRIX',tier:'COMPLEMENTAIRE'},
   {brand:'FRANPRIX',tier:'COMPLEMENTAIRE_PLUS'},
   {brand:'FPXMPX',tier:'DEPANNAGE'},
   {brand:'FPXMPX',tier:'COMPLEMENTAIRE'},
   {brand:'FPXMPX',tier:'COMPLEMENTAIRE_PLUS'}
  ]
 }
});

function catalogBrand(row){
 const p=parseAssortmentLabel(row.assortmentName||row.assortmentKey),brand=ascii(p.brandLabel);
 if(brand.includes('FPXMPX'))return'FPXMPX';
 if(brand.includes('FRANPRIX'))return'FRANPRIX';
 if(brand.includes('MONOPRIX'))return'MONOPRIX';
 return'UNKNOWN'
}
const slotKey=(brand,tier)=>`${brand}::${tier}`;

export function resolveAssortmentProfile(profileCode,{source=PRODUCT_ASSORTMENT_SOURCE}={}){
 const code=clean(profileCode).toUpperCase(),profile=STORE_ASSORTMENT_PROFILES[code];
 if(!profile)return{status:'UNCONFIGURED',profileCode:code||null,profile:null,required:[],resolved:[],missing:[],safeToPersist:false};
 const catalog=listProductAssortmentCatalog({source}),slots=new Map();
 for(const row of catalog){
  if(!row.complete||!row.recognized)continue;
  const brand=catalogBrand(row),key=slotKey(brand,row.tier);
  if(!slots.has(key))slots.set(key,[]);
  slots.get(key).push(row)
 }
 const resolved=[],missing=[];
 for(const req of profile.required){
  const matches=slots.get(slotKey(req.brand,req.tier))||[];
  if(!matches.length){missing.push(req);continue}
  for(const row of matches)resolved.push({...row,profileBrand:req.brand,profileTier:req.tier})
 }
 const dedup=[...new Map(resolved.map(x=>[x.assortmentKey,x])).values()];
 return{
  status:missing.length?'INCOMPLETE':'READY',
  profileCode:code,
  profile:{code:profile.code,label:profile.label},
  required:profile.required,
  resolved:dedup,
  missing,
  catalogCount:catalog.length,
  safeToPersist:missing.length===0&&dedup.length>=profile.required.length,
  source
 }
}

export function applyAssortmentProfile({storeId,profileCode,user=null,source=PRODUCT_ASSORTMENT_SOURCE}={}){
 const resolution=resolveAssortmentProfile(profileCode,{source});
 if(!resolution.safeToPersist)throw Object.assign(new Error('Profil assortiment incomplet : les 6 blocs métier requis ne sont pas tous disponibles dans le catalogue D365.'),{status:409,code:'ASSORTMENT_PROFILE_INCOMPLETE',details:resolution});
 const saved=saveStoreAssortmentAssignments({storeId,user,assortmentKeys:resolution.resolved.map(x=>x.assortmentKey),source});
 return{status:'APPLIED',storeId,profileCode:resolution.profileCode,profile:resolution.profile,required:resolution.required,resolved:resolution.resolved,missing:[],rowCount:saved.rowCount,items:getStoreAssortmentAssignments(storeId,{source}).items,source}
}
