process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-pilot-profile.db';
const {db}=await import('../db.mjs');
const {storeOperatingProfile,storeTerminals}=await import('../services/pilot-profile.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const p=storeOperatingProfile('val-fleuri');
ok(p?.pilot===true,'Val Fleuri must be flagged as pilot');
ok(p.store.opening_time==='08:00'&&p.store.closing_time==='23:00','Val Fleuri opening hours mismatch');
ok(p.manager?.name==='Ayoub Nachiti'&&p.manager?.role==='store_manager','Val Fleuri manager provisioning mismatch');
const terminals=storeTerminals('val-fleuri');
ok(terminals.length===2,'Val Fleuri must have two active tills');
ok(terminals[0].till_code==='C01'&&terminals[0].tpe_mode==='INTEGRATED','C01 must use integrated TPE');
ok(terminals[1].till_code==='C02'&&terminals[1].tpe_mode==='MANUAL','C02 must use manual TPE');
ok(terminals.every(x=>Number(x.expected_float)===1000),'Val Fleuri must use 1000 DH opening float per till');
const cols=db.prepare(`PRAGMA table_info(users)`).all();ok(cols.some(x=>x.name==='dynamics_email'),'Dynamics identity column missing');
const terminalCols=db.prepare(`PRAGMA table_info(store_terminals)`).all();ok(terminalCols.some(x=>x.name==='expected_float'),'Store terminal opening float column missing');
console.log('Val Fleuri pilot profile OK');
