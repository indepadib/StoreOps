import assert from 'node:assert/strict';
const base=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
const h=await fetch(`${base}/api/health`).then(r=>r.json());
assert.equal(h.ok,true);
assert.equal(h.version,'2.37.1');
const c=await fetch(`${base}/api/config`,{headers:{'x-demo-user':'u-ops'}}).then(r=>r.json());
assert.equal(c.version,h.version);
assert.equal(c.version,'2.37.1');
console.log('StoreOps V2.37 health/config version API tests passed');
