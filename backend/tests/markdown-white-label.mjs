import assert from 'node:assert/strict';
import {markdownLabelZpl} from '../services/markdown-label.mjs';
const record={product_name:'Produit au nom très long qui doit rester dans le papier',expiry_date:'2026-10-25'};
const printer={media_width_mm:50,media_height_mm:25,dpi:203};
for(const [discount,code,price] of [[20,'250HS-002345',8],[50,'221HS-002345',5]]){
 const zpl=markdownLabelZpl({discount_percent:discount,barcode_content:code,original_price:10,final_price:price},record,{symbology:'CODE128'},printer);
 assert.ok(zpl.includes('^PW400\n^LL200'));
 assert.ok(zpl.includes(`^FD-${discount}%^FS`));
 assert.ok(zpl.includes(`^FD${price.toFixed(2)} DH^FS`));
 assert.ok(zpl.includes('^FDAvant 10.00 DH^FS'));
 assert.ok(zpl.includes(`^FD>:${code}^FS`));
 assert.doesNotMatch(zpl,/ROULEAU|JAUNE|ROUGE/);
 const match=zpl.match(/\^FO(\d+),118\^BY(\d+),2,48\^BC/);
 assert.ok(match,'barcode uses compact label coordinates');
 const x=Number(match[1]),module=Number(match[2]),symbol=((code.length+2)*11+13)*module;
 assert.ok(x>=10*module&&400-x-symbol>=10*module,'both CODE128 quiet zones fit');
 assert.ok(174+16<=200,'human-readable code fits vertically');
}
const op={discount_percent:20,barcode_content:'250HS-002345',original_price:10,final_price:8};
assert.throws(()=>markdownLabelZpl({...op,barcode_content:'250HS-002345678901234'},record,{symbology:'CODE128'},printer),e=>e.code==='LABEL_BARCODE_TOO_WIDE');
assert.throws(()=>markdownLabelZpl(op,record,{symbology:'CODE128'},{...printer,media_width_mm:25}),e=>e.code==='LABEL_MEDIA_TOO_SMALL');
assert.throws(()=>markdownLabelZpl({...op,barcode_content:'250HS^XZ'},record,{symbology:'CODE128'},printer),e=>e.code==='LABEL_BARCODE_UNSUPPORTED');
assert.throws(()=>markdownLabelZpl({...op,final_price:null},record,{symbology:'CODE128'},printer),e=>e.code==='LABEL_PRICE_REQUIRED');
console.log('White 50 x 25 mm label geometry and barcode guardrails: OK');
