// Dedicated durable archive. No cache TTL; replace a complete partition atomically.
// Backend-only: contains customer account references, no contact fields.
import {isPreparedRfmRange} from './one-crm-rfm-population.mjs';
export function createCrmArchive(sql){
 let init;
 const ready=()=>init||(init=sql`CREATE TABLE IF NOT EXISTS crm_purchase_day_archive (company TEXT NOT NULL, store_id TEXT NOT NULL, business_day DATE NOT NULL, evidence JSONB NOT NULL, purchase_lines JSONB, captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(company,store_id,business_day))`.catch(e=>{init=null;throw e}));
 async function put(company,r){
  if(typeof company!=='string'||!company||!isPreparedRfmRange(r,r.storeId,r.startDate,r.endDate)||r.startDate!==r.endDate)throw Error('Invalid archive partition');
  const {purchaseLines,...evidence}=r;const detailed=Array.isArray(purchaseLines);
  if(detailed){const byAccount=new Map();for(const x of purchaseLines){if(typeof x.account!=='string'||!/^CLT/i.test(x.account)||!Number.isSafeInteger(x.positiveTtcMinor)||x.positiveTtcMinor<=0||!x.terminal||!x.transaction||!x.product)throw Error('Invalid archive line');const a=byAccount.get(x.account)||{minor:0,tickets:new Set()};a.minor+=x.positiveTtcMinor;a.tickets.add(JSON.stringify([x.terminal,x.transaction]));byAccount.set(x.account,a)}if(byAccount.size!==evidence.customers.length||evidence.customers.some(x=>{const a=byAccount.get(x.customerAccount);return !a||a.minor!==Math.round(x.sales*100)||a.tickets.size!==x.tickets}))throw Error('Archive reconciliation failed')}
  await ready();await sql`INSERT INTO crm_purchase_day_archive(company,store_id,business_day,evidence,purchase_lines) VALUES(${company},${r.storeId},${r.startDate}::date,${JSON.stringify(evidence)}::jsonb,${detailed?JSON.stringify(purchaseLines):null}::jsonb) ON CONFLICT(company,store_id,business_day) DO UPDATE SET evidence=EXCLUDED.evidence,purchase_lines=EXCLUDED.purchase_lines,captured_at=NOW() WHERE EXCLUDED.purchase_lines IS NOT NULL OR crm_purchase_day_archive.purchase_lines IS NULL`;
 }
 async function read(company,storeIds,start,end){await ready();return sql`SELECT store_id,business_day::text AS day,evidence,purchase_lines IS NOT NULL AS detailed,captured_at::text AS captured_at FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(storeIds)}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date`}
 async function readCustomerLines(company,storeIds,start,end,accountRef){await ready();return sql`SELECT store_id,business_day::text AS day,captured_at::text AS captured_at,COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(purchase_lines) AS line(v) WHERE v->>'account'=${accountRef}),'[]'::jsonb) AS lines FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(storeIds)}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date AND purchase_lines IS NOT NULL ORDER BY business_day DESC,store_id`}
 return {put,read,readCustomerLines};
}
