const clean=v=>String(v??'').trim();
export function projectLoyaltyIdentity({account,parties,cards}){
 const unresolved=()=>({status:'UNVERIFIED',cardCount:null,firstEnrollmentAt:null});
 if(!Array.isArray(parties)||!Array.isArray(cards)||!clean(account?.Party))return unresolved();
 const matches=new Set(parties.filter(p=>clean(p.SourceKey)===clean(account.Party)).map(p=>clean(p.PartyNumber)));
 if(matches.size!==1||matches.has(''))return unresolved();
 const party=[...matches][0],numbers=new Map();
 for(const card of cards){
  if(clean(card.PartyNumber)!==party)continue;
  const number=clean(card.CardNumber),date=clean(card.LoyaltyEnrollmentDate);
  if(!number||!Number.isFinite(Date.parse(date)))return unresolved();
  const iso=new Date(date).toISOString();
  if(numbers.has(number)&&numbers.get(number)!==iso)return unresolved();
  numbers.set(number,iso);
 }
 // A number with conflicting ownership anywhere in the returned source is not verified.
 if(cards.some(c=>numbers.has(clean(c.CardNumber))&&clean(c.PartyNumber)!==party))return unresolved();
 return {status:'READY',cardCount:numbers.size,firstEnrollmentAt:[...numbers.values()].sort()[0]||null};
}
