import fs from 'node:fs';
import path from 'node:path';

const dir=path.resolve('frontend/analytics');
const files=fs.readdirSync(dir).filter(name=>name.endsWith('.js')).sort();
const issues=[];

for(const name of files){
  const full=path.join(dir,name);
  const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
  lines.forEach((line,index)=>{
    if(line.includes('$$$'))issues.push({file:name,line:index+1,kind:'TRIPLE_DOLLAR',source:line.trim()});
    const singleSelectorForEach=/\$\([^)]*\)\.forEach\s*\(/;
    if(singleSelectorForEach.test(line)&&!line.includes('$$('))issues.push({file:name,line:index+1,kind:'QUERY_SELECTOR_FOREACH',source:line.trim()});
  });
}

if(issues.length){
  console.error('Analytics selector contract failed: querySelector ($) cannot be iterated. Use querySelectorAll ($$).');
  for(const issue of issues)console.error(`${issue.file}:${issue.line} [${issue.kind}] ${issue.source}`);
  process.exit(1);
}

console.log(`Analytics selector contract passed for ${files.length} files.`);
