import assert from'node:assert/strict';
import{readFileSync,rmSync}from'node:fs';
import path from'node:path';
import{fileURLToPath}from'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dbPath='/tmp/storeops-netlify-backend-contract.db';
rmSync(dbPath,{force:true});rmSync(`${dbPath}-wal`,{force:true});rmSync(`${dbPath}-shm`,{force:true});
process.env.STOREOPS_DB=dbPath;
process.env.STOREOPS_MEDIA_DIR='/tmp/storeops-netlify-backend-media';
process.env.AUTH_MODE='demo';
process.env.D365_MODE='simulated';

const{db,ensureStoreDay}=await import('../db.mjs');
const{storeOperatingProfile}=await import('../services/pilot-profile.mjs');
const{coldChainConfig}=await import('../services/cold-chain.mjs');
const{cashConfig}=await import('../services/cash.mjs');
const{dlcConfig}=await import('../services/dlc.mjs');
const{inventoryConfig}=await import('../services/inventory.mjs');
const{commercialConfig}=await import('../services/commercial.mjs');
const{lossConfig}=await import('../services/loss.mjs');

ensureStoreDay('val-fleuri','2026-09-06');
assert.equal(storeOperatingProfile('val-fleuri')?.pilot,true);

db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();
db.open();
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

assert.ok(coldChainConfig().profiles.length>=3,'cold chain must survive SQLite reopen');
assert.ok(cashConfig().policy,'cash engine must survive SQLite reopen');
assert.ok(dlcConfig().departments.length>0,'DLC engine must survive SQLite reopen');
assert.ok(inventoryConfig().policy,'inventory engine must survive SQLite reopen');
assert.ok(commercialConfig().policy,'commercial engine must survive SQLite reopen');
assert.ok(lossConfig().policy,'loss engine must survive SQLite reopen');
assert.equal(storeOperatingProfile('val-fleuri')?.manager?.role,'store_manager');

const fn=readFileSync(path.join(root,'netlify/functions/api.mts'),'utf8');
const toml=readFileSync(path.join(root,'netlify.toml'),'utf8');
const migration=readFileSync(path.join(root,'netlify/database/migrations/20260906103000_storeops-sqlite-state/migration.sql'),'utf8');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
assert.match(fn,/pg_advisory_xact_lock/,'public backend must serialize SQLite snapshots');
assert.match(fn,/storeops_sqlite_state/,'public backend must persist the SQLite state centrally');
assert.match(fn,/path:'\/api\/\*'/,'Netlify function must own /api/*');
assert.match(fn,/Netlify\.env\.get/,'Netlify runtime must read deployment values via Netlify.env');
assert.doesNotMatch(fn,/client_secret\s*[:=]\s*['"][^'"]+/i,'no client secret may be committed in the Function');
assert.match(toml,/base = "\."/,'Netlify build base must expose backend and function sources');
assert.match(toml,/directory = "netlify\/functions"/,'Netlify functions directory missing');
assert.match(toml,/NODE_VERSION = "22"/,'node:sqlite requires the Node 22 runtime contract');
assert.match(migration,/db_bytes BYTEA/,'central state must persist the SQLite bytes');
assert.ok(pkg.dependencies?.['@netlify/database'],'Netlify Database dependency missing');
console.log('StoreOps public backend persistence contract OK');
