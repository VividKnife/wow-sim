import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NextResponse, type NextRequest} from 'next/server';
import {assetRedirect} from './lib/static-assets.mjs';
import {createReadinessCheck} from './lib/r2-readiness.mjs';
const ready=createReadinessCheck();

let version: string | undefined;
function assetVersion() {
  if(version!==undefined)return version;
  try { version=JSON.parse(readFileSync(join(process.cwd(),'public/__deployment.json'),'utf8')).publicAssetVersion || ''; }
  catch { version=''; }
  return version;
}
export async function proxy(request: NextRequest) {
  const target=assetRedirect({url:request.url,method:request.method,origin:process.env.R2_ASSET_ORIGIN,version:assetVersion()});
  if(!target || !await ready(new URL(target).origin,assetVersion()))return NextResponse.next();
  // Never cache the redirect: clearing R2_ASSET_ORIGIN restores local assets.
  return NextResponse.redirect(target,{status:307,headers:{'Cache-Control':'no-store'}});
}
export const config = {
  matcher: ['/battle/:path*','/characters/:path*','/creatures/:path*','/demo/:path*','/icons/:path*','/interface/:path*','/journal/:path*','/maps/:path*','/music/:path*','/scenes/:path*','/sounds/:path*','/favicon.svg','/file.svg','/globe.svg','/window.svg'],
};
