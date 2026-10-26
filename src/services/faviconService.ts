import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { ApiInputError } from './apiValidation.ts';
import { hasExpectedImageSignature, ImageProxyError } from './imageProxy.ts';
import { serverFetch } from './serverTransport.ts';

export async function fetchFavicon(value: unknown, signal?: AbortSignal): Promise<{ body: Buffer; contentType: string }> {
  if (typeof value !== 'string' || value.length > 253 || !/^[\p{L}\p{N}.-]+$/u.test(value)) throw new ApiInputError('Neplatná doména loga.');
  const host = domainToASCII(value).toLowerCase();
  if (isIP(host) || !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') ||
    !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new ApiInputError('Neplatná doména loga.');
  }
  // The upstream host is fixed: result domains never become proxy destinations.
  const response = await serverFetch(`https://icons.duckduckgo.com/ip3/${host}.ico`, {
    signal, timeoutMs: 4500, maxBytes: 128 * 1024, publicAddressOnly: true, redirect: 'error',
    headers: { Accept: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/webp,image/jpeg,image/gif' },
  });
  if (!response.ok || !/^image\//i.test(response.headers.get('content-type') ?? '')) {
    throw new ImageProxyError('Logo sa nepodarilo načítať.');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 128 * 1024) throw new ImageProxyError('Logo je príliš veľké.');
  // Some favicon responses label PNG bytes as image/x-icon. Serve the actual format.
  const contentType = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
    .find(type => hasExpectedImageSignature(body, type)) ??
    (body.length >= 6 && body.readUInt32LE(0) === 0x00010000 && body.readUInt16LE(4) > 0 ? 'image/x-icon' : null);
  if (!contentType) throw new ImageProxyError('Zdroj neposkytol platné logo.');
  return { body, contentType };
}
