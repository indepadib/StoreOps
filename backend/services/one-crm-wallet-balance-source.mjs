// Metadata only: identify candidate balance entities without returning customer data.
const names=['PublicEntityName','EntitySetName','CollectionName','DataEntityName','EntityName','Name'];
const validName=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
export async function discoverWalletBalanceSources({mode,listEntities}){
 const base={source:'D365/F&O/Metadata/DataEntities',balance:null,balanceStatus:'NOT_VERIFIED',activationEnabled:false,candidates:[]};
 if(mode!=='live')return {...base,status:'UNAVAILABLE',reason:'LIVE_SOURCE_REQUIRED'};
 try{
  const rows=await listEntities('loyalty');
  if(!Array.isArray(rows))return {...base,status:'UNAVAILABLE',reason:'METADATA_INVALID'};
  const candidates=[...new Set(rows.flatMap(r=>names.map(k=>r?.[k]).filter(v=>validName(v)&&/loyalty|reward/i.test(v)&&/balance|point|card/i.test(v))))].sort();
  return {...base,status:'READY',reason:candidates.length?'SEMANTIC_AND_POS_VALIDATION_REQUIRED':'NO_BALANCE_CANDIDATE_FOUND',candidates,metadataLimitReached:rows.length>=100};
 }catch{return {...base,status:'UNAVAILABLE',reason:'METADATA_READ_FAILED'}}
}
