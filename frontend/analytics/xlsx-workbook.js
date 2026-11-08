// Minimal, dependency-free XLSX (OOXML + ZIP) writer for StoreOps Analytics.
// Never place user-provided strings in formulas. All text is inline strings.
const utf8=new TextEncoder();
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const colName=index=>{let n=index+1,s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
const uint16=(out,n)=>{out.push(n&255,(n>>>8)&255)};
const uint32=(out,n)=>{out.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)};
const table=(()=>{const a=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);a[i]=c>>>0}return a})();
const crc32=bytes=>{let c=0xFFFFFFFF;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
async function compressed(bytes){
 if(typeof CompressionStream!=='function')return{method:0,data:bytes};
 try{
  const zlib=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  if(zlib.length<7)return{method:0,data:bytes};
  return{method:8,data:zlib.slice(2,-4)}; // ZIP requires raw DEFLATE, not the zlib wrapper.
 }catch{return{method:0,data:bytes}}
}
async function zip(files){
 const parts=[],central=[];let offset=0;
 for(const [filename,body] of files){
  const name=utf8.encode(filename),plain=utf8.encode(body),{method,data}=await compressed(plain),crc=crc32(plain);
  if(plain.length>0xFFFFFFFF||data.length>0xFFFFFFFF)throw Error('Classeur Excel trop volumineux.');
  const local=[];uint32(local,0x04034b50);uint16(local,20);uint16(local,0x0800);uint16(local,method);uint16(local,0);uint16(local,0);
  uint32(local,crc);uint32(local,data.length);uint32(local,plain.length);uint16(local,name.length);uint16(local,0);
  const head=new Uint8Array(local);
  parts.push(head,name,data);
  const cd=[];uint32(cd,0x02014b50);uint16(cd,20);uint16(cd,20);uint16(cd,0x0800);uint16(cd,method);uint16(cd,0);uint16(cd,0);
  uint32(cd,crc);uint32(cd,data.length);uint32(cd,plain.length);uint16(cd,name.length);uint16(cd,0);uint16(cd,0);
  uint16(cd,0);uint16(cd,0);uint32(cd,0);uint32(cd,offset);
  central.push(new Uint8Array(cd),name);
  offset+=head.length+name.length+data.length
 }
 const start=offset;
 for(const x of central){parts.push(x);offset+=x.length}
 const end=[];uint32(end,0x06054b50);uint16(end,0);uint16(end,0);uint16(end,files.length);uint16(end,files.length);
 uint32(end,offset-start);uint32(end,start);uint16(end,0);parts.push(new Uint8Array(end));
 return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
// StoreOps returns percentages already expressed on a 0..100 scale
// (3.35 means 3.35%). Excel/Numbers expects 0..1 for a true '%' format.
// Keep percentage-point deltas numeric (0.09 means 0.09 point).
const numericStyle=(key,label='')=>{
 const k=String(key||'').toLowerCase(),s=(k+' '+label).toLowerCase();
 if(/_delta_points$|_points$|écart poids ca pts|écart présence panier pts|écart en points/.test(s))return 5;
 if(/_pct\b|pct_|_percentage\b|\b%\b|%|pourcent|taux|poids ca|pénétration|évolution/.test(s))return 4;
 if(/ca_|sales|price|prix|basket|panier|discount|remise|marge|cost|coût|amount|valeur|effect|effet/.test(s)&&!/^rank_/.test(k))return 3;
 return 2
};
function worksheet(sheet){
 const headers=sheet.headers||[],rows=sheet.rows||[],keys=sheet.keys||headers;
 if(headers.length>16384||rows.length>=1048576)throw Error('La limite Excel est dépassée.');
 const lastColumn=colName(Math.max(0,headers.length-1)),endRow=rows.length+1;
 const cell=(value,ref,key,label,header=false)=>{
  if(value===null||value===undefined||value==='')return '';
  if(!header&&typeof value==='number'&&Number.isFinite(value)){
   const style=numericStyle(key,label);
   // Normalize only for real percentages. Never scale percentage-point changes.
   const stored=style===4?value/100:value;
   return '<c r="'+ref+'" s="'+style+'"><v>'+stored+'</v></c>'
  }
  return '<c r="'+ref+'" s="'+(header?1:0)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>'
 };
 const lines=['<row r="1" ht="34" customHeight="1">'+headers.map((h,j)=>cell(h,colName(j)+'1',keys[j],h,true)).join('')+'</row>'];
 for(let i=0;i<rows.length;i++){
  const values=rows[i]||[];let line='<row r="'+(i+2)+'">';
  for(let j=0;j<headers.length;j++)line+=cell(values[j],colName(j)+(i+2),keys[j]||'',headers[j]);
  lines.push(line+'</row>')
 }
 const cols=headers.map((h,j)=>'<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+Math.min(42,Math.max(13,(sheet.widths?.[j]||String(h).length+3)))+'" customWidth="1"/>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
 +'<dimension ref="A1:'+lastColumn+endRow+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
 +'<sheetFormatPr defaultRowHeight="17"/><cols>'+cols+'</cols><sheetData>'+lines.join('')+'</sheetData>'
 +(headers.length?'<autoFilter ref="A1:'+lastColumn+endRow+'"/>':'')+'</worksheet>'
}
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
 +'<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;DH&quot;"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="0.00 &quot;pts&quot;"/></numFmts>'
 +'<fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'
 +'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17202E"/><bgColor indexed="64"/></patternFill></fill></fills>'
 +'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
 +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
 +'<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
 +'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>'
 +'<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
 +'<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
 +'<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' 
 +'<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
export async function createXlsxBlob(sheets){
 if(!Array.isArray(sheets)||!sheets.length)throw Error('Aucune feuille à exporter.');
 const used=new Set();
 const valid=sheets.map((s,i)=>{
  let name=String(s.name||'Feuille '+(i+1)).replace(/[\\\/?*\[\]:]/g,' ').slice(0,31)||'Feuille';
  const base=name;let idx=1;while(used.has(name.toLowerCase()))name=base.slice(0,27)+' '+(++idx);
  used.add(name.toLowerCase());return{...s,name}
 });
 const types=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
  ...valid.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'),
  '</Types>'].join('');
 const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
  +'<bookViews><workbookView/></bookViews><sheets>'+valid.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
 const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  +valid.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')
  +'<Relationship Id="rId'+(valid.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const files=[['[Content_Types].xml',types],['_rels/.rels',rootRels],['xl/workbook.xml',book],['xl/_rels/workbook.xml.rels',rels],['xl/styles.xml',styles],...valid.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(s)])];
 return zip(files)
}
