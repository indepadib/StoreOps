import assert from 'node:assert/strict';
import '../services/pilot-profile.mjs';
import { db } from '../db.mjs';
import { tenantProfile,updateTenantProfile } from '../services/tenant-profile.mjs';

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'Admin StoreOps must exist');
let p=tenantProfile();
assert.equal(p.brandName,'Franprix');
assert.equal(p.appName,'StoreOps');
assert.equal(p.currency,'MAD');
assert.equal(p.vocabulary.store,'magasin');
assert.equal(p.modules.OPERATIONS,true);

p=updateTenantProfile({actor:admin,input:{brandName:'Retail Demo',appName:'StoreOps',accentColor:'#112233',currency:'MAD',country:'MA',vocabulary:{store:'boutique',manager:'Manager'},modules:{DEVELOPMENT:false,QUALITY:true}}});
assert.equal(p.brandName,'Retail Demo');
assert.equal(p.accentColor,'#112233');
assert.equal(p.vocabulary.store,'boutique');
assert.equal(p.vocabulary.manager,'Manager');
assert.equal(p.modules.DEVELOPMENT,false);
assert.equal(p.modules.QUALITY,true);
assert.equal(p.modules.OPERATIONS,true,'Unspecified modules keep their previous/default state');

assert.throws(()=>updateTenantProfile({actor:admin,input:{accentColor:'pink'}}),/Couleur principale invalide/);
console.log('V1.81 tenant profile, vocabulary and module flags contract OK');
