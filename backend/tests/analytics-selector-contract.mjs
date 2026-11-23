import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir=path.resolve('frontend/analytics');
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.js')).sort();
const issues=[];

const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const htmlIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));

for(const name of files){
  const full=path.join(dir,name);
  const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
  lines.forEach((line,index)=>{
    if(line.includes('$$$'))issues.push({file:name,line:index+1,kind:'TRIPLE_DOLLAR',source:line.trim()});
    const singleSelectorForEach=/\$\([^)]*\)\.forEach\s*\(/;
    if(singleSelectorForEach.test(line)&&!line.includes('$('))issues.push({file:name,line:index+1,kind:'QUERY_SELECTOR_FOREACH',source:line.trim()});
    for(const match of line.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)\.(textContent|innerHTML|title|className|value|style)\b/g)){
      if(!htmlIds.has(match[1]))issues.push({file:name,line:index+1,kind:'MISSING_REQUIRED_DOM_ID',source:line.trim(),id:match[1]});
    }
  });
}

if(issues.length){
  console.error('Analytics selector contract failed: invalid collection selector or required DOM node.');
  for(const issue of issues)console.error(`${issue.file}:${issue.line} [${issue.kind}] ${issue.source}`);
  process.exit(1);
}

console.log(`Analytics selector contract passed for ${files.length} files.`);

// Verify containment as well as existence. A valid ID outside its widget leaks
// onto unrelated pages even when all JavaScript selectors still resolve.
const markup=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const stack=[],owners=new Map();
for(const match of markup.matchAll(/<\/?([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)){
 const tag=match[1].toLowerCase(),attrs=match[2];
 if(match[0].startsWith('</')){
  const index=stack.findLastIndex(node=>node.tag===tag);
  assert(index>=0,'Closing tag without an open element: '+tag);
  stack.splice(index);continue;
 }
 const id=attrs.match(/\bid="([^"]+)"/)?.[1],widget=attrs.match(/\bdata-widget="([^"]+)"/)?.[1];
 if(id){assert(!owners.has(id),'Duplicate Analytics DOM ID: '+id);owners.set(id,stack.findLast(node=>node.widget)?.widget||null);}
 if(!voidTags.has(tag)&&!match[0].endsWith('/>'))stack.push({tag,widget,id});
}
for(const id of ['biRun','biTabs','bi-filters','basketDirection','bi-global','bi-article','bi-detention','biNotes','bi-products','bi-loadStock']){
 assert.equal(owners.get(id),'customerBi',id+' must stay inside the customer BI widget');
}
for(const id of ['biWorkspace','pricingLab','salesDiagnostic','storeBenchmark','articleReference','replenishmentPanel']){
 assert.equal(owners.get(id),null,id+' must be an independent page widget');
}
assert.equal(owners.get('salesProof'),'decisionSales');
console.log('Analytics widget containment passed for BI controls and independent page sections.');
