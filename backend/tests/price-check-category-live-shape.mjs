import assert from 'node:assert/strict';
const choose=(fallback,category)=>fallback&&fallback!=='Autre'?fallback:(category||fallback||'Autre');
assert.equal(choose('Autre','FPXMPX - Dépannage'),'FPXMPX - Dépannage');
assert.equal(choose('Frais','FPXMPX - Dépannage'),'Frais');
console.log('StoreOps V1.19.1 category fallback test passed');
