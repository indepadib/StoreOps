import assert from 'node:assert/strict';
import {evaluateProcessTemplate,assertProcessCompletable} from '../services/process-template-engine.mjs';
import {normalizeRetailInsights,quickPulse} from '../services/retail-insights.mjs';
import {compileExport} from '../services/export-template.mjs';

const closing={code:'closing',name:'Fermeture magasin',steps:[{code:'loss',title:'Démarque saisie',required:true},{code:'cash',title:'Caisses clôturées',required:true}],gates:[{code:'loss_export',label:'Fichier démarque prêt',required:true}]};
let state=evaluateProcessTemplate(closing,{stepStates:{loss:{status:'COMPLETED'},cash:{status:'COMPLETED'}},gateStates:{loss_export:false}});
assert.equal(state.status,'IN_PROGRESS');
assert.equal(state.blockers.length,1);
assert.throws(()=>assertProcessCompletable(closing,{stepStates:{loss:{status:'COMPLETED'},cash:{status:'COMPLETED'}},gateStates:{loss_export:false}}),e=>e.code==='PROCESS_BLOCKED');
state=assertProcessCompletable(closing,{stepStates:{loss:{status:'COMPLETED'},cash:{status:'COMPLETED'}},gateStates:{loss_export:true}});
assert.equal(state.status,'READY_TO_COMPLETE');

const insights=normalizeRetailInsights({storeId:'val-fleuri',sales:10000,tickets:200,marginValue:2300,target:11000,comparison:9000,lossValue:120,outOfStockCount:3,departments:[{name:'Frais',sales:4000,marginValue:1000},{name:'Épicerie',sales:3000,marginValue:600}]});
assert.equal(insights.kpis.averageBasket,50);
assert.equal(insights.kpis.marginRate,23);
assert.equal(insights.breakdowns.departments[0].label,'Frais');
assert.equal(quickPulse(insights).cards[0].key,'oos');

const template={code:'loss-d365',target:'D365',delimiter:';',fileNamePattern:'loss_{storeId}_{businessDate}.{extension}',columns:[{name:'Item',source:'product_number',required:true},{name:'Qty',source:'quantity',required:true,type:'number',decimals:3},{name:'Reason',source:'reason_code',required:true}]};
let out=compileExport(template,[{product_number:'HS-1',quantity:2,reason_code:'BREAKAGE'}],{storeId:'val-fleuri',businessDate:'2026-09-10'});
assert.equal(out.ready,true);assert.equal(out.fileName,'loss_val-fleuri_2026-09-10.csv');assert.match(out.content,/HS-1;2\.000;BREAKAGE/);
out=compileExport(template,[{quantity:2,reason_code:'BREAKAGE'}],{storeId:'val-fleuri'});assert.equal(out.ready,false);assert.equal(out.errors[0].column,'Item');

console.log('StoreOps SaaS retail kernel contract OK');
