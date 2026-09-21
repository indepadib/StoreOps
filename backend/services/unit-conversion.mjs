const clean=v=>String(v??'').trim();
const ascii=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

const UNITS=Object.freeze({
 G:{dimension:'MASS',scale:1,label:'g'},
 GR:{dimension:'MASS',scale:1,label:'g'},
 GRAMME:{dimension:'MASS',scale:1,label:'g'},
 GRAMMES:{dimension:'MASS',scale:1,label:'g'},
 KG:{dimension:'MASS',scale:1000,label:'kg'},
 KGS:{dimension:'MASS',scale:1000,label:'kg'},
 KILOGRAMME:{dimension:'MASS',scale:1000,label:'kg'},
 KILOGRAMMES:{dimension:'MASS',scale:1000,label:'kg'},
 ML:{dimension:'VOLUME',scale:1,label:'mL'},
 MILLILITRE:{dimension:'VOLUME',scale:1,label:'mL'},
 MILLILITRES:{dimension:'VOLUME',scale:1,label:'mL'},
 L:{dimension:'VOLUME',scale:1000,label:'L'},
 LT:{dimension:'VOLUME',scale:1000,label:'L'},
 LITRE:{dimension:'VOLUME',scale:1000,label:'L'},
 LITRES:{dimension:'VOLUME',scale:1000,label:'L'},
 PC:{dimension:'COUNT',scale:1,label:'pièce'},
 PCS:{dimension:'COUNT',scale:1,label:'pièce'},
 PIECE:{dimension:'COUNT',scale:1,label:'pièce'},
 PIECES:{dimension:'COUNT',scale:1,label:'pièce'},
 EA:{dimension:'COUNT',scale:1,label:'pièce'},
 UNIT:{dimension:'COUNT',scale:1,label:'pièce'},
 UNITE:{dimension:'COUNT',scale:1,label:'pièce'},
 BARQUETTE:{dimension:'PACK',scale:1,label:'barquette'},
 BARQUETTES:{dimension:'PACK',scale:1,label:'barquette'},
 COLIS:{dimension:'PACK',scale:1,label:'colis'}
});

export function normalizeUnit(value){
 const key=ascii(value).replace(/[^A-Z0-9]+/g,'');
 return UNITS[key]||null
}

export function convertQuantity(quantity,fromUnit,toUnit){
 const qty=Number(quantity),from=normalizeUnit(fromUnit),to=normalizeUnit(toUnit);
 if(!Number.isFinite(qty)||qty<0)return{status:'INVALID_QUANTITY',quantity:null,factor:null,from:from?.label||clean(fromUnit)||null,to:to?.label||clean(toUnit)||null};
 if(!from||!to)return{status:'UNKNOWN_UNIT',quantity:null,factor:null,from:from?.label||clean(fromUnit)||null,to:to?.label||clean(toUnit)||null};
 if(from.dimension!==to.dimension)return{status:'INCOMPATIBLE_UNIT',quantity:null,factor:null,from:from.label,to:to.label};
 const factor=from.scale/to.scale;
 return{status:'READY',quantity:qty*factor,factor,from:from.label,to:to.label}
}

export function valueByBasis({quantity,quantityUnit,amount,basisUnit,basisQuantity=1}={}){
 const price=Number(amount),basisQty=Number(basisQuantity??1);
 if(!Number.isFinite(price)||price<0)return{status:'AMOUNT_UNAVAILABLE',total:null,equivalentQuantity:null,conversionFactor:null,basisUnit:clean(basisUnit)||null,basisQuantity:Number.isFinite(basisQty)&&basisQty>0?basisQty:null};
 if(!Number.isFinite(basisQty)||basisQty<=0)return{status:'INVALID_BASIS_QUANTITY',total:null,equivalentQuantity:null,conversionFactor:null,basisUnit:clean(basisUnit)||null,basisQuantity:null};
 const conv=convertQuantity(quantity,quantityUnit,basisUnit);
 if(conv.status!=='READY')return{...conv,total:null,equivalentQuantity:null,basisUnit:clean(basisUnit)||null,basisQuantity:basisQty};
 const unitsOfPrice=conv.quantity/basisQty,total=price*unitsOfPrice;
 return{status:'READY',total,equivalentQuantity:conv.quantity,conversionFactor:conv.factor,basisUnit:conv.to,basisQuantity:basisQty,amount:price,pricedUnits:unitsOfPrice}
}
