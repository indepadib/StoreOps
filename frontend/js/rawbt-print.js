// RawBT byte transport: https://github.com/402d/RawBt-and-ESCPOS-coffee
export function rawbtLink(payload){
 const bytes=new TextEncoder().encode(payload);
 if(bytes.length>180000)throw new Error('Lot trop volumineux pour RawBT. Imprime une sélection plus petite.');
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return 'rawbt:base64,'+btoa(binary);
}
export function isAndroid(){return /Android/i.test(navigator.userAgent)}
