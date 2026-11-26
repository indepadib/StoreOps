// Download module bytes together; bootstrap still evaluates modules in order.
export function preloadAnalyticsModules(doc,urls){
 if(!doc?.head)return 0;
 const existing=new Set([...doc.querySelectorAll('link[rel="modulepreload"]')].map(link=>link.getAttribute('href')));
 let count=0;
 for(const url of urls){
  if(existing.has(url))continue;
  const link=doc.createElement('link');link.rel='modulepreload';link.href=url;link.fetchPriority='low';
  doc.head.append(link);existing.add(url);count++;
 }
 return count;
}
