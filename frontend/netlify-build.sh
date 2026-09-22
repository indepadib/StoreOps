#!/usr/bin/env sh
set -eu
if [ -n "${STOREOPS_API_BASE:-}" ]; then MODE="api"; else MODE="showcase"; fi
export STOREOPS_RUNTIME_MODE="$MODE"
export STOREOPS_RELEASE_BUILD="${STOREOPS_RELEASE_BUILD:-2270}"
node <<'NODE' > runtime-config.js
const clientId=process.env.STOREOPS_ENTRA_CLIENT_ID||process.env.STOREOPS_ENTRA_SPA_CLIENT_ID||'';
const tenantId=process.env.STOREOPS_ENTRA_TENANT_ID||'';
const apiScope=process.env.STOREOPS_ENTRA_API_SCOPE||(clientId?'api://'+clientId+'/StoreOps.Access':'');
const cfg={apiBase:process.env.STOREOPS_API_BASE||'',mode:process.env.STOREOPS_RUNTIME_MODE||'showcase',entra:{tenantId,spaClientId:clientId,apiScope}};
process.stdout.write('window.STOREOPS_CONFIG = '+JSON.stringify(cfg)+';\n');
NODE
cat ./js/boot-classic.js >> runtime-config.js

# Keep only the small early-runtime graph required before the deferred application
# modules: tenant branding, boot rescue and auth-entry. Normalize their cache key
# at build time so a production release cannot mix previous JS generations.
node <<'NODE'
const fs=require('fs');
const file='index.html';
const build=String(process.env.STOREOPS_RELEASE_BUILD||'2270');
let html=fs.readFileSync(file,'utf8');
const allowed=new Set(['/js/tenant-branding.js','/js/boot-rescue.js','/js/auth-entry.js']);
html=html.replace(/<script type="module" src="(\/js\/[^"?]+\.js)(?:\?v=[^"]+)?"><\/script>/g,(tag,src)=>allowed.has(src)?`<script type="module" src="${src}?v=${build}"></script>`:'');
fs.writeFileSync(file,html);
NODE
