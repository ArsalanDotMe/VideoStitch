import type { ErrorCode } from './types.js';

export interface VideoStitchErrorOptions {
  readonly cause?: unknown;
  readonly operation?: string;
  readonly exitCode?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly diagnostics?: string;
}

export class VideoStitchError extends Error {
  readonly code: ErrorCode;
  readonly operation?: string;
  readonly exitCode?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly diagnostics?: string;

  constructor(code: ErrorCode, message: string, options: VideoStitchErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'VideoStitchError';
    this.code = code;
    if (options.operation !== undefined) this.operation = options.operation;
    if (options.exitCode !== undefined) this.exitCode = options.exitCode;
    if (options.signal !== undefined) this.signal = options.signal;
    if (options.diagnostics !== undefined) this.diagnostics = options.diagnostics;
  }
}

export function asVideoStitchError(error: unknown, operation: string): VideoStitchError {
  if (error instanceof VideoStitchError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new VideoStitchError('ABORTED', `${operation} was aborted`, { cause: error, operation });
  }
  return new VideoStitchError('PROCESS_FAILED', `${operation} failed`, {
    cause: error,
    operation,
  });
}
