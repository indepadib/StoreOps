// UB codes are text: leading zeroes are significant.
export function retailCategoryCode(value){
 if(typeof value==='number')return null; // 18 digits exceed JavaScript's exact integer range.
 const text=String(value??'').trim();
 const match=text.match(/^(\d{18}|\d{15}|\d{12}|\d{9}|\d{6}|\d{3})(?=$|\s|[-–—:])/);
 return match?.[1]||null;
}
export function categoryLabel(value,code){
 const text=String(value??'').trim();
 return text===code?'':text.startsWith(code)?text.slice(code.length).replace(/^[\s\-–—:]+/,''):text;
}
