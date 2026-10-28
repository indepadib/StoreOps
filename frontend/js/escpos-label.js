import {barcodeRaster,crossedPriceRaster} from './code128-raster.js';
// Byte commands: Epson ESC/POS GS k, CODE128 function B (m=73).
// ASCII transliteration avoids dependence on the printer's legacy code page.
const ascii=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ');
const header=[27,64,27,77,0,27,51,24,29,76,0,0,29,87,128,1]; // 384 dots at 203 dpi
function bytes(text){return [...text].map(c=>c.charCodeAt(0))}
export function escposTestBytes(){
 return Uint8Array.from([...header,...bytes('STOREOPS - TEST ESC/POS\n203 DPI - BLUETOOTH RAWBT\nTEST SANS VALEUR COMMERCIALE\nVerifier texte et avance papier\n\n\n')]);
}
export function escposLabelBytes(item){
 const code=String(item.barcode_content??'');
 if(!/^[\x20-\x7e]{1,12}$/.test(code))throw new Error('Code-barres incompatible avec la largeur ESC/POS 384 points.');
 const percent=item.label_kind==='MD50'?50:item.label_kind==='MD20'?20:null;
 if(percent===null)throw new Error('Niveau de demarque inconnu.');
 const name=ascii(item.product_name).slice(0,64),nameLines=name.match(/.{1,32}/g)||[''];
 const large=[29,33,34],nameSize=[29,33,16],priceSize=[29,33,17],normal=[29,33,0],center=[27,97,1];
 const out=[...header,...center,...large,...bytes('-'+percent+'%\n'),...nameSize,...bytes(nameLines.join('\n')+'\n'),...normal,...crossedPriceRaster(item.original_price),10,...priceSize,...bytes(Number(item.final_price).toFixed(2)+' DH\n'),...normal,...barcodeRaster(code),...bytes(code+'\n\n')];
 return Uint8Array.from(out);
}
