import {zip} from './xlsx-workbook.js';

const p='http://schemas.openxmlformats.org/presentationml/2006/main';
const a='http://schemas.openxmlformats.org/drawingml/2006/main';
const r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xmlns=`xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${r}"`;
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const relations=(...links)=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links.map(([id,type,target])=>`<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const tree=shapes=>`<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree>`;
const colorMap='<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
const colorOverride='<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
const contentType=(path,type)=>`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.${type}+xml"/>`;
const emu=value=>Math.round(value*914400);
const shape=(id,{x,y,w,h,lines,fill})=>`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Bloc ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill?`<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`:'<a:noFill/>'}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${lines.map(([text,size,bold=false,color='203658'])=>`<a:p><a:r><a:rPr lang="fr-FR" sz="${size*100}" b="${Number(bold)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>${xml(text)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
function rankingTable(id,{x,y,w,h,rows}){
 const widths=[.44,.21,.16,.19],rowHeight=emu(h/rows.length);
 const cell=(value,head)=>`<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="${head?1300:1400}" b="${Number(head)}"><a:solidFill><a:srgbClr val="${head?'FFFFFF':'203658'}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>${xml(value)}</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="${head?'25446E':'FFFFFF'}"/></a:solidFill></a:tcPr></a:tc>`;
 return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Top 5 CA TTC"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${widths.map(width=>`<a:gridCol w="${emu(w*width)}"/>`).join('')}</a:tblGrid>${rows.map((row,index)=>`<a:tr h="${rowHeight}">${row.map(value=>cell(value,index===0)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}
const slide=blocks=>`<p:sld ${xmlns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="EDF3FC"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${tree(blocks.map((block,index)=>block.rows?rankingTable(index+2,block):shape(index+2,block)).join(''))}</p:cSld>${colorOverride}</p:sld>`;
const header=(title,subtitle)=>({x:0,y:0,w:13.333,h:1.16,fill:'152946',lines:[[title,28,true,'FFFFFF'],[subtitle,13,false,'E1EAFB']]});
const panel=(x,y,w,h,lines)=>({x,y,w,h,lines,fill:'FFFFFF'});
const line=(text)=>[text,15];

export function executivePresentationParts(model,{rankingLabel='Départements',ranking=[]}={}){
 const first=[header('Vue exécutive',model.period)];
 model.kpis.forEach(([label,value,note],index)=>first.push(panel(.3+index*3.19,1.36,3.03,1.23,[[label,14,true],[value,22,true],line(note)])));
 if(model.pace)first.push(panel(.3,2.80,6.2,2.10,[['Rythme quotidien',19,true],line(model.pace.caption),...model.pace.indicators.flatMap(metric=>[[metric.label+' · '+metric.value,15,true],[metric.detail,12]])]));
 const decision=model.reading?[
  [model.reading.headline+' · '+model.reading.change,18,true],line(model.reading.driver),
  line(`En hausse · ${model.reading.gain.count} magasin(s) · ${model.reading.gain.total}`),
  line(`En baisse · ${model.reading.loss.count} magasin(s) · ${model.reading.loss.total}`),
 ]:[[model.decision.title,18,true],line(model.decision.text),...(model.decision.lines||[]).map(line)];
 first.push(panel(6.72,2.80,6.27,2.10,decision));
 first.push(panel(.3,5.13,12.69,1.62,[['Qualité et couverture',17,true],line(model.quality)]));
 const second=[header('Produits et signaux métier',model.period)];
 second.push(panel(.3,1.36,6.2,5.63,[[`Top 5 CA TTC · ${rankingLabel}`,20,true],...(!ranking.length?[line('Classement indisponible pour ce périmètre.')]:[])]));
 if(ranking.length)second.push({x:.43,y:1.98,w:5.92,h:.72*(ranking.length+1),rows:[['Article ou niveau','CA TTC','Poids CA','Écart CA'],...ranking.map((row,index)=>[`${index+1}. ${row.label}`,row.sales,row.share,row.change])]});
 model.signals.forEach((card,index)=>{
  const h=5.63/Math.max(1,Math.ceil(model.signals.length/2));
  second.push(panel(6.72+index%2*3.18,1.36+Math.floor(index/2)*h,3.09,h-.09,[[card.title,15,true],...[...(card.note?[[card.note,11]]:[]),...card.rows.map(row=>[`${row.label} · ${row.value}`,12])]]));
 });
 const slides=[first,second];
 return editablePresentationParts(slides);
}

export function editablePresentationParts(slides){
 const types=`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contentType('ppt/presentation.xml','presentation.main')}${contentType('ppt/slideMasters/slideMaster1.xml','slideMaster')}${contentType('ppt/slideLayouts/slideLayout1.xml','slideLayout')}${slides.map((_,i)=>contentType(`ppt/slides/slide${i+1}.xml`,'slide')).join('')}</Types>`;
 return [
  ['[Content_Types].xml',types],['_rels/.rels',relations(['rId1','officeDocument','ppt/presentation.xml'])],
  ['ppt/presentation.xml',`<p:presentation ${xmlns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
  ['ppt/_rels/presentation.xml.rels',relations(['rId1','slideMaster','slideMasters/slideMaster1.xml'],...slides.map((_,i)=>[`rId${i+2}`,'slide',`slides/slide${i+1}.xml`]))],
  ['ppt/slideMasters/slideMaster1.xml',`<p:sldMaster ${xmlns}><p:cSld>${tree('')}</p:cSld>${colorMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`],
  ['ppt/slideMasters/_rels/slideMaster1.xml.rels',relations(['rId1','slideLayout','../slideLayouts/slideLayout1.xml'])],
  ['ppt/slideLayouts/slideLayout1.xml',`<p:sldLayout ${xmlns} type="blank"><p:cSld name="StoreOps">${tree('')}</p:cSld>${colorOverride}</p:sldLayout>`],
  ['ppt/slideLayouts/_rels/slideLayout1.xml.rels',relations(['rId1','slideMaster','../slideMasters/slideMaster1.xml'])],
  ...slides.flatMap((blocks,i)=>[[`ppt/slides/slide${i+1}.xml`,slide(blocks)],[`ppt/slides/_rels/slide${i+1}.xml.rels`,relations(['rId1','slideLayout','../slideLayouts/slideLayout1.xml'])]])
 ];
}

export function executivePresentation(model,options){
 return zip(executivePresentationParts(model,options),'application/vnd.openxmlformats-officedocument.presentationml.presentation');
}
