const orangeCodes=Object.freeze(['HS-006590','HS-007149']);
export const historyCodes=sku=>orangeCodes.includes(sku)?orangeCodes:[sku];
export const analyticalProductCode=sku=>orangeCodes.includes(sku)?orangeCodes[1]:sku;
