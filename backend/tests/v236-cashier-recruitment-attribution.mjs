import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v236-cashier-${process.pid}.db`;
const {attributeRecruitmentsToStaff,aggregateCashierRows}=await import('../services/dynamics-staff-performance.mjs');

const rows=[
 {StaffId:'S1',transactionId:'T1',custAccount:'C100',businessDate:'2026-09-01',time:'09:10',netAmountInclTax:-50,transactionStatus:''},
 {StaffId:'S2',transactionId:'T2',custAccount:'C100',businessDate:'2026-09-01',time:'11:20',netAmountInclTax:-20,transactionStatus:''},
 {StaffId:'S2',transactionId:'T3',custAccount:'C200',businessDate:'2026-09-02',time:'08:30',netAmountInclTax:-80,transactionStatus:''},
 {StaffId:'S2',transactionId:'T4',custAccount:'ANONYMOUS',businessDate:'2026-09-02',time:'09:00',netAmountInclTax:-30,transactionStatus:''}
];
const enrollments=[
 {customerAccount:'C100',enrollmentDate:'2026-09-01T08:55:00Z'},
 {customerAccount:'C200',enrollmentDate:'2026-09-02T08:00:00Z'}
];
const attribution=attributeRecruitmentsToStaff(rows,enrollments,{});
assert.equal(attribution.totalEnrollments,2);
assert.equal(attribution.matchedCustomers,2);
assert.equal(attribution.byStaff.get('S1'),1,'first identified C100 transaction belongs to S1');
assert.equal(attribution.byStaff.get('S2'),1,'C200 belongs to S2');

const agg=aggregateCashierRows(rows,{});
const s1=agg.items.find(x=>x.staffId==='S1'),s2=agg.items.find(x=>x.staffId==='S2');
assert.equal(s1.tickets,1);
assert.equal(s1.identifiedTickets,1);
assert.equal(s2.tickets,3);
assert.equal(s2.identifiedTickets,2);
assert.equal(s2.nonLoyaltyTickets,1);

console.log('V2.36 StaffId + custAccount recruitment attribution: OK');
