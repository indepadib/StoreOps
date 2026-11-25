// Strict, bounded segment expression compiler. Pure evaluation; no SQL or execution of user code.
const fields=Object.freeze({
 recencyDays:{kind:'integer',min:0,max:36500},
 purchaseTickets:{kind:'integer',min:0,max:Number.MAX_SAFE_INTEGER},
 netMinor:{kind:'integer',min:-Number.MAX_SAFE_INTEGER,max:Number.MAX_SAFE_INTEGER},
 averageNetMinor:{kind:'integer',min:-Number.MAX_SAFE_INTEGER,max:Number.MAX_SAFE_INTEGER},
 stores:{kind:'list'}
});
const ops=new Set(['eq','gte','lte','gt','lt']);
export function compileSegment(expression){
 let count=0;
 function compile(node,depth){
  if(!node||typeof node!=='object'||Array.isArray(node)||depth>5||++count>50)throw Error('Invalid or oversized segment');
  if(node.kind==='group'){
   if(!['all','any'].includes(node.match)||!Array.isArray(node.children)||!node.children.length||node.children.length>12)throw Error('Invalid group');
   const children=node.children.map(n=>compile(n,depth+1));
   return p=>node.match==='all'?children.every(fn=>fn(p)):children.some(fn=>fn(p));
  }
  if(node.kind!=='rule'||!Object.hasOwn(fields,node.field))throw Error('Unsupported rule');
  const field=node.field,operator=node.op,value=node.value,spec=fields[field];
  if(spec.kind==='list'){
   if(operator!=='contains'||typeof value!=='string'||!value.trim()||value.length>80)throw Error('Invalid store rule');
   return p=>Array.isArray(p.stores)&&p.stores.includes(value);
  }
  if(!ops.has(operator)||!Number.isSafeInteger(value)||value<spec.min||value>spec.max)throw Error('Invalid numeric rule');
  return p=>{const x=p[field];if(!Number.isSafeInteger(x))return false;switch(operator){case 'eq':return x===value;case 'gte':return x>=value;case 'lte':return x<=value;case 'gt':return x>value;case 'lt':return x<value;default:return false}};
 }
 return compile(expression,0);
}
export function evaluateSegment(snapshot,{tenantId,expression}){
 if(!tenantId||snapshot?.tenantId!==tenantId||!Array.isArray(snapshot.profiles))throw Error('Tenant mismatch');
 if(snapshot.profiles.some(p=>p.tenantId!==tenantId))throw Error('Profile outside tenant');
 const predicate=compileSegment(expression);
 return snapshot.profiles.filter(p=>p.recencyDays!==null&&predicate(p));
}
