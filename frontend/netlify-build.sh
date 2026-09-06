#!/usr/bin/env sh
set -eu
if [ -n "${STOREOPS_API_BASE:-}" ]; then MODE="api"; else MODE="showcase"; fi
export STOREOPS_RUNTIME_MODE="$MODE"
node <<'NODE' > runtime-config.js
const clientId=process.env.STOREOPS_ENTRA_CLIENT_ID||process.env.STOREOPS_ENTRA_SPA_CLIENT_ID||'';
const tenantId=process.env.STOREOPS_ENTRA_TENANT_ID||'';
const apiScope=process.env.STOREOPS_ENTRA_API_SCOPE||(clientId?'api://'+clientId+'/StoreOps.Access':'');
const cfg={apiBase:process.env.STOREOPS_API_BASE||'',mode:process.env.STOREOPS_RUNTIME_MODE||'showcase',entra:{tenantId,spaClientId:clientId,apiScope}};
process.stdout.write('window.STOREOPS_CONFIG = '+JSON.stringify(cfg)+';\n');
NODE
cat ./js/boot-classic.js >> runtime-config.js

# Safari/iPhone pilot: only one ES-module entry point is left in index.html.
# auth-entry.js loads the optional enhancement modules sequentially before app.js,
# avoiding several large module graphs starting concurrently during first paint.
node <<'NODE'
const fs=require('fs');
const file='index.html';
let html=fs.readFileSync(file,'utf8');
const keep='/js/auth-entry.js';
html=html.replace(/<script type="module" src="\/js\/[^"]+\.js"><\/script>/g,tag=>tag.includes(keep)?tag:'');
fs.writeFileSync(file,html);
NODE
