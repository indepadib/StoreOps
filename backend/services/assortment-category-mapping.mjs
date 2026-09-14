import { replaceAssortmentProductAssignments } from './assortment-relations.mjs';

export const PRODUCT_ASSORTMENT_SOURCE='D365_PRODUCT_CATEGORY_ASSIGNMENTS';
const clean=v=>String(v??'').trim();
const ascii=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const slug=v=>ascii(v).replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
function first(row,names){for(const n of names){if(n&&row?.[n]!==undefined&&row?.[n]!==null&&clean(row[n])!=='')return row[n]}return null}

export function parseAssortmentLabel(value){
 const raw=clean(value),normalized=ascii(raw),parts=raw.split(/\s+-\s+/).map(clean).filter(Boolean),brandRaw=parts[0]||raw,tierRaw=parts.slice(1).join(' - ')||raw,brandNorm=ascii(brandRaw),tierNorm=ascii(tierRaw);
 let brandScope='UNKNOWN',brands=[];
 if(/FPXMPX|FRANPRIX.*MONOPRIX|MONOPRIX.*FRANPRIX/.test(brandNorm)){brandScope='FRANPRIX_MONOPRIX';brands=['FRANPRIX','MONOPRIX']}
 else if(/FRANPRIX|\bFPX\b/.test(brandNorm)){brandScope='FRANPRIX';brands=['FRANPRIX']}
 else if(/MONOPRIX|\bMPX\b/.test(brandNorm)){brandScope='MONOPRIX';brands=['MONOPRIX']}
 let tier='UNKNOWN';
 if(/COMPLEMENTAIRE\s*\+|COMPLEMENTAIRE_PLUS|COMPLEMENTAIRE PLUS/.test(tierNorm)||(/COMPLEMENTAIRE/.test(tierNorm)&&/\+/.test(raw)))tier='COMPLEMENTAIRE_PLUS';
 else if(/COMPLEMENTAIRE/.test(tierNorm))tier='COMPLEMENTAIRE';
 else if(/DEPANNAGE/.test(tierNorm))tier='DEPANNAGE';
 return{raw,normalized,brandScope,brands,tier,brandLabel:brandRaw,tierLabel:tierRaw,recognized:brandScope!=='UNKNOWN'&&tier!=='UNKNOWN'}
}

export function normalizeProductAssortmentCategoryRows(rows=[],mapping={}){
 const out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const hierarchy=clean(first(row,[mapping.hierarchyField,'ProductCategoryHierarchyName','CategoryHierarchyName','HierarchyName','CategoryHierarchy']));
  if(!/assort/i.test(hierarchy))continue;
  const productNumber=clean(first(row,[mapping.productField,'ProductNumber','ItemNumber','Product','ProductId']));
  const categoryName=clean(first(row,[mapping.categoryNameField,'ProductCategoryName','CategoryName','ProcurementCategoryName','CategoryDescription','Name','Category']));
  const categoryId=clean(first(row,[mapping.categoryField,'CategoryId','CategoryIdentifier','ProcurementCategoryId','ProductCategoryId','Category']))||categoryName;
  if(!productNumber||!categoryId)continue;
  const parsed=parseAssortmentLabel(categoryName||categoryId),assortmentKey=categoryId||slug(categoryName);
  out.push({productNumber,assortmentKey,assortmentName:categoryName||categoryId,hierarchy,brandScope:parsed.brandScope,brands:parsed.brands,tier:parsed.tier,recognized:parsed.recognized,raw:row})
 }
 return out
}

export function syncProductAssortmentCategoryRows(rows=[],{mapping={},source=PRODUCT_ASSORTMENT_SOURCE,complete=true}={}){
 const normalized=normalizeProductAssortmentCategoryRows(rows,mapping),groups=new Map();
 for(const row of normalized){if(!groups.has(row.assortmentKey))groups.set(row.assortmentKey,{assortmentKey:row.assortmentKey,assortmentName:row.assortmentName,brandScope:row.brandScope,tier:row.tier,recognized:row.recognized,products:[]});groups.get(row.assortmentKey).products.push({productNumber:row.productNumber,included:true})}
 const assortments=[];for(const group of groups.values()){const saved=replaceAssortmentProductAssignments({source,assortmentKey:group.assortmentKey,assortmentName:group.assortmentName,products:group.products,complete});assortments.push({...group,rowCount:saved.rowCount})}
 return{source,complete:!!complete,rows:normalized.length,assortments:assortments.sort((a,b)=>a.assortmentName.localeCompare(b.assortmentName,'fr'))}
}
