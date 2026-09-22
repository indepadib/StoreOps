const BASE=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';
async function call(method,path,user='u-tr',payload){const r=await fetch(BASE+path,{method,headers:{'content-type':'application/json','x-demo-user':user},body:payload===undefined?undefined:JSON.stringify(payload)});let data={};try{data=await r.json()}catch{}return{r,data}}
function ok(v,m){if(!v)throw new Error(m)}

let x=await call('GET','/api/stores/trefle/cash-opening','u-tr');
ok(x.r.status===200,'cash opening list failed');
const line=x.data.opening?.lines?.[0];
ok(line?.till_code,'cash opening till missing');
x=await call('POST',`/api/stores/trefle/cash-opening/tills/${encodeURIComponent(line.till_code)}/check`,'u-tr',{cashierName:'Test Stable',declaredFloat:Number(line.expected_float||0),posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});
ok([200,409].includes(x.r.status),'stable till route missing');
ok(x.data?.line?.till_code===line.till_code,'stable till route resolved wrong cash line');
console.log('V2.24.3 stable cash-opening API: OK');
