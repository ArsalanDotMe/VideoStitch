import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { VideoStitchError } from '../error.js';
import type { HttpsMediaSource, MediaSource, OperationOptions } from '../types.js';
import { downloadHttpsSource } from './remote.js';

type ParsedSource =
  | { readonly kind: 'file'; readonly path: string }
  | {
      readonly kind: 'https';
      readonly url: URL;
      readonly headers: Readonly<Record<string, string>>;
    };

function isHttpsObject(source: MediaSource): source is HttpsMediaSource {
  return typeof source === 'object' && !(source instanceof URL) && 'url' in source;
}

function parseSource(source: MediaSource): ParsedSource {
  if (source instanceof URL || isHttpsObject(source)) {
    const url = new URL(source instanceof URL ? source : source.url);
    if (url.protocol !== 'https:') {
      throw new VideoStitchError('REMOTE_SOURCE_DENIED', 'Only HTTPS remote sources are allowed');
    }
    return {
      kind: 'https',
      url,
      headers: source instanceof URL ? {} : (source.headers ?? {}),
    };
  }
  if (typeof source !== 'string' || source.trim() === '') {
    throw new VideoStitchError('INVALID_INPUT', 'Media source must not be empty');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(source)) {
    const url = new URL(source);
    if (url.protocol !== 'https:') {
      throw new VideoStitchError('REMOTE_SOURCE_DENIED', 'Only HTTPS remote sources are allowed');
    }
    return { kind: 'https', url, headers: {} };
  }
  return { kind: 'file', path: isAbsolute(source) ? source : resolve(source) };
}

export async function resolveSource(
  source: MediaSource,
  workspace: string,
  options: OperationOptions,
): Promise<string> {
  const parsed = parseSource(source);
  if (parsed.kind === 'https') {
    return downloadHttpsSource({ url: parsed.url, headers: parsed.headers }, workspace, options);
  }
  const path = parsed.path;
  try {
    await access(path);
  } catch (error) {
    throw new VideoStitchError('SOURCE_NOT_FOUND', `Media source does not exist: ${path}`, {
      cause: error,
    });
  }
  return path;
}
