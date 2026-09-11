const clean=v=>String(v??'').trim();

export const RETAIL_CAPABILITIES=Object.freeze([
 'catalog.product.read',
 'merchandising.assortment.read',
 'merchandising.taxonomy.read',
 'inventory.stock.read',
 'inventory.batch.read',
 'inventory.adjustment.write',
 'pricing.price.read',
 'pricing.promotion.read',
 'sales.transactions.read',
 'sales.margin.read',
 'supply.purchase-order.read',
 'supply.receiving.write',
 'supply.transfer.read',
 'supply.transfer.write',
 'workforce.employee.read',
 'workforce.schedule.read',
 'finance.cash.read',
 'finance.cash.write',
 'loss.write',
 'export.file.write',
 'identity.sso'
]);

const STATES=new Set(['UNMAPPED','SIMULATED','LIVE_PENDING','LIVE','DEGRADED','DISABLED']);

export function normalizeConnector(input={}){
 const key=clean(input.key);if(!key)throw Object.assign(new Error('Connector key obligatoire.'),{status:400,code:'CONNECTOR_KEY_REQUIRED'});
 const family=clean(input.family||'CUSTOM').toUpperCase(),name=clean(input.name)||key;
 const capabilities={};for(const cap of RETAIL_CAPABILITIES){const raw=input.capabilities?.[cap],state=typeof raw==='string'?raw:raw?.state;capabilities[cap]={state:STATES.has(String(state||'UNMAPPED').toUpperCase())?String(state||'UNMAPPED').toUpperCase():'UNMAPPED',source:clean(raw?.source)||null,lastSuccessAt:raw?.lastSuccessAt||null,lastError:clean(raw?.lastError)||null}}
 return{key,name,family,capabilities};
}

export function connectorCapability(connectorInput,capability){
 const connector=normalizeConnector(connectorInput),cap=clean(capability);if(!RETAIL_CAPABILITIES.includes(cap))throw Object.assign(new Error(`Capability inconnue: ${cap}`),{status:400,code:'CONNECTOR_CAPABILITY_UNKNOWN'});return connector.capabilities[cap]
}

export function canReadCapability(connectorInput,capability){return connectorCapability(connectorInput,capability).state==='LIVE'}

export function chooseConnector(connectors=[],capability,{allowDegraded=false}={}){
 const ranked=(Array.isArray(connectors)?connectors:[]).map(normalizeConnector).map(c=>({connector:c,cap:c.capabilities[capability]})).filter(x=>x.cap).sort((a,b)=>{
  const rank=s=>s==='LIVE'?0:s==='DEGRADED'?1:s==='LIVE_PENDING'?2:s==='SIMULATED'?3:4;return rank(a.cap.state)-rank(b.cap.state)
 });
 const chosen=ranked.find(x=>x.cap.state==='LIVE'||allowDegraded&&x.cap.state==='DEGRADED');return chosen?{connector:chosen.connector,capability,capabilityState:chosen.cap}:null
}

export function connectorReadiness(connectors=[]){
 const normalized=(Array.isArray(connectors)?connectors:[]).map(normalizeConnector),coverage={};for(const cap of RETAIL_CAPABILITIES){const choices=normalized.map(c=>({key:c.key,name:c.name,state:c.capabilities[cap].state})).filter(x=>x.state!=='UNMAPPED'&&x.state!=='DISABLED');coverage[cap]={ready:choices.some(x=>x.state==='LIVE'),choices}}
 return{connectors:normalized.map(c=>({key:c.key,name:c.name,family:c.family})),coverage}
}
