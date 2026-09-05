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
