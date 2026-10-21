export const parentSaleEligible=Symbol('parentSaleEligible');
const clean=v=>String(v??'').trim();
const key=(row,fields)=>JSON.stringify([clean(row[fields.company]),clean(row[fields.store]),clean(row[fields.terminal]),clean(row[fields.transaction])]);

// A posted sales line can belong to a voided or suspended transaction.
// Never join on transactionId alone: IDs can repeat across tills and stores.
export function attachParentSalesEligibility(rows,headers,fields){
 const headerFields={company:'dataAreaId',store:fields.store==='Channel'?'Channel':'store',terminal:'terminal',transaction:'transactionId'},byKey=new Map();
 for(const header of headers){
  const id=key(header,headerFields);
  if(byKey.has(id))throw Object.assign(new Error('Ticket parent Dynamics ambigu.'),{code:'D365_SALES_PARENT_AMBIGUOUS'});
  byKey.set(id,header);
 }
 return rows.map(row=>{
  const header=byKey.get(key(row,fields));
  if(!header)throw Object.assign(new Error('Ticket parent Dynamics manquant : CA non rapproché.'),{code:'D365_SALES_PARENT_MISSING'});
  const type=clean(header.type).toUpperCase(),status=clean(header.entryStatus).toUpperCase();
  const eligible=type==='SALES'&&['NONE','POSTED'].includes(status);
  return {...row,[parentSaleEligible]:eligible};
 });
}
