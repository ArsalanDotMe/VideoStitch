import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { extname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { VideoStitchError } from '../error.js';
import type { OperationOptions, RemoteSourceOptions } from '../types.js';
import { resolvePublicAddress } from './network.js';
import { redactHeaders, safeSourceLabel } from './redact.js';

const DEFAULTS = {
  maxBytes: 2 * 1024 * 1024 * 1024,
  maxRedirects: 5,
  stallTimeoutMs: 30_000,
  totalTimeoutMs: 30 * 60_000,
} as const;

interface DownloadRequest {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
}

export interface RemoteDependencies {
  readonly request: (
    url: URL,
    options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => ClientRequest;
  readonly resolveAddress: typeof resolvePublicAddress;
}

const DEFAULT_DEPENDENCIES: RemoteDependencies = {
  request,
  resolveAddress: resolvePublicAddress,
};

function remoteSettings(options: RemoteSourceOptions | undefined): Required<RemoteSourceOptions> {
  const settings = {
    allowPrivateNetworks: options?.allowPrivateNetworks ?? false,
    maxBytes: options?.maxBytes ?? DEFAULTS.maxBytes,
    maxRedirects: options?.maxRedirects ?? DEFAULTS.maxRedirects,
    stallTimeoutMs: options?.stallTimeoutMs ?? DEFAULTS.stallTimeoutMs,
    totalTimeoutMs: options?.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs,
  };
  if (!Number.isFinite(settings.maxBytes) || settings.maxBytes <= 0) {
    throw new VideoStitchError('INVALID_INPUT', 'remote.maxBytes must be greater than zero');
  }
  if (!Number.isInteger(settings.maxRedirects) || settings.maxRedirects < 0) {
    throw new VideoStitchError(
      'INVALID_INPUT',
      'remote.maxRedirects must be a non-negative integer',
    );
  }
  if (!Number.isFinite(settings.stallTimeoutMs) || settings.stallTimeoutMs <= 0) {
    throw new VideoStitchError('INVALID_INPUT', 'remote.stallTimeoutMs must be greater than zero');
  }
  if (!Number.isFinite(settings.totalTimeoutMs) || settings.totalTimeoutMs <= 0) {
    throw new VideoStitchError('INVALID_INPUT', 'remote.totalTimeoutMs must be greater than zero');
  }
  return settings;
}

function validateUrl(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new VideoStitchError('REMOTE_SOURCE_DENIED', 'Only HTTPS remote sources are allowed');
  }
  if (url.username !== '' || url.password !== '') {
    throw new VideoStitchError(
      'REMOTE_SOURCE_DENIED',
      'Credentials in remote source URLs are not allowed',
    );
  }
}

function extensionFor(url: URL): string {
  const extension = extname(url.pathname);
  return /^\.[a-z0-9]{1,10}$/iu.test(extension) ? extension : '.media';
}

export async function downloadHttpsSource(
  source: DownloadRequest,
  workspace: string,
  options: OperationOptions,
  dependencies: RemoteDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  const settings = remoteSettings(options.remote);
  const destination = join(workspace, `remote-${randomUUID()}${extensionFor(source.url)}`);
  const startedAt = Date.now();
  let current = source;

  try {
    for (let redirect = 0; redirect <= settings.maxRedirects; redirect += 1) {
      validateUrl(current.url);
      if (options.signal?.aborted === true) {
        throw new VideoStitchError('ABORTED', 'Remote source download was aborted');
      }
      if (Date.now() - startedAt > settings.totalTimeoutMs) {
        throw new VideoStitchError('TIMEOUT', 'Remote source download exceeded its total timeout');
      }

      const address = await dependencies.resolveAddress(
        current.url.hostname,
        settings.allowPrivateNetworks,
      );
      options.logger?.debug?.('Downloading remote media', {
        source: safeSourceLabel(current.url),
        headers: redactHeaders(current.headers),
      });

      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const abort = (): void => {
          requestHandle.destroy(new Error('The operation was aborted'));
        };
        const requestHandle = dependencies.request(
          current.url,
          {
            headers: current.headers,
            lookup: (_hostname, _lookupOptions, callback) => {
              callback(null, address.address, address.family);
            },
          },
          (incoming) => {
            clearTimeout(totalTimer);
            resolve(incoming);
          },
        );
        const totalTimer = setTimeout(
          () => {
            requestHandle.destroy(
              new VideoStitchError('TIMEOUT', 'Remote source download exceeded its total timeout'),
            );
          },
          Math.max(1, settings.totalTimeoutMs - (Date.now() - startedAt)),
        );
        requestHandle.once('error', reject);
        requestHandle.setTimeout(settings.stallTimeoutMs, () => {
          requestHandle.destroy(new Error('Remote source stalled'));
        });
        options.signal?.addEventListener('abort', abort, { once: true });
        requestHandle.once('close', () => {
          clearTimeout(totalTimer);
          options.signal?.removeEventListener('abort', abort);
        });
        requestHandle.end();
      });

      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        const location = response.headers.location;
        if (location === undefined) {
          throw new VideoStitchError('REMOTE_FETCH_FAILED', 'Remote redirect omitted Location');
        }
        if (redirect === settings.maxRedirects) {
          throw new VideoStitchError(
            'REMOTE_FETCH_FAILED',
            'Remote source exceeded redirect limit',
          );
        }
        const nextUrl = new URL(location, current.url);
        validateUrl(nextUrl);
        const sameOrigin = nextUrl.origin === current.url.origin;
        current = {
          url: nextUrl,
          headers: sameOrigin
            ? current.headers
            : Object.fromEntries(
                Object.entries(current.headers).filter(
                  ([name]) => !/^(authorization|cookie|proxy-authorization)$/iu.test(name),
                ),
              ),
        };
        continue;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        throw new VideoStitchError('REMOTE_FETCH_FAILED', `Remote source returned HTTP ${status}`);
      }
      const declaredLength = Number(response.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > settings.maxBytes) {
        response.destroy();
        throw new VideoStitchError('REMOTE_FETCH_FAILED', 'Remote source exceeds the size limit');
      }

      let received = 0;
      let stallTimer: NodeJS.Timeout | undefined;
      const abortResponse = (): void => {
        response.destroy(new VideoStitchError('ABORTED', 'Remote source download was aborted'));
      };
      options.signal?.addEventListener('abort', abortResponse, { once: true });
      const totalTimer = setTimeout(
        () =>
          response.destroy(
            new VideoStitchError('TIMEOUT', 'Remote source download exceeded its total timeout'),
          ),
        Math.max(1, settings.totalTimeoutMs - (Date.now() - startedAt)),
      );
      const refreshStallTimer = (): void => {
        if (stallTimer !== undefined) clearTimeout(stallTimer);
        stallTimer = setTimeout(
          () => response.destroy(new Error('Remote source stalled')),
          settings.stallTimeoutMs,
        );
      };
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > settings.maxBytes) {
            callback(new Error('Remote source exceeds the size limit'));
            return;
          }
          refreshStallTimer();
          options.onProgress?.({
            phase: 'downloading',
            ...(Number.isFinite(declaredLength) && declaredLength > 0
              ? { percent: Math.min(100, (received / declaredLength) * 100) }
              : {}),
            source: safeSourceLabel(current.url),
          });
          callback(null, chunk);
        },
      });
      refreshStallTimer();
      try {
        await pipeline(response, limiter, createWriteStream(destination, { flags: 'wx' }));
      } finally {
        if (stallTimer !== undefined) clearTimeout(stallTimer);
        clearTimeout(totalTimer);
        options.signal?.removeEventListener('abort', abortResponse);
      }
      return destination;
    }
    throw new VideoStitchError('REMOTE_FETCH_FAILED', 'Remote source exceeded redirect limit');
  } catch (error) {
    await rm(destination, { force: true });
    if (error instanceof VideoStitchError) throw error;
    if (options.signal?.aborted === true) {
      throw new VideoStitchError('ABORTED', 'Remote source download was aborted', { cause: error });
    }
    throw new VideoStitchError('REMOTE_FETCH_FAILED', 'Could not download remote source', {
      cause: error,
    });
  }
}
