import { config } from '../config.mjs';
import { odataGet } from './dynamics.mjs';

function appendExtra(extra,skip){return [String(extra||'').trim(),`$skip=${skip}`].filter(Boolean).join('&')}

export async function odataGetAllBySkip(entity,{filter='',select='',extra='',pageSize=null,maxRows=null}={}){
  const size=Math.max(1,Math.min(2000,Number(pageSize)||config.dynamics.odataPageSize||500));
  const cap=Math.max(size,Math.min(100000,Number(maxRows)||config.dynamics.odataMaxRows||25000));
  const rows=[];
  let skip=0,pages=0;
  while(rows.length<cap){
    const top=Math.min(size,cap-rows.length);
    const payload=await odataGet(entity,{filter,select,top,extra:appendExtra(extra,skip)});
    const page=Array.isArray(payload?.value)?payload.value:[];
    pages+=1;
    if(!page.length)break;
    rows.push(...page.slice(0,cap-rows.length));
    skip+=page.length;
    if(page.length===0)break;
  }
  return{value:rows,rowCount:rows.length,pages,truncated:rows.length>=cap};
}
