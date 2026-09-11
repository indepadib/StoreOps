const clean=v=>String(v??'').trim();
function getPath(obj,path){return clean(path).split('.').filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj)}
function quote(v,delimiter){const s=String(v??'');return /["\r\n]/.test(s)||s.includes(delimiter)?`"${s.replaceAll('"','""')}"`:s}
function formatValue(value,column){
 if(value===null||value===undefined)return column.defaultValue??'';
 const type=clean(column.type||'string').toLowerCase();
 if(type==='number'){const n=Number(value);if(!Number.isFinite(n))return '';const decimals=Number.isInteger(Number(column.decimals))?Number(column.decimals):null;return decimals===null?String(n):n.toFixed(decimals)}
 if(type==='date'){const s=String(value);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):s}
 if(type==='datetime'){const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toISOString()}
 if(type==='boolean')return value===true||value===1||value==='1'?(column.trueValue??'1'):(column.falseValue??'0');
 return String(value)
}

export function validateExportTemplate(input={}){
 const code=clean(input.code);if(!code)throw Object.assign(new Error('Code template export obligatoire.'),{status:400});
 const delimiter=input.delimiter===undefined?';':String(input.delimiter);if(!delimiter.length)throw Object.assign(new Error('Délimiteur export obligatoire.'),{status:400});
 const columns=(Array.isArray(input.columns)?input.columns:[]).map((c,i)=>({name:clean(c.name),source:clean(c.source),required:!!c.required,type:clean(c.type||'string'),decimals:c.decimals,defaultValue:c.defaultValue,trueValue:c.trueValue,falseValue:c.falseValue,order:Number.isFinite(Number(c.order))?Number(c.order):i+1})).sort((a,b)=>a.order-b.order);
 if(!columns.length||columns.some(c=>!c.name||!c.source))throw Object.assign(new Error('Chaque colonne export doit avoir name et source.'),{status:400});
 return{code,name:clean(input.name)||code,target:clean(input.target)||'GENERIC',version:clean(input.version)||'1',delimiter,extension:clean(input.extension)||'csv',encoding:clean(input.encoding)||'utf-8',includeHeader:input.includeHeader!==false,fileNamePattern:clean(input.fileNamePattern)||'{code}_{storeId}_{businessDate}.{extension}',columns};
}

function fileName(template,context={}){return template.fileNamePattern.replaceAll('{code}',template.code).replaceAll('{storeId}',clean(context.storeId)||'store').replaceAll('{businessDate}',clean(context.businessDate)||new Date().toISOString().slice(0,10)).replaceAll('{extension}',template.extension)}

export function compileExport(templateInput,rows=[],context={}){
 const template=validateExportTemplate(templateInput),errors=[],lines=[];
 if(template.includeHeader)lines.push(template.columns.map(c=>quote(c.name,template.delimiter)).join(template.delimiter));
 for(const [index,row] of (Array.isArray(rows)?rows:[]).entries()){
  const values=template.columns.map(c=>{const raw=getPath(row,c.source);if(c.required&&(raw===null||raw===undefined||raw===''))errors.push({row:index+1,column:c.name,source:c.source,code:'REQUIRED_VALUE_MISSING'});return quote(formatValue(raw,c),template.delimiter)});
  lines.push(values.join(template.delimiter));
 }
 return{ready:errors.length===0,template:{code:template.code,version:template.version,target:template.target},fileName:fileName(template,context),mimeType:'text/csv; charset=utf-8',encoding:template.encoding,rowCount:Array.isArray(rows)?rows.length:0,errors,content:errors.length?'':lines.join('\r\n')+'\r\n'};
}

export function assertExportReady(result){if(!result?.ready){const e=new Error('Le fichier ne peut pas être généré : données obligatoires manquantes.');e.status=409;e.code='EXPORT_NOT_READY';e.details=result?.errors||[];throw e}return result}
