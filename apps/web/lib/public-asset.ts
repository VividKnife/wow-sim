import {publicAssetUrl} from '../../../packages/contracts/src/asset-paths.mjs';
declare const __PUBLIC_ASSET_BASE__:string;
export const publicAsset=(value:string)=>publicAssetUrl(value,typeof __PUBLIC_ASSET_BASE__==='string'?__PUBLIC_ASSET_BASE__:'');
