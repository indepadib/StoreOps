import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createXlsxBlob } from '../../frontend/analytics/xlsx-workbook.js';

// Round-trip every ZIP local file, CRC and OOXML part without relying on Excel
// being installed on the CI runner.
const data=Buffer.from(await (await createXlsxBlob([
 {name:'01 Synthèse',headers:['CA TTC','Magasin','Évolution %'],keys:['ca_n','store_name','ca_evolution_pct'],rows:[[12345.67,'Franprix & Trèfle',2.15],[0,"=DON'T EXECUTE",null]]},
 {name:'02 Magasins',headers:['Code','CA'],keys:['store_code','ca_n'],rows:[['FRP0001',100],['FRP0002',200]]}
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
assert.match(files.get('xl/workbook.xml'),/01 Synthèse/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/12345\.67/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/Franprix &amp; Trèfle/);
assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml'),/<f>/,'untrusted values must never become Excel formulas');
assert.match(files.get('xl/worksheets/sheet1.xml'),/autoFilter/);
assert.match(files.get('xl/worksheets/sheet1.xml'),/frozen/);
console.log('StoreOps Analytics native XLSX/ZIP/XML format contract passed');
