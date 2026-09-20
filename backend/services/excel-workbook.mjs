const xml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const cleanSheet=v=>String(v||'Feuille').replace(/[\\\/\?\*\[\]:]/g,' ').trim().slice(0,31)||'Feuille';

function cell(value,type='String',style='Body'){
 if(value===null||value===undefined||value==='')return `<Cell ss:StyleID="${style}"><Data ss:Type="String"></Data></Cell>`;
 if(type==='Number'){
  const n=Number(value);if(Number.isFinite(n))return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${n}</Data></Cell>`;
 }
 return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xml(value)}</Data></Cell>`;
}
function row(values,style='Body'){
 return `<Row>${values.map(v=>Array.isArray(v)?cell(v[0],v[1]||'String',v[2]||style):cell(v,'String',style)).join('')}</Row>`;
}
function worksheet(name,headers,rows,widths=[]){
 const cols=headers.map((_,i)=>`<Column ss:AutoFitWidth="0" ss:Width="${Number(widths[i]||110)}"/>`).join('');
 const header=row(headers.map(x=>[x,'String','Header']));
 const body=rows.map(r=>row(r)).join('');
 return `<Worksheet ss:Name="${xml(cleanSheet(name))}"><Table>${cols}${header}${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}
export function excelWorkbook({sheets=[]}={}){
 const content=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles>
 <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Borders/><Font ss:FontName="Arial" x:Family="Swiss" ss:Size="10"/><Interior/><NumberFormat/><Protection/></Style>
 <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#EDE7EA" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
 <Style ss:ID="Body"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
</Styles>
${sheets.map(s=>worksheet(s.name,s.headers,s.rows,s.widths)).join('')}
</Workbook>`;
 return{content,mimeType:'application/vnd.ms-excel;charset=utf-8',encoding:'utf-8',extension:'xls'}
}
