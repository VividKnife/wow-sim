// Shared by the browser build and the API serializer. Only public namespaces
// are rewritten; navigation, authentication and stateful APIs stay same-origin.
export const publicAssetPattern=/^\/(?:battle|characters|creatures|demo|icons|interface|journal|maps|music|scenes|sounds)\/|^\/(?:favicon|file|globe|window)\.svg$/;
export function publicAssetUrl(value,base='') {
 return typeof value==='string'&&base&&publicAssetPattern.test(value)?base+value:value;
}
export function rewriteAssetLiterals(source,base) {
 if(!base)return source;
 return source.replace(/(["'`(])\/(?!\/)(?=(?:battle|characters|creatures|demo|icons|interface|journal|maps|music|scenes|sounds)\/|(?:favicon|file|globe|window)\.svg)/g,`$1${base}/`);
}
