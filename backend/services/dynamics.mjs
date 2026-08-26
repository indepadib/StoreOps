const PRODUCTS = {
  '3017620422003': {ean:'3017620422003',name:'Nutella 750g',price:64.90,stock:17,category:'Épicerie'},
  '6111040001111': {ean:'6111040001111',name:'Lait frais entier 1L',price:12.90,stock:24,category:'Frais'},
  '3274080005003': {ean:'3274080005003',name:'Yaourt nature 4x110g',price:18.50,stock:36,category:'Frais'}
};
export async function getProductByEan(ean){ return PRODUCTS[ean] || null; }
export async function getDynamicsHealth(){ return {connected:false,mode:'SIMULATED',lastSync:new Date().toISOString()}; }
export async function postReceiptToDynamics(poNumber){ return {ok:true,simulated:true,poNumber,postedAt:new Date().toISOString()}; }
