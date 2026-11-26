const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterSupplierPurchases(rows,{vendor='',article='',unresolvedOnly=false}={}){
 const query=fold(article.trim());
 return rows.filter(row=>(!vendor||row.vendorAccount===vendor)&&(!unresolvedOnly||!row.vendorAccount)&&(!query||fold(row.productNumber).includes(query)));
}
// Purchase evidence is exported in full after loading, regardless of UI pagination.
export function supplierEvidenceCsv(rows){
 const escape=value=>'"'+(typeof value==='number'&&Number.isFinite(value)?String(value):String(value??'').replace(/^[\s]*[=+@-]/,m=>"'"+m)).replaceAll('"','""')+'"';
 const headers=['Date facture','Facture','Article','Compte fournisseur','Fournisseur','Quantité signée','Unité','Achats HT signés','Devise','Attribution','Champ source','Identifiant source'];
 return '\ufeff'+[headers,...rows.map(r=>[r.date,r.invoice,r.productNumber,r.vendorAccount,r.vendorName,r.quantity,r.unit,r.amountHT,r.currency,r.vendorStatus,r.vendorBasis,r.id])].map(row=>row.map(escape).join(';')).join('\r\n');
}
export function purchaseEvidencePage(rows,page=0,size=100){
 const pages=Math.max(1,Math.ceil(rows.length/size)),index=Math.max(0,Math.min(pages-1,Math.trunc(page)||0));
 return{index,pages,total:rows.length,items:rows.slice(index*size,(index+1)*size)};
}
