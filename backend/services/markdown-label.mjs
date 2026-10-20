// White thermal labels. Coordinates below are based on a 50 x 25 mm, 203 dpi label.
const safeText=value=>String(value??'').replace(/[\^~]/g,' ').replace(/[^\x20-\x7EÀ-ÿ]/g,' ');
export function markdownLabelZpl(op,record,profile,printer){
 if(profile.symbology!=='CODE128')throw Object.assign(new Error('Symbologie POS non compatible avec le générateur ZPL.'),{status:409,code:'PRINT_SYMBOLOGY_UNSUPPORTED'});
 const dpi=Number(printer.dpi||203),width=Math.round(Number(printer.media_width_mm||50)/25.4*dpi),height=Math.round(Number(printer.media_height_mm||25)/25.4*dpi);
 const scale=dpi/203,d=n=>Math.round(n*scale);
 if(width<d(399)||height<d(200))throw Object.assign(new Error('Étiquette trop petite : format minimum 50 × 25 mm requis.'),{status:409,code:'LABEL_MEDIA_TOO_SMALL'});
 const code=String(op.barcode_content||'');
 // Explicit Code B keeps the symbol width predictable; 10-module quiet zones on each side.
 if(!/^[A-Za-z0-9-]+$/.test(code))throw Object.assign(new Error('Code article incompatible avec le code-barres étiquette.'),{status:409,code:'LABEL_BARCODE_UNSUPPORTED'});
 const module=d(2),symbolWidth=((code.length+2)*11+13)*module,quiet=10*module;
 if(symbolWidth+quiet*2>width)throw Object.assign(new Error('Code-barres trop long pour cette largeur d’étiquette. Aucun code ne sera tronqué.'),{status:409,code:'LABEL_BARCODE_TOO_WIDE'});
 const barcodeX=Math.floor((width-symbolWidth)/2),name=safeText(record.product_name).slice(0,30),expiry=safeText(record.expiry_date);
 const oldPrice=Number(op.original_price).toFixed(2),newPrice=Number(op.final_price).toFixed(2);
 if(!Number.isFinite(Number(op.original_price))||!Number.isFinite(Number(op.final_price))||op.original_price==null||op.final_price==null)throw Object.assign(new Error('Prix étiquette manquant.'),{status:409,code:'LABEL_PRICE_REQUIRED'});
 const priceFont=Math.min(d(40),Math.floor((width-d(145)-d(10))/(newPrice.length+3)));
 if(priceFont<d(20))throw Object.assign(new Error('Prix trop long pour cette étiquette.'),{status:409,code:'LABEL_PRICE_TOO_WIDE'});
 return ['^XA','^CI28','^PW'+width,'^LL'+height,'^LH0,0',
  `^FO${d(12)},${d(6)}^A0N,${d(20)},${d(12)}^FD${name}^FS`,
  `^FO${d(12)},${d(32)}^A0N,${d(36)},${d(25)}^FD-${Math.round(op.discount_percent)}%^FS`,
  `^FO${d(145)},${d(30)}^A0N,${priceFont},${priceFont}^FD${newPrice} DH^FS`,
  `^FO${d(12)},${d(76)}^A0N,${d(18)},${d(10)}^FDAvant ${oldPrice} DH^FS`,
  `^FO${d(12)},${d(96)}^A0N,${d(16)},${d(9)}^FDDLC ${expiry}^FS`,
  `^FO${barcodeX},${d(118)}^BY${module},2,${d(48)}^BCN,${d(48)},N,N,N^FD>:${code}^FS`,
  `^FO0,${d(174)}^A0N,${d(16)},${d(9)}^FB${width},1,0,C,0^FD${code}^FS`,'^XZ'].join('\n');
}
