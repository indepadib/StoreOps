// A bounded, acyclic journey graph. Simulation only: no scheduler, sends or provider calls.
// The authorization callback represents a fresh decision at each simulated action.
const kinds=['trigger','condition','delay','action','end'],channels=['email','whatsapp','sms','push'];
const fields={recencyDays:[0,36500],purchaseTickets:[0,100000],rfmTotal:[3,15],promotionShareBps:[0,10000]};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const integer=Number.isSafeInteger;
export function validateJourneyGraph(graph){
 if(!graph||!id(graph.entry)||!Array.isArray(graph.nodes)||graph.nodes.length<2||graph.nodes.length>40)throw Error('Invalid graph size or entry');
 const map=new Map();
 for(const n of graph.nodes){
  if(!n||!id(n.id)||map.has(n.id)||!kinds.includes(n.type)||typeof n.label!=='string'||!n.label.trim()||n.label.length>140)throw Error('Invalid node');
  if(n.type==='condition'){
   const r=Object.hasOwn(fields,n.field)?fields[n.field]:null;
   if(!r||!['gte','lte','eq'].includes(n.op)||!integer(n.value)||n.value<r[0]||n.value>r[1]||!id(n.yes)||!id(n.no)||n.yes===n.no)throw Error('Invalid condition');
  }else if(n.type!=='end'&&!id(n.next))throw Error('Missing next step');
  if(n.type==='trigger'&&!['manual','segment_entry','enrollment','purchase'].includes(n.event))throw Error('Invalid trigger');
  if(n.type==='delay'&&(!integer(n.hours)||n.hours<1||n.hours>2160))throw Error('Invalid delay');
  if(n.type==='action'&&!channels.includes(n.channel))throw Error('Invalid channel');
  map.set(n.id,n);
 }
 if(map.get(graph.entry)?.type!=='trigger'||graph.nodes.filter(n=>n.type==='trigger').length!==1||!graph.nodes.some(n=>n.type==='end'))throw Error('Unique trigger and exit required');
 const visiting=new Set(),visited=new Set();
 function walk(key){
  if(visiting.has(key))throw Error('Cycle detected');
  if(visited.has(key))return;
  const n=map.get(key);if(!n)throw Error('Unknown destination');
  visiting.add(key);for(const edge of n.type==='condition'?[n.yes,n.no]:n.type==='end'?[]:[n.next])walk(edge);
  visiting.delete(key);visited.add(key);
 }
 walk(graph.entry);if(visited.size!==map.size)throw Error('Unreachable node');
 return {valid:true,nodeCount:map.size,activationEnabled:false};
}
export function simulateJourney({graph,profile,event,authorize}){
 validateJourneyGraph(graph);
 if(!profile||typeof profile!=='object'||typeof authorize!=='function')throw Error('Simulation context required');
 const map=new Map(graph.nodes.map(n=>[n.id,n])),trace=[];let key=graph.entry,hours=0,proposed=0;
 const result=(status,reason)=>({status,reason,elapsedHours:hours,proposedActions:proposed,trace,activationEnabled:false});
 while(key){
  const n=map.get(key);
  if(n.type==='trigger'){if(n.event!==event)return result('NOT_TRIGGERED','Event mismatch');trace.push({id:key,type:n.type,atHours:hours,result:'MATCHED'});key=n.next}
  else if(n.type==='condition'){
   const v=profile[n.field],r=fields[n.field];if(!integer(v)||v<r[0]||v>r[1])return result('BLOCKED','Condition evidence unavailable');
   const yes=n.op==='gte'?v>=n.value:n.op==='lte'?v<=n.value:v===n.value;
   trace.push({id:key,type:n.type,atHours:hours,result:yes?'YES':'NO',observed:v});key=yes?n.yes:n.no;
  }else if(n.type==='delay'){hours+=n.hours;trace.push({id:key,type:n.type,atHours:hours,result:'WAIT_SIMULATED'});key=n.next}
  else if(n.type==='action'){
   const permission=authorize({channel:n.channel,nodeId:n.id,elapsedHours:hours});
   const permitted=permission?.eligible===true&&permission?.verified===true;
   trace.push({id:key,type:n.type,atHours:hours,result:permitted?'PROPOSED':'BLOCKED_CONSENT',channel:n.channel});
   if(!permitted)return result('BLOCKED','Action authorization unavailable');
   proposed++;key=n.next;
  }else{trace.push({id:key,type:n.type,atHours:hours,result:'EXIT'});return result('COMPLETED','Simulation complete')}
 }
 throw Error('Invalid execution');
}
