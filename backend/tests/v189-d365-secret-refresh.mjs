import assert from 'node:assert/strict';

process.env.D365_CLIENT_SECRET='stale-process-secret';
let currentSecret='runtime-secret-v1';
globalThis.Netlify={env:{get:key=>key==='D365_CLIENT_SECRET'?currentSecret:undefined}};

const {config}=await import(`../config.mjs?v189=${Date.now()}`);
assert.equal(config.dynamics.clientSecret,'runtime-secret-v1','Netlify runtime secret must override stale process.env');

currentSecret='runtime-secret-v2';
assert.equal(config.dynamics.clientSecret,'runtime-secret-v2','secret rotation must be visible without re-importing config');

currentSecret='';
assert.equal(config.dynamics.clientSecret,'','explicit empty Netlify runtime value must be respected');

delete globalThis.Netlify;
assert.equal(config.dynamics.clientSecret,'stale-process-secret','local/runtime fallback must remain process.env');

console.log('V1.89 dynamic D365 secret refresh contract: OK');
