export function isMarkdownOffer(offerId, name){
 return [offerId,name].some(value=>/(?:^|[^A-Z0-9])MD(?:20|50)(?=$|[^A-Z0-9])/i.test(String(value??'')));
}
