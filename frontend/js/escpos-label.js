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
 const barcode='{B'+code.replace(/\{/g,'{{');
 const percent=item.label_kind==='MD50'?50:item.label_kind==='MD20'?20:null;
 if(percent===null)throw new Error('Niveau de demarque inconnu.');
 const name=ascii(item.product_name).slice(0,32);
 const text=`-${percent}%\n${name}\nAncien ${Number(item.original_price).toFixed(2)} DH\nNouveau ${Number(item.final_price).toFixed(2)} DH\n`;
 return Uint8Array.from([...header,...bytes(text),29,72,2,29,104,56,29,119,2,29,107,73,barcode.length,...bytes(barcode),10,10,10]);
}
