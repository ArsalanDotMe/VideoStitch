import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { VideoStitchError } from '../error.js';

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) return true;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/u.test(normalized)) return true;
  if (normalized.startsWith('ff')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
  if (mapped !== undefined) return isPrivateIpv4(mapped);
  const hexadecimal = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(normalized);
  if (hexadecimal !== null) {
    const high = Number.parseInt(hexadecimal[1] ?? '0', 16);
    const low = Number.parseInt(hexadecimal[2] ?? '0', 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? isPrivateIpv4(address) : family === 6 ? isPrivateIpv6(address) : true;
}

export async function resolvePublicAddress(
  hostname: string,
  allowPrivateNetworks: boolean,
): Promise<{ readonly address: string; readonly family: 4 | 6 }> {
  let addresses: readonly { address: string; family: 4 | 6 }[];
  try {
    addresses = (await lookup(hostname, { all: true, verbatim: true })).map((entry) => ({
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
    }));
  } catch (error) {
    throw new VideoStitchError('REMOTE_FETCH_FAILED', `Could not resolve remote host ${hostname}`, {
      cause: error,
    });
  }
  if (addresses.length === 0) {
    throw new VideoStitchError('REMOTE_FETCH_FAILED', `Remote host ${hostname} has no addresses`);
  }
  if (!allowPrivateNetworks && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new VideoStitchError(
      'REMOTE_SOURCE_DENIED',
      'Remote source resolves to a private network',
    );
  }
  const first = addresses[0];
  if (first === undefined) {
    throw new VideoStitchError('REMOTE_FETCH_FAILED', `Remote host ${hostname} has no addresses`);
  }
  return first;
}
