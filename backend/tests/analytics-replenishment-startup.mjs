import assert from 'node:assert/strict';

globalThis.document={
 getElementById:()=>null,
 createElement:()=>({}),
 addEventListener:()=>{},
};
const {mountReplenishment}=await import('../../frontend/analytics/replenishment.js');

const legacyHost={
 querySelector:selector=>selector==='form'?{elements:{namedItem:()=>null}}:null,
};
assert.doesNotThrow(()=>mountReplenishment({},legacyHost));

const scope={value:'',replaceChildren(){}};
const button={};
const status={};
const result={replaceChildren(){}};
const label={};
const form={elements:{namedItem:()=>scope},querySelector:()=>button};
const nodes=new Map([
 ['form[data-repl-order]',form],
 ['[role=status]',status],
 ['[data-repl-result]',result],
 ['[data-scope-label]',label],
]);
const host={querySelector:selector=>nodes.get(selector),querySelectorAll:()=>[]};
mountReplenishment({getState:()=>({section:'sales'})},host);
assert.equal(typeof scope.onchange,'function');
assert.equal(typeof form.onsubmit,'function');
assert.equal(button.textContent,'Générer le TO');
assert.equal(button.disabled,true);
console.log('Analytics replenishment startup OK');
