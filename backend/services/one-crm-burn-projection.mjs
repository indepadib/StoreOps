// Use the shared Analytics sign convention; do not turn mixed signs into a positive spend.
export function projectCustomerBurnDay({tickets,rows,fields,company,companyField,storeValue,date,isWallet,profile,derive}){
 const key=(terminal,transaction)=>JSON.stringify([String(terminal??'').trim(),String(transaction??'').trim()]);
 const byTicket=new Map(),accounts=new Map();
 for(const t of tickets){if(typeof t.account!=='string'||!/^CLT/i.test(t.account)||!t.terminal||!t.transaction||byTicket.has(key(t.terminal,t.transaction)))throw Error('Invalid purchase ticket');byTicket.set(key(t.terminal,t.transaction),{account:t.account,paid:false,rows:[]})}
 for(const row of rows){const val=v=>String(v??'').trim();if(val(row[companyField])!==company||val(row[fields.store])!==storeValue||val(row[fields.date]).slice(0,10)!==date||val(row[fields.currency]).toUpperCase()!=='MAD'||!val(row[fields.terminal])||!val(row[fields.transaction])||!val(row[fields.tender])||row[fields.amount]==null||val(row[fields.amount])===''||!Number.isFinite(Number(row[fields.amount])))throw Error('Invalid payment partition');
 const t=byTicket.get(key(row[fields.terminal],row[fields.transaction]));if(!t)continue;t.paid=true;if(isWallet(row[fields.tender]))t.rows.push(row)}
 if([...byTicket.values()].some(t=>!t.paid))throw Error('Missing payment evidence');
 for(const t of byTicket.values()){const a=accounts.get(t.account)||[];a.push(...t.rows);accounts.set(t.account,a)}
 const result=[...accounts].map(([accountRef,rows])=>{const p=profile(rows,fields.amount),b=derive(p);return {accountRef,positive:p.positive,negative:p.negative,netMinor:Math.round(p.netAmount*100),burn:b.amount}});
 return result;
}
