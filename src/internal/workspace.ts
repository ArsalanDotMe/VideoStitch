import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { OperationOptions } from '../types.js';

export async function withWorkspace<T>(
  operation: string,
  options: OperationOptions,
  work: (workspace: string) => Promise<T>,
): Promise<T> {
  const root = resolve(options.tempDirectory ?? tmpdir());
  const workspace = await mkdtemp(join(root, 'video-stitch-'));
  options.onProgress?.({ phase: 'preparing' });
  options.logger?.debug?.('Created operation workspace', { operation, workspace });
  try {
    return await work(workspace);
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}
