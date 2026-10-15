import fs from 'node:fs';
import path from 'node:path';

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
