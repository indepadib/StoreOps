import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createXlsxBlob } from '../../frontend/analytics/xlsx-workbook.js';

// Round-trip every ZIP local file, CRC and OOXML part without relying on Excel
// being installed on the CI runner.
const data=Buffer.from(await (await createXlsxBlob([
 {name:'01 Synthèse',headers:['CA TTC','Magasin','Évolution %'],keys:['ca_n','store_name','ca_evolution_pct'],rows:[[12345.67,'Franprix & Trèfle',2.15],[0,"=DON'T EXECUTE",null]]},
 {name:'02 Magasins',headers:['Code','CA'],keys:['store_code','ca_n'],rows:[['FRP0001',100],['FRP0002',200]]},
 {name:'03 Ratios',headers:['Poids CA période %','Évolution CA %','Écart poids CA pts','Classement','Poids comparaison %'],
  keys:['ca_weight_pct','ca_evolution_pct','ca_weight_delta_points','rank_delta','ca_weight_n1_pct'],
  rows:[[3.35,-15.89,-0.09,2,3.44],[2.07,20.23,0.08,-3,1.99]]}
])).arrayBuffer());
assert.equal(data.readUInt32LE(0),0x04034b50,'ZIP must begin with a local-file signature');
const files=new Map();let pos=0;
while(pos+30<data.length&&data.readUInt32LE(pos)===0x04034b50){
 const flags=data.readUInt16LE(pos+6),method=data.readUInt16LE(pos+8),expectedCrc=data.readUInt32LE(pos+14);
 const compressedSize=data.readUInt32LE(pos+18),size=data.readUInt32LE(pos+22),nameLen=data.readUInt16LE(pos+26),extraLen=data.readUInt16LE(pos+28);
 assert.equal(flags&0x0008,0,'streamed ZIP descriptors are not expected');
 const name=data.subarray(pos+30,pos+30+nameLen).toString('utf8'),start=pos+30+nameLen+extraLen;
 const compressed=data.subarray(start,start+compressedSize),raw=method===8?inflateRawSync(compressed):compressed;
 assert.equal(raw.length,size,'length must match uncompressed size');
 assert([0,8].includes(method),'ZIP entry must be stored or DEFLATE');
 let crc=0xFFFFFFFF;
 for(const b of raw){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?((crc>>>1)^0xEDB88320):(crc>>>1)}
 assert.equal((crc^0xFFFFFFFF)>>>0,expectedCrc,'CRC must match');
 files.set(name,raw.toString('utf8'));
 pos=start+compressedSize;
}
assert(files.has('[Content_Types].xml'));
assert(files.has('xl/workbook.xml'));
assert(files.has('xl/worksheets/sheet1.xml'));
assert(files.has('xl/worksheets/sheet2.xml'));
assert(files.has('xl/worksheets/sheet3.xml'));
const percentageSheet=files.get('xl/worksheets/sheet3.xml');
const styles=files.get('xl/styles.xml');
// APIs provide already human-readable 3.35% and -15.89%. Store as 0.0335
// and -0.1589 so Excel, Numbers and mobile viewers all display correctly.
assert.match(percentageSheet,/<c r="A2" s="4"><v>0\.0335<\/v><\/c>/,'3.35 must render as 3.35%, not 335%');
assert.match(percentageSheet,/<c r="B2" s="4"><v>-0\.1589<\/v><\/c>/,'-15.89 must render as -15.89%, not -1589%');
assert.match(percentageSheet,/<c r="C2" s="5"><v>-0\.09<\/v><\/c>/,'percentage-point deltas must NOT be multiplied by 100');
assert.match(percentageSheet,/<c r="D2" s="2"><v>2<\/v><\/c>/,'ranking differences must not become percentages or DH');
assert.match(percentageSheet,/<c r="E2" s="4"><v>0\.0344<\/v><\/c>/,'comparison weight must use same normalization');
assert.match(styles,/formatCode="0\.00%"/,'percentage must use standard portable XLSX percent format');
assert.match(styles,/numFmtId="166" formatCode="0\.00 &quot;pts&quot;"/,'delta points must use explicit point unit');
assert.match(files.get('xl/workbook.xml'),/01 Synthèse/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/12345\.67/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/Franprix &amp; Trèfle/);
assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml'),/<f>/,'untrusted values must never become Excel formulas');
assert.match(files.get('xl/worksheets/sheet1.xml'),/autoFilter/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/frozen/);
console.log('StoreOps Analytics native XLSX/ZIP/XML format contract passed');
