import assert from 'node:assert/strict';

const base=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';

async function get(path,user){
  const r=await fetch(`${base}${path}`,{headers:{'x-demo-user':user}});
  const body=await r.json().catch(()=>({}));
  return {status:r.status,body};
}

const vf=await get('/api/stores/val-fleuri/stock-signals','u-vf');
assert.equal(vf.status,200);
assert.equal(vf.body.source,'SIMULATED');
assert.equal(vf.body.warehouse,'FRP0001');
assert.ok(vf.body.summary.negative>=1);
assert.ok(vf.body.summary.outOfStock>=1);
assert.ok(vf.body.items.some(x=>x.type==='NEGATIVE'&&x.priority==='P0'));
assert.ok(vf.body.items.some(x=>x.type==='OUT'&&x.priority==='P1'));

const forbidden=await get('/api/stores/trefle/stock-signals','u-vf');
assert.equal(forbidden.status,403);

// Non-pilot stores do not receive invented warehouse fallbacks.
const tr=await get('/api/stores/trefle/stock-signals','u-tr');
assert.equal(tr.status,200);
assert.equal(tr.body.source,'SIMULATED');
assert.equal(tr.body.warehouse,null);
assert.equal(tr.body.items.length,0);

console.log('Stock signals explicit mapping API: OK');
