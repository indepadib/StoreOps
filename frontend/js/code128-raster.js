// CODE128 symbol widths, ISO/IEC 15417; sequence matches ReportLab Code128.
const patterns=["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
export function code128Symbols(text){
 if(!/^[\x20-\x7e]{1,12}$/.test(text))throw new Error('Code-barres incompatible avec la largeur 384 points.');
 const data=[...text].map(c=>c.charCodeAt(0)-32);
 return [104,...data,(104+data.reduce((sum,n,i)=>sum+n*(i+1),0))%103,106];
}
export function barcodeRaster(text,height=64){
 const widths=code128Symbols(text).flatMap(n=>[...patterns[n]].map(Number));
 const width=widths.reduce((a,b)=>a+b,0)*2,start=Math.floor((384-width)/2);
 if(start<20)throw new Error('Code-barres trop large pour ses marges de lecture.');
 const row=new Uint8Array(48);let x=start,bar=true;
 for(const w of widths){for(let i=0;i<w*2;i++,x++)if(bar)row[x>>3]|=128>>(x%8);bar=!bar}
 const out=new Uint8Array(8+48*height);out.set([29,118,48,0,48,0,height&255,height>>8]);
 for(let y=0;y<height;y++)out.set(row,8+y*48);
 return out;
}
export function barcodeSvg(text){
 const row=barcodeRaster(text).slice(8,56);let path='';
 for(let x=0;x<384;x++)if(row[x>>3]&(128>>(x%8)))path+=`M${x} 0h1v64h-1z`;
 return `<svg viewBox="0 0 384 64" role="img" aria-label="Code-barres CODE128" style="display:block;width:100%;height:64px;background:white;shape-rendering:crispEdges"><path d="${path}" fill="black"/></svg>`;
}
const glyphs={
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
 '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
 '4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
 '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],
 '8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
 '.':['000','000','000','000','010'],' ':['000','000','000','000','000'],
 'D':['110','101','101','101','110'],'H':['101','101','111','101','101']
};
export function crossedPriceRaster(price){
 const text=Number(price).toFixed(2)+' DH',scale=4,height=24,start=Math.floor((384-text.length*16)/2);
 const out=new Uint8Array(8+48*height);out.set([29,118,48,0,48,0,height,0]);
 function dot(x,y){if(x>=0&&x<384)out[8+y*48+(x>>3)]|=128>>(x%8)}
 [...text].forEach((c,i)=>(glyphs[c]||glyphs[' ']).forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)dot(start+i*16+x*scale+dx,y*scale+dy)})));
 for(let x=Math.max(0,start-4);x<Math.min(384,start+text.length*16);x++){dot(x,9);dot(x,10)}
 return out;
}
