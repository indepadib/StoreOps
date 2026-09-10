const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a)];

export function normalizeProcessTemplate(input={}){
 const code=clean(input.code);if(!code)throw Object.assign(new Error('Process code obligatoire.'),{status:400});
 const steps=(Array.isArray(input.steps)?input.steps:[]).map((s,i)=>({
  code:clean(s.code)||`step_${i+1}`,
  title:clean(s.title)||clean(s.code)||`Étape ${i+1}`,
  order:Number.isFinite(Number(s.order))?Number(s.order):i+1,
  required:s.required!==false,
  role:s.role?clean(s.role):null,
  evidenceRequired:!!s.evidenceRequired,
  blockingLevel:clean(s.blockingLevel)||'PROCESS',
  fields:Array.isArray(s.fields)?s.fields:[]
 })).sort((a,b)=>a.order-b.order);
 if(!steps.length)throw Object.assign(new Error('Un process doit contenir au moins une étape.'),{status:400});
 if(uniq(steps.map(x=>x.code)).length!==steps.length)throw Object.assign(new Error('Les codes étapes doivent être uniques.'),{status:400});
 const gates=(Array.isArray(input.gates)?input.gates:[]).map((g,i)=>({
  code:clean(g.code)||`gate_${i+1}`,
  label:clean(g.label)||clean(g.code)||`Condition ${i+1}`,
  required:g.required!==false,
  blockingLevel:clean(g.blockingLevel)||'PROCESS'
 }));
 return {code,name:clean(input.name)||code,version:clean(input.version)||'1',trigger:clean(input.trigger)||'MANUAL',scope:clean(input.scope)||'STORE',steps,gates,exportTemplateCode:input.exportTemplateCode?clean(input.exportTemplateCode):null};
}

export function evaluateProcessTemplate(templateInput,{stepStates={},gateStates={}}={}){
 const t=normalizeProcessTemplate(templateInput),steps=t.steps.map(s=>{
  const raw=stepStates[s.code]||{},status=clean(raw.status||'PENDING').toUpperCase();
  const completed=status==='COMPLETED';
  const evidenceOk=!s.evidenceRequired||Number(raw.evidenceCount||0)>0;
  return {...s,status,completed,evidenceOk,blocking:s.required&&(!completed||!evidenceOk)};
 });
 const gates=t.gates.map(g=>{const raw=gateStates[g.code],ok=raw===true||raw?.ok===true;return{...g,ok,detail:raw&&typeof raw==='object'?raw.detail||null:null,blocking:g.required&&!ok}});
 const blockers=[...steps.filter(x=>x.blocking).map(x=>({type:'STEP',code:x.code,label:x.title,blockingLevel:x.blockingLevel})),...gates.filter(x=>x.blocking).map(x=>({type:'GATE',code:x.code,label:x.label,blockingLevel:x.blockingLevel,detail:x.detail}))];
 const required=steps.filter(x=>x.required),completed=required.filter(x=>x.completed&&x.evidenceOk).length,current=steps.find(x=>x.required&&(!x.completed||!x.evidenceOk))||steps.find(x=>!x.completed)||null;
 return {template:t,status:blockers.length?'IN_PROGRESS':'READY_TO_COMPLETE',progress:{completed,total:required.length,percent:required.length?Math.round(completed*100/required.length):100},blockers,currentStep:current};
}

export function assertProcessCompletable(template,state){
 const result=evaluateProcessTemplate(template,state);if(result.blockers.length){const e=new Error(`${result.blockers.length} obligation(s) empêchent la validation du process.`);e.status=409;e.code='PROCESS_BLOCKED';e.details=result;throw e}return result;
}

export function primaryProcessAction(result={}){
 const current=result.currentStep;if(current)return{type:'STEP',code:current.code,label:current.title};
 const blocker=result.blockers?.[0];if(blocker)return{type:blocker.type,code:blocker.code,label:blocker.label};
 return{type:'COMPLETE',code:'complete',label:'Valider'};
}
