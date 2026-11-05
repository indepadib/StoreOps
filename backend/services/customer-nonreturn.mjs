const round = n => Math.round(n * 100) / 100;
const percent = (n, total) => total ? round(n * 100 / total) : null;

export function customerNonreturn(previous, current, habits, evidence, products, minimumTickets) {
 const missing = new Map();
 const signals = new Map(products.filter(p => p.priceChangePct >= 10 &&
  p.previous.tickets >= minimumTickets && p.current.tickets >= minimumTickets)
  .map(p => [p.productNumber, p]));
 for (const [id, customer] of previous) {
  if (!current.has(id)) missing.set(id, {customer, stores:new Set(), lastStores:new Set(), lastDate:'', promoTickets:0});
 }
 const seen = new Set();
 for (const basket of evidence.baskets) {
  const row = missing.get(basket.customerToken);
  if (!row || !basket.key || seen.has(basket.key)) continue;
  seen.add(basket.key);
  row.stores.add(basket.storeId);
  if (basket.date > row.lastDate) {
   row.lastDate = basket.date;
   row.lastStores.clear();
  }
  if (basket.date === row.lastDate) row.lastStores.add(basket.storeId);
  if (basket.items.some(item => item.periodicDiscountAmount > 0)) row.promoTickets++;
 }
 const segments = new Map(), articles = new Map();
 const rows = [...missing].map(([id, row]) => {
  const habit = habits.previous.get(id);
  const days = new Set(habit?.dates).size;
  const segment = days >= 3 ? (habit.overdue ? 'OVERDUE' : 'REGULAR') : days === 2 ? 'TWO_DAYS' : 'ONE_DAY';
  const group = segments.get(segment) || {segment, customers:0, tickets:0, sales:0};
  group.customers++;
  group.tickets += row.customer.tickets;
  group.sales += row.customer.sales;
  segments.set(segment, group);
  const ranked = [...(habit?.articles || [])].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const priceSignals = [];
  for (const [sku, count] of ranked) {
   if (count < 2 || count * 2 < row.customer.tickets) continue;
   const product = signals.get(sku);
   const article = articles.get(sku) || {
    productNumber:sku, productName:product?.productName || null, customers:0,
    previousPrice:product?.previous.realizedUnitPrice ?? null, currentPrice:product?.current.realizedUnitPrice ?? null,
    priceChangePct:product?.priceChangePct ?? null
   };
   article.customers++;
   articles.set(sku, article);
   if (product) priceSignals.push(sku);
  }
  return {segment, days, tickets:row.customer.tickets, sales:round(row.customer.sales),
   basket:round(row.customer.sales / row.customer.tickets), lastDate:row.lastDate,
   stores:[...row.stores].sort(), lastStores:[...row.lastStores].sort(), promoTickets:row.promoTickets,
   gap:days >= 3 ? habit.gap : null, topArticles:ranked.slice(0,5), priceSignals};
 }).sort((a,b) => b.sales-a.sales || b.days-a.days || b.lastDate.localeCompare(a.lastDate));
 const tickets = [...segments.values()].reduce((total, group) => total + group.tickets, 0);
 const sales = [...segments.values()].reduce((total, group) => total + group.sales, 0);
 const returning = [...previous].filter(([id]) => current.has(id)).map(([,customer]) => customer);
 const returningTickets = returning.reduce((total, customer) => total + customer.tickets, 0);
 return {customers:rows.length, share:percent(rows.length, previous.size), tickets, sales:round(sales),
  basket:tickets ? round(sales / tickets) : null, ticketsPerCustomer:rows.length ? round(tickets / rows.length) : null,
  returningBasket:returningTickets ? round(returning.reduce((total,c) => total+c.sales,0) / returningTickets) : null,
  returningTicketsPerCustomer:returning.length ? round(returningTickets / returning.length) : null,
  promoCustomers:rows.filter(row => row.promoTickets).length, priceCustomers:rows.filter(row => row.priceSignals.length).length,
  segments:[...segments.values()].map(group => ({...group, sales:round(group.sales), share:percent(group.customers,rows.length)})),
  articles:[...articles.values()].map(article => {
   const usual = habits.byProduct.get(article.productNumber) || [];
   const returned = usual.filter(buyer => current.has(buyer.id)).length;
   return {...article, returned, nonreturnShare:percent(article.customers,article.customers+returned)};
  }).sort((a,b) => b.customers-a.customers || a.productNumber.localeCompare(b.productNumber)),
  rows:rows.map((row,index) => ({...row, reference:index+1}))};
}
