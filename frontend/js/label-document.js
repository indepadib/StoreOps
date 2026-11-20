import {thermalLabelRaster} from './thermal-label-raster.js';

// The PDF page is the label itself. Browser print headers never enter this file.
export function labelPdf(label,quantity){
 if(!Number.isInteger(quantity)||quantity<1||quantity>50)throw new Error('Quantité de 1 à 50 étiquettes requise.');
 const percent=label.markdownCode==='MD50'?50:label.markdownCode==='MD20'?20:null;
 if(percent===null||![label.originalPrice,label.finalPrice].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0))throw new Error('Prix ou remise invalide.');
 const image=thermalLabelRaster({product_name:label.productName,barcode_content:label.barcode,original_price:label.originalPrice,final_price:label.finalPrice},percent).subarray(8);
 const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const append=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
 const object=(id,value)=>{offsets[id]=length;append(id+' 0 obj\n'+value+'\nendobj\n');};
 append('%PDF-1.4\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,`<< /Type /Pages /Count ${quantity} /Kids [${Array.from({length:quantity},(_,index)=>(index+5)+' 0 R').join(' ')}] >>`);
 offsets[3]=length;
 append(`3 0 obj\n<< /Type /XObject /Subtype /Image /Width 384 /Height 240 /ColorSpace /DeviceGray /BitsPerComponent 1 /Decode [1 0] /Interpolate false /Length ${image.length} >>\nstream\n`);
 append(image);append('\nendstream\nendobj\n');
 const content='q\n136.06299 0 0 85.03937 2.83465 0 cm\n/Label Do\nQ\n';
 object(4,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
 for(let index=0;index<quantity;index++)object(index+5,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 141.73228 85.03937] /Resources << /XObject << /Label 3 0 R >> >> /Contents 4 0 R >>');
 const xref=length,count=quantity+5;
 append(`xref\n0 ${count}\n0000000000 65535 f \n`);
 for(let index=1;index<count;index++)append(String(offsets[index]).padStart(10,'0')+' 00000 n \n');
 append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 const result=new Uint8Array(length);let offset=0;
 for(const part of parts){result.set(part,offset);offset+=part.length;}
 return result;
}

export function documentPrintControls(container,label,quantity,onNext){
 const file=new File([labelPdf(label,quantity)],`etiquettes-${label.productNumber}-50x30.pdf`,{type:'application/pdf'});
 const status=document.createElement('p');status.setAttribute('role','status');
 status.textContent=`${quantity} page(s) de 50 × 30 mm. Dans Rongta, utiliser la taille réelle / 100 % et le format 50 × 30 mm.`;
 const share=document.createElement('button');share.type='button';share.className='btn brand';share.textContent='Partager vers Rongta';
 share.hidden=!(navigator.canShare?.({files:[file]}));
 share.onclick=async()=>{
  share.disabled=true;
  try{await navigator.share({files:[file]});status.textContent='Fichier partagé. Vérifier la sortie dans Rongta.';}
  catch(error){status.textContent=error.name==='AbortError'?'Partage annulé. Le fichier reste disponible.':'Partage indisponible. Télécharger le PDF puis l’ouvrir dans Rongta.';}
  finally{share.disabled=false;}
 };
 const download=document.createElement('button');download.type='button';download.className='btn soft';download.textContent='Télécharger le PDF 50 × 30';
 download.onclick=()=>{const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
 const next=document.createElement('button');next.type='button';next.className='btn soft';next.textContent='Article suivant';next.onclick=onNext;
 container.replaceChildren(status,share,download,next);
}
