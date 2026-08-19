import { spawn } from 'node:child_process';
import { VideoStitchError } from '../error.js';
import type { OperationOptions } from '../types.js';
import { createProgressParser } from './progress.js';
import { redactText } from './redact.js';

const CAPTURE_LIMIT = 1024 * 1024;

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunProcessOptions {
  readonly operation: string;
  readonly execution: OperationOptions;
  readonly duration?: number;
  readonly parseProgress?: boolean;
}

function appendBounded(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= CAPTURE_LIMIT ? combined : combined.slice(-CAPTURE_LIMIT);
}

export async function runProcess(
  executable: string,
  args: readonly string[],
  options: RunProcessOptions,
): Promise<ProcessResult> {
  if (options.execution.signal?.aborted === true) {
    throw new VideoStitchError('ABORTED', `${options.operation} was aborted`, {
      operation: options.operation,
    });
  }

  options.execution.logger?.debug?.('Starting media process', {
    operation: options.operation,
    executable,
    args: args.map(redactText),
  });

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let aborted = false;
    const progress = createProgressParser(options.duration, options.execution.onProgress);
    const child = spawn(executable, [...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const kill = (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }, 5_000).unref();
      }
    };
    const abort = (): void => {
      aborted = true;
      kill();
    };
    options.execution.signal?.addEventListener('abort', abort, { once: true });
    const timer =
      options.execution.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            kill();
          }, options.execution.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = appendBounded(stderr, chunk);
      if (options.parseProgress === true) progress.push(chunk);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.execution.signal?.removeEventListener('abort', abort);
      if (error.code === 'ENOENT') {
        reject(
          new VideoStitchError(
            'FFMPEG_NOT_FOUND',
            `Media executable was not found: ${executable}`,
            {
              cause: error,
              operation: options.operation,
            },
          ),
        );
      } else {
        reject(
          new VideoStitchError('PROCESS_FAILED', `${options.operation} could not start`, {
            cause: error,
            operation: options.operation,
          }),
        );
      }
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      options.execution.signal?.removeEventListener('abort', abort);
      progress.finish();
      if (aborted) {
        reject(
          new VideoStitchError('ABORTED', `${options.operation} was aborted`, {
            operation: options.operation,
          }),
        );
      } else if (timedOut) {
        reject(
          new VideoStitchError('TIMEOUT', `${options.operation} exceeded its timeout`, {
            operation: options.operation,
          }),
        );
      } else if (code !== 0) {
        reject(
          new VideoStitchError(
            'PROCESS_FAILED',
            `${options.operation} failed with exit code ${code}`,
            {
              operation: options.operation,
              exitCode: code,
              signal,
              diagnostics: redactText(stderr),
            },
          ),
        );
      } else {
        resolve({ stdout, stderr: redactText(stderr) });
      }
    });
  });
}

export async function assertSupportedExecutable(
  executable: string,
  operation: string,
  options: OperationOptions,
): Promise<void> {
  const result = await runProcess(executable, ['-version'], { operation, execution: options });
  const match = /version\s+(\d+)(?:\.(\d+))?/iu.exec(result.stdout)?.slice(1);
  const major = Number(match?.[0]);
  const minor = Number(match?.[1] ?? 0);
  if (!Number.isFinite(major) || major < 6 || (major === 6 && minor < 1)) {
    throw new VideoStitchError('UNSUPPORTED_FFMPEG', `${executable} 6.1 or newer is required`, {
      operation,
    });
  }
}
