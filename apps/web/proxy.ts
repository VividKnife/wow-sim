import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NextResponse, type NextRequest} from 'next/server';
import {assetRedirect} from './lib/static-assets.mjs';

let deployment: {assetMode?: string; publicAssetVersion?: string} | undefined;
function deploymentAssets() {
  if (deployment) return deployment;
  try { deployment = JSON.parse(readFileSync(join(process.cwd(), 'public/__deployment.json'), 'utf8')); }
  catch { deployment = {assetMode: 'bundled'}; }
  return deployment!;
}
export function proxy(request: NextRequest) {
  const {assetMode, publicAssetVersion} = deploymentAssets();
  if (assetMode !== 'r2') return NextResponse.next();
  const target = assetRedirect({url: request.url, method: request.method,
    origin: process.env.R2_ASSET_ORIGIN || 'https://wow-sim.dota.run', version: publicAssetVersion, assetMode});
  if (!target) return new NextResponse('Static asset configuration unavailable', {status: 503, headers: {'Cache-Control': 'no-store'}});
  // Switching to bundled assets requires a rebuild; never cache redirects.
  return NextResponse.redirect(target, {status: 307, headers: {'Cache-Control': 'no-store'}});
}
export const config = {
  matcher: ['/battle/:path*','/characters/:path*','/creatures/:path*','/demo/:path*','/icons/:path*','/interface/:path*','/journal/:path*','/maps/:path*','/music/:path*','/scenes/:path*','/sounds/:path*','/favicon.svg','/file.svg','/globe.svg','/window.svg'],
};
