import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici';

export type ServerFetchOptions = RequestInit & {
  timeoutMs?: number;
  maxBytes?: number;
  publicAddressOnly?: boolean;
};
export type ServerFetch = (url: string | URL, options?: ServerFetchOptions) => Promise<Response>;
let testTransport: ServerFetch | null = null;

function transportError(status = 502): Error & { status: number } {
  return Object.assign(new Error(status === 503 ? 'Upstream transport is unavailable' : 'Upstream request failed'), { status });
}

/** Test seam. Injected service responses should be constructed with Response. */
export function setServerFetchForTests(transport: ServerFetch | null): void {
  testTransport = transport;
}

function networkConfig() {
  const tor = process.env.TOR_PROXY_URL;
  if (tor || process.env.SEARCH_NETWORK_MODE === 'tor_socks') return { mode: 'tor_socks' as const, proxy: tor };
  const proxy = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return { mode: proxy ? 'http_proxy' as const : 'direct' as const, proxy };
}

export function getNetworkStatus(): { mode: 'direct' | 'http_proxy' | 'tor_socks'; configured: boolean } {
  const config = networkConfig();
  let configured = config.mode === 'direct';
  if (config.proxy) {
    try {
      const parsed = new URL(config.proxy);
      configured = Boolean(parsed.hostname) && (config.mode === 'tor_socks'
        ? ['socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(parsed.protocol)
        : ['http:', 'https:'].includes(parsed.protocol));
    } catch { configured = false; }
  }
  return { mode: config.mode, configured };
}

const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) nonPublic.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001:db8::', 32], ['2001::', 32], ['2002::', 16]] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !nonPublic.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !nonPublic.check(address, 'ipv6');
  return false;
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Request aborted'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Request aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function publicDispatcher(url: URL, signal: AbortSignal): Promise<Agent> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
    : await withAbort(dns.lookup(hostname, { all: true, verbatim: true }), signal);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Private destination refused');
  // Pin the exact checked records; a second DNS lookup cannot rebind to an internal host.
  return new Agent({ connect: { lookup: ((_host: string, options: any, callback: any) => {
    const selected = options.family ? addresses.filter((entry) => entry.family === options.family) : addresses;
    if (!selected.length) { callback(new Error('No public address')); return; }
    if (options.all) callback(null, selected);
    else callback(null, selected[0].address, selected[0].family);
  }) as any } });
}

async function bufferResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<Response> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel();
    throw new Error('Upstream response is too large');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) {
      while (true) {
        const part = await withAbort(reader.read(), signal);
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) throw new Error('Upstream response is too large');
        chunks.push(part.value);
      }
    }
  } catch (error) {
    void reader?.cancel().catch(() => {});
    throw error;
  } finally {
    reader?.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
    status: response.status, statusText: response.statusText, headers,
  });
}

function socksRequest(url: URL, options: ServerFetchOptions, proxy: string, signal: AbortSignal, maxBytes: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(options.headers).entries());
    headers['accept-encoding'] = 'identity';
    // Tor must resolve the destination through SOCKS, not through local DNS.
    const remoteDnsProxy = proxy.replace(/^socks5:\/\//i, 'socks5h://').replace(/^socks4:\/\//i, 'socks4a://');
    const agent = new SocksProxyAgent(remoteDnsProxy);
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: options.method || 'GET', headers, agent, signal,
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const encoding = incoming.headers['content-encoding'];
      const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
      const body = decoder ? incoming.pipe(decoder) : incoming;
      let wireBytes = 0;
      incoming.on('data', (chunk: Buffer) => {
        wireBytes += chunk.byteLength;
        if (wireBytes > maxBytes) { incoming.destroy(); body.destroy(new Error('Upstream response is too large')); }
      });
      body.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > maxBytes) { incoming.destroy(); body.destroy(new Error('Upstream response is too large')); return; }
        chunks.push(chunk);
      });
      incoming.on('error', reject);
      incoming.on('aborted', () => reject(transportError()));
      body.on('error', reject);
      body.on('end', () => {
        const status = incoming.statusCode || 502;
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        responseHeaders.delete('content-encoding');
        responseHeaders.delete('content-length');
        if (status >= 300 && status < 400 && options.redirect !== 'manual') {
          reject(new Error('Upstream redirect refused')); return;
        }
        try {
          resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
            status, statusText: incoming.statusMessage, headers: responseHeaders,
          }));
        } catch { reject(transportError()); }
      });
    });
    request.on('error', reject);
    request.on('close', () => agent.destroy());
    if (options.body != null) {
      if (typeof options.body === 'string' || options.body instanceof Uint8Array) request.write(options.body);
      else { request.destroy(); reject(new Error('Unsupported proxy request body')); return; }
    }
    request.end();
  });
}

/** Complete-body deadline and byte limit; configured proxies never fall back to direct. */
export const serverFetch: ServerFetch = async (url, options = {}) => {
  if (testTransport) return testTransport(url, options);
  const timeoutMs = options.timeoutMs ?? 6000;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  let dispatcher: Agent | ProxyAgent | undefined;
  try {
    const destination = new URL(url);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) throw transportError();
    if (options.redirect === 'follow') throw transportError();
    if (!Number.isFinite(timeoutMs) || !(timeoutMs > 0) || !Number.isSafeInteger(maxBytes) || !(maxBytes > 0)) throw transportError();
    const config = networkConfig();
    if (options.publicAddressOnly && config.mode !== 'direct') throw transportError(503);
    if (!getNetworkStatus().configured) throw transportError(503);
    if (config.mode === 'tor_socks') {
      if (!config.proxy || !/^socks(?:4a?|5h?):\/\//i.test(config.proxy)) throw transportError(503);
      return await socksRequest(destination, options, config.proxy, controller.signal, maxBytes);
    }
    if (config.proxy) {
      let proxy: URL;
      try { proxy = new URL(config.proxy); } catch { throw transportError(503); }
      if (!['http:', 'https:'].includes(proxy.protocol)) throw transportError(503);
      const token = proxy.username || proxy.password
        ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}` : undefined;
      proxy.username = ''; proxy.password = '';
      dispatcher = new ProxyAgent({ uri: proxy.href, token });
    } else if (options.publicAddressOnly) dispatcher = await publicDispatcher(destination, controller.signal);
    const { timeoutMs: _timeout, maxBytes: _max, publicAddressOnly: _public, ...init } = options;
    const requestOptions = { ...init, redirect: options.redirect ?? 'error', signal: controller.signal };
    // A dispatcher must be paired with the same undici version's fetch implementation.
    const responsePromise: Promise<Response> = dispatcher
      ? undiciFetch(destination, { ...requestOptions, dispatcher } as any) as unknown as Promise<Response>
      : fetch(destination, requestOptions);
    const response = await withAbort(responsePromise, controller.signal);
    return await bufferResponse(response, maxBytes, controller.signal);
  } catch (error) {
    // Provider errors can contain full queries or proxy credentials.
    throw transportError(controller.signal.aborted || (error as any)?.status === 503 ? 503 : 502);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    if (dispatcher) await dispatcher.destroy().catch(() => {});
  }
};
