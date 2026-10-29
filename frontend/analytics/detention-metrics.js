export const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const origin=r=>!r?.vendorName?'UNKNOWN':normalize(r.vendorName).includes('EXTENCINTERNATIONAL')?'IMPORT':'LOCAL';
export const isPGC=r=>/^(PGC|PRODUITSGRANDECONSOMMATION|PRODUITSDEGRANDECONSOMMATION)$/.test(normalize(r.hierarchy?.department?.label));
export function relativeMetric(rows,{complete=false}={}){
 const pgc=rows.filter(isPGC),eligible=pgc.filter(r=>r.warehouseAvailable>0),unknown=pgc.filter(r=>r.warehouseAvailable==null||r.warehouseAvailable>0&&r.storeAvailable==null).length;
 const unclassified=rows.filter(r=>(r.warehouseAvailable==null||r.warehouseAvailable>0)&&!r.hierarchy?.department?.label).length;
 const held=eligible.filter(r=>r.storeAvailable>0).length;
 return{denominator:eligible.length,held,missing:eligible.filter(r=>r.storeAvailable!=null&&r.storeAvailable<=0).length,unknown,unclassified,rate:complete&&!unknown&&!unclassified&&eligible.length?held/eligible.length*100:null,rows:eligible};
}
export function historicalMetric(products,rows,{complete=false,stockComplete=false,kind='store',includeCurrent=true}={}){
 const map=new Map(rows.map(r=>[r.productNumber,r])),field=kind==='supply'?'warehouseAvailable':'storeAvailable';
 const base=new Map(products.map(p=>[p.productNumber,{presenceProof:'RECEIPT',...p}]));if(kind==='supply'&&includeCurrent)for(const r of rows)if(r.warehouseAvailable>0&&!base.has(r.productNumber))base.set(r.productNumber,{productNumber:r.productNumber,presenceProof:'CURRENT_POSITIVE'});
 const result=[...base.values()].map(p=>{const r=map.get(p.productNumber);return{...p,...r,productNumber:p.productNumber,quantity:r?r[field]:stockComplete?0:null}});
 const known=result.filter(r=>r.quantity!=null),held=known.filter(r=>r.quantity>0).length;
 return{denominator:result.length,held,missing:known.filter(r=>r.quantity<=0).length,unknown:result.length-known.length,rate:complete&&stockComplete&&known.length===result.length&&result.length?held/result.length*100:null,rows:result};
}

export function filterDetentionRows(rows,{view='store',department='',supplierOrigin=''}={}){return rows.filter(r=>(view==='relative'||!department||r.hierarchy?.department?.id===department)&&(!supplierOrigin||origin(r)===supplierOrigin))}
