import assert from 'node:assert/strict';
import {labelPdf} from '../../frontend/js/label-document.js';
import {thermalLabelRaster} from '../../frontend/js/thermal-label-raster.js';
const label={productNumber:'HS-005943',productName:'PACK GAUFRETTE CACAO BALCONI 5X 45G',barcode:'221HS-005943',markdownCode:'MD50',originalPrice:22.95,finalPrice:11.48};
for(const count of [1,50]){
 const pdf=labelPdf(label,count),text=Buffer.from(pdf).toString('latin1');
 assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,count);
 const boxes=[...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
 assert(boxes.every(box=>Math.abs(Number(box[1])*25.4/72-50)<0.001&&Math.abs(Number(box[2])*25.4/72-30)<0.001),'each page must be exactly 50 by 30 mm');
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(start,start+4),'xref');
 const entries=text.slice(start).split('\n').slice(3,3+count+4);
 entries.forEach((entry,index)=>assert.equal(text.slice(Number(entry.slice(0,10)),Number(entry.slice(0,10))+String(index+1).length+6),(index+1)+' 0 obj'));
 const imageStart=text.indexOf('stream\n')+7;
 assert.deepEqual(pdf.subarray(imageStart,imageStart+48*240),thermalLabelRaster({product_name:label.productName,barcode_content:label.barcode,original_price:label.originalPrice,final_price:label.finalPrice},50).subarray(8),'PDF must preserve the approved raster and barcode without resampling');
 assert(!text.includes('/Font'),'the document must not append text headers, dates or page URLs');
}
assert.throws(()=>labelPdf(label,0));assert.throws(()=>labelPdf(label,51));
console.log('PASS 50x30 PDF geometry, quantity, cross references and unchanged barcode raster');
