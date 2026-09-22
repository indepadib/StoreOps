import assert from 'node:assert/strict';
import '../services/pilot-profile.mjs';
import { db } from '../db.mjs';
import { createEmployee,endEmployeeContract } from '../services/workforce.mjs';
import { accessProfiles,isPlatformAdmin,createAccessAccount,updateAccessAccount,setAccessAccountActive,listAccessAccounts,deactivateAccountsForEmployee } from '../services/access-management.mjs';

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
const director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get();
assert.equal(isPlatformAdmin(admin),true);
assert.equal(isPlatformAdmin(director),false);
assert.ok(accessProfiles().some(x=>x.code==='STORE_MANAGER'));
assert.ok(accessProfiles().some(x=>x.code==='PLATFORM_ADMIN'));
assert.ok(accessProfiles().some(x=>x.code==='QUALITY_AUDIT'));
assert.ok(accessProfiles().some(x=>x.code==='CONTROLLING'));
assert.ok(accessProfiles().some(x=>x.code==='EXECUTIVE'));

const employee=createEmployee({storeId:'val-fleuri',user:admin,employeeCode:'ACC-001',firstName:'Sara',lastName:'Test',roleCode:'FLOOR',contractType:'CDI',contractStart:'2026-09-01',email:'sara.test@oneretail.ma'});
const account=createAccessAccount({actor:admin,name:'Sara Test',emailAddress:'sara.test@oneretail.ma',profileCode:'STORE_USER',storeId:'val-fleuri',linkedEmployeeId:employee.id,identityProvider:'ENTRA'});
assert.equal(account.storeId,'val-fleuri');
assert.equal(account.linkedEmployeeId,employee.id);
assert.equal(account.profileCode,'STORE_USER');
assert.equal(account.active,true);

assert.throws(()=>createAccessAccount({actor:admin,name:'Wrong Store',emailAddress:'wrong@oneretail.ma',profileCode:'STORE_USER',storeId:'trefle',linkedEmployeeId:employee.id,identityProvider:'ENTRA'}),/même magasin/);
assert.throws(()=>createAccessAccount({actor:director,name:'Another Director',emailAddress:'dir2@oneretail.ma',profileCode:'OPS_DIRECTOR',identityProvider:'ENTRA'}),e=>e.code==='PLATFORM_ADMIN_REQUIRED');

const promoted=updateAccessAccount({actor:admin,userId:account.id,name:'Sara Test',emailAddress:'sara.test@oneretail.ma',profileCode:'STORE_MANAGER',storeId:'val-fleuri',linkedEmployeeId:employee.id,identityProvider:'ENTRA'});
assert.equal(promoted.profileCode,'STORE_MANAGER');
assert.equal(promoted.storeId,'val-fleuri');

assert.throws(()=>setAccessAccountActive({actor:admin,userId:'u-admin',active:false}),e=>e.code==='ACCESS_SELF_DEACTIVATION_FORBIDDEN');
const off=setAccessAccountActive({actor:admin,userId:account.id,active:false});assert.equal(off.active,false);
const on=setAccessAccountActive({actor:admin,userId:account.id,active:true});assert.equal(on.active,true);

endEmployeeContract({employeeId:employee.id,user:admin,endDate:'2026-09-30',reason:'Fin test'});
const deprovision=deactivateAccountsForEmployee({actor:admin,employeeId:employee.id,reason:'CONTRACT_ENDED'});
assert.deepEqual(deprovision.deactivated,[account.id]);
assert.equal(listAccessAccounts({includeInactive:true}).find(x=>x.id===account.id).active,false);

assert.equal(db.prepare(`SELECT permissions_profile FROM users WHERE id='u-admin'`).get().permissions_profile,'platform_admin');
console.log('V1.80 access management governance contract OK');
