#!/usr/bin/env sh
set -eu
if [ -n "${STOREOPS_API_BASE:-}" ]; then MODE="api"; else MODE="showcase"; fi
export STOREOPS_RUNTIME_MODE="$MODE"
export STOREOPS_RELEASE_BUILD="${STOREOPS_RELEASE_BUILD:-2000}"
node <<'NODE' > runtime-config.js
const clientId=process.env.STOREOPS_ENTRA_CLIENT_ID||process.env.STOREOPS_ENTRA_SPA_CLIENT_ID||'';
const tenantId=process.env.STOREOPS_ENTRA_TENANT_ID||'';
const apiScope=process.env.STOREOPS_ENTRA_API_SCOPE||(clientId?'api://'+clientId+'/StoreOps.Access':'');
const cfg={apiBase:process.env.STOREOPS_API_BASE||'',mode:process.env.STOREOPS_RUNTIME_MODE||'showcase',entra:{tenantId,spaClientId:clientId,apiScope}};
process.stdout.write('window.STOREOPS_CONFIG = '+JSON.stringify(cfg)+';\n');
NODE
cat ./js/boot-classic.js >> runtime-config.js

# V2.00 performance: collapse every render-blocking CSS file declared in index.html
# into one versioned production bundle. All source CSS remains in the repository for
# maintainability; only the generated deploy surface is consolidated.
node <<'NODE'
const fs=require('fs');
const file='index.html';
const build=String(process.env.STOREOPS_RELEASE_BUILD||'2000');
let html=fs.readFileSync(file,'utf8');
const css=[];
html.replace(/<link\s+rel="stylesheet"\s+href="(\/[^"?]+\.css)(?:\?v=[^"]+)?"\s*\/?>/g,(tag,href)=>{css.push(href);return tag});
const unique=[...new Set(css)];
if(!unique.length)throw new Error('No stylesheet links found in index.html');
const chunks=[];
for(const href of unique){
  const local=href.replace(/^\//,'');
  if(!fs.existsSync(local))throw new Error(`Missing stylesheet ${local}`);
  chunks.push(`/* ---- ${local} ---- */\n${fs.readFileSync(local,'utf8').trim()}\n`);
}
fs.writeFileSync('storeops.bundle.css',chunks.join('\n'));
let inserted=false;
html=html.replace(/<link\s+rel="stylesheet"\s+href="(\/[^"?]+\.css)(?:\?v=[^"]+)?"\s*\/?>/g,()=>{
  if(inserted)return'';
  inserted=true;
  return `<link rel="stylesheet" href="/storeops.bundle.css?v=${build}">`;
});
fs.writeFileSync(file,html);
const bytes=fs.statSync('storeops.bundle.css').size;
console.log(`StoreOps CSS bundle: ${unique.length} files -> 1 request, ${bytes} bytes`);
NODE

# Keep only the small early-runtime graph required before the deferred application
# modules: tenant branding, boot rescue and auth-entry. Normalize all critical cache
# keys from one release build value so production cannot mix JS generations.
node <<'NODE'
const fs=require('fs');
const build=String(process.env.STOREOPS_RELEASE_BUILD||'2000');
const label=build==='2000'?'2.00.0':build;
const indexFile='index.html';
let html=fs.readFileSync(indexFile,'utf8');
const allowed=new Set(['/js/tenant-branding.js','/js/boot-rescue.js','/js/auth-entry.js']);
html=html.replace(/<script type="module" src="(\/js\/[^"?]+\.js)(?:\?v=[^"]+)?"><\/script>/g,(tag,src)=>allowed.has(src)?`<script type="module" src="${src}?v=${build}"></script>`:'');
fs.writeFileSync(indexFile,html);

const authFile='js/auth-entry.js';
let auth=fs.readFileSync(authFile,'utf8');
auth=auth.replace(/enhancements-entry\.js\?v=\d+/g,`enhancements-entry.js?v=${build}`)
         .replace(/const BUILD='\d+';/,`const BUILD='${build}';`)
         .replace(/const BUILD_LABEL='[^']+';/,`const BUILD_LABEL='${label}';`);
fs.writeFileSync(authFile,auth);

const enhancementsFile='js/enhancements-entry.js';
let enhancements=fs.readFileSync(enhancementsFile,'utf8');
enhancements=enhancements.replace(/const BUILD='\d+';/,`const BUILD='${build}';`);
fs.writeFileSync(enhancementsFile,enhancements);
NODE
