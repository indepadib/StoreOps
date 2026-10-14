#!/usr/bin/env sh
# V2.26 production release recovery — force a verified PR/Netlify build path.
set -eu
if [ -n "${STOREOPS_API_BASE:-}" ]; then MODE="api"; else MODE="showcase"; fi
export STOREOPS_RUNTIME_MODE="$MODE"
export STOREOPS_RELEASE_BUILD="${STOREOPS_RELEASE_BUILD:-2403}"
node <<'NODE' > analytics-runtime-config.js
const clientId=process.env.STOREOPS_ENTRA_CLIENT_ID||process.env.STOREOPS_ENTRA_SPA_CLIENT_ID||'';
const tenantId=process.env.STOREOPS_ENTRA_TENANT_ID||'';
const apiScope=process.env.STOREOPS_ENTRA_API_SCOPE||(clientId?'api://'+clientId+'/StoreOps.Access':'');
const cfg={apiBase:process.env.STOREOPS_API_BASE||'',mode:process.env.STOREOPS_RUNTIME_MODE||'showcase',entra:{tenantId,spaClientId:clientId,apiScope}};
const build=(process.env.COMMIT_REF||process.env.DEPLOY_ID||process.env.STOREOPS_RELEASE_BUILD||'dev').slice(0,12);
process.stdout.write('window.STOREOPS_CONFIG = '+JSON.stringify(cfg)+';\nwindow.RETAIL_INTELLIGENCE_BUILD = '+JSON.stringify(build)+';\n');
NODE
cp analytics-runtime-config.js runtime-config.js
cat ./js/boot-classic.js >> runtime-config.js

# Analytics deploy previews must call their own Netlify /api/* route. Calling the
# production custom domain from a deploy-preview origin is cross-origin and is
# blocked by the browser before authentication even starts.
cat <<'EOF' >> analytics-runtime-config.js
if (location.hostname.endsWith('.netlify.app')) {
  window.STOREOPS_CONFIG.apiBase = location.origin;
  window.STOREOPS_CONFIG.mode = 'api';
}
EOF

# Cache-bust every Analytics shell asset with the exact deployed commit. This is
# important while Analytics is evolving quickly: an already-cached JS module must
# never keep a user on an older data-loading contract after a production deploy.
node <<'NODE'
const fs=require('fs');
const file='analytics/index.html';
const build=String(process.env.COMMIT_REF||process.env.DEPLOY_ID||process.env.STOREOPS_RELEASE_BUILD||'dev').slice(0,12);
let html=fs.readFileSync(file,'utf8');
html=html.replace(/(href|src)="(\/analytics\/[^"?]+\.(?:css|js))(?:\?v=[^"]+)?"/g,(m,attr,url)=>`${attr}="${url}?v=${build}"`);
fs.writeFileSync(file,html);
NODE

# Keep only the small early-runtime graph required before the deferred application
# modules: tenant branding, boot rescue and auth-entry. Normalize their cache key
# at build time so a production release cannot mix previous JS generations.
node <<'NODE'
const fs=require('fs');
const file='index.html';
const build=String(process.env.STOREOPS_RELEASE_BUILD||'2403');
let html=fs.readFileSync(file,'utf8');
const allowed=new Set(['/js/tenant-branding.js','/js/boot-rescue.js','/js/auth-entry.js']);
html=html.replace(/<script type="module" src="(\/js\/[^"?]+\.js)(?:\?v=[^"]+)?"><\/script>/g,(tag,src)=>allowed.has(src)?`<script type="module" src="${src}?v=${build}"></script>`:'');
fs.writeFileSync(file,html);
NODE
