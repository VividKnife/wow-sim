type BackendEnvironment = Record<string, unknown> & {
  GAME_SERVER_URL?: unknown;
  GAME_SERVER_SECRET?: unknown;
};

type ProxyOptions = {
  accountId: string | null;
  public?: boolean;
  path: '/game' | '/game/replay' | '/game/local' | '/content' | '/workshop' | '/saves';
  environment: BackendEnvironment;
  fetchImpl?: (request: Request) => Promise<Response>;
};

const safeResponseHeaders = ['cache-control', 'content-type', 'etag', 'retry-after'];
const encoder = new TextEncoder();

function acceptsGzip(header: string | null): boolean {
  const encodings = new Map((header || '').toLowerCase().split(',').map(part => {
    const [name, ...parameters] = part.trim().split(';');
    const quality = parameters.find(value => value.trim().startsWith('q='));
    return [name.trim(), quality ? Number(quality.trim().slice(2)) : 1] as const;
  }));
  return (encodings.get('gzip') ?? encodings.get('*') ?? 0) > 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signAccount(accountId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(encoder.encode(JSON.stringify({alg: 'HS256', typ: 'JWT'})));
  const payload = base64Url(encoder.encode(JSON.stringify({sub: accountId, iat: now, exp: now + 60, aud: 'wow-sim-game'})));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function failure(message = '游戏服务暂时不可用，请稍后重试。', status = 503): Response {
  return Response.json({error: message}, {status, headers: {'cache-control': 'no-store'}});
}

function backendConfig(environment: BackendEnvironment): {url: URL; secret: string} | null {
  if (typeof environment.GAME_SERVER_URL !== 'string' || typeof environment.GAME_SERVER_SECRET !== 'string') return null;
  let url: URL;
  try { url = new URL(environment.GAME_SERVER_URL); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || new TextEncoder().encode(environment.GAME_SERVER_SECRET).length < 32) return null;
  return {url, secret: environment.GAME_SERVER_SECRET};
}

export function isSameOriginMutation(request: Request, expectedOrigin = process.env.APP_ORIGIN): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(expectedOrigin || request.url).origin; } catch { return false; }
}

export async function proxyGameRequest(request: Request, options: ProxyOptions): Promise<Response> {
  const config = backendConfig(options.environment);
  if (!config || (!options.public && !options.accountId)) return failure();
  const source = new URL(request.url);
  const destination = new URL(options.path, config.url);
  destination.search = source.search;
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'if-none-match']) {
    const value = request.headers.get(name);
    // Compression exposes a weak validator for the same upstream JSON.
    if (value) headers.set(name, name === 'if-none-match' ? value.replace(/^W\//, '') : value);
  }
  if (!options.public) headers.set('authorization', `Bearer ${await signAccount(options.accountId!, config.secret)}`);
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await (options.fetchImpl ?? fetch)(new Request(destination, {method, headers, body, redirect: 'manual', signal: request.signal}));
  } catch {
    return failure();
  }
  const responseHeaders = new Headers();
  for (const name of safeResponseHeaders) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Next's streamed route responses are not automatically compressed. Raid
  // snapshots can be several MB; compress at the public boundary, asynchronously
  // and without buffering a second copy of the entire snapshot in memory.
  responseHeaders.set('vary', 'Accept-Encoding');
  const gzip = acceptsGzip(request.headers.get('accept-encoding'));
  const etag = responseHeaders.get('etag');
  if (gzip && etag && !etag.startsWith('W/')) responseHeaders.set('etag', `W/${etag}`);
  let responseBody = upstream.body;
  if (gzip && responseBody && method !== 'HEAD' && responseHeaders.get('content-type')?.includes('application/json')) {
    responseHeaders.set('content-encoding', 'gzip');
    responseBody = responseBody.pipeThrough(new CompressionStream('gzip'));
  }
  return new Response(responseBody, {status: upstream.status, statusText: upstream.statusText, headers: responseHeaders});
}
