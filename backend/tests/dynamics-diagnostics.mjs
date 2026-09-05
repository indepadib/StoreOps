process.env.D365_MODE='simulated';
const {getDynamicsDiagnostics,probeDataEntity}=await import('../services/dynamics.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const d=await getDynamicsDiagnostics();ok(d.mode==='SIMULATED'&&d.connected===false,'simulated diagnostics mode failed');ok(d.configuration?.clientSecret?.configured===false,'secret presence flag failed');const text=JSON.stringify(d);ok(!text.includes('access_token')&&!text.includes('client_secret'),'diagnostics must never expose token/secret fields');const p=await probeDataEntity('ReleasedProductsV2',{top:1});ok(p.ok===false&&p.mode==='SIMULATED','simulated entity probe failed');console.log('StoreOps V1.14 Dynamics diagnostics engine tests passed');
