import type { Config } from '@netlify/functions';
declare const Netlify:{env:{get(key:string):string|undefined}};
export default async()=>{
 const secret=Netlify.env.get('STOREOPS_MONITOR_SECRET')??process.env.STOREOPS_MONITOR_SECRET;
 const base=(Netlify.env.get('URL')||process.env.URL||'').replace(/\/$/,'');
 if(!secret||!base)return Response.json({status:'DISABLED'});
 const response=await fetch(base+'/api/internal/crm/master-sync',{method:'POST',headers:{'content-type':'application/json','x-storeops-monitor-secret':secret},body:'{}'});
 if(!response.ok)throw new Error('CRM master sync failed: '+response.status);
 return new Response(await response.text(),{status:200,headers:{'content-type':'application/json'}});
};
export const config:Config={schedule:'* * * * *'};
