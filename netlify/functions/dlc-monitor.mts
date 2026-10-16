import type { Config } from '@netlify/functions';

declare const Netlify:{env:{get(key:string):string|undefined}};

function env(key:string){return Netlify.env.get(key)??process.env[key]}

export default async()=>{
 const secret=env('STOREOPS_MONITOR_SECRET');
 const base=(env('URL')||env('DEPLOY_PRIME_URL')||'').replace(/\/$/,'');
 if(!secret||!base)return Response.json({ok:false,disabled:true,reason:'STOREOPS_MONITOR_SECRET_OR_SITE_URL_MISSING'},{status:200});
 const response=await fetch(base+'/api/internal/dlc-markdown/monitor',{method:'POST',headers:{'content-type':'application/json','x-storeops-monitor-secret':secret},body:'{}'});
 const body=await response.text();
 if(!response.ok)throw new Error('DLC monitor failed: '+response.status+' '+body.slice(0,180));
 return new Response(body,{status:200,headers:{'content-type':'application/json'}});
};

export const config:Config={schedule:'*/15 * * * *'};
