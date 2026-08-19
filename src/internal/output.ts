import { access, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VideoStitchError } from '../error.js';
import type { OutputOptions } from '../types.js';
import { validateOutput } from './validation.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface PreparedOutput {
  readonly finalPath: string;
  readonly temporaryPath: string;
  commit(): Promise<string>;
  discard(): Promise<void>;
}

export async function prepareOutput(output: OutputOptions): Promise<PreparedOutput> {
  const finalPath = validateOutput(output);
  await mkdir(dirname(finalPath), { recursive: true });
  const destinationExists = await exists(finalPath);
  if (destinationExists && output.overwrite !== true) {
    throw new VideoStitchError('OUTPUT_EXISTS', `Output already exists: ${finalPath}`);
  }
  const suffix = extname(finalPath);
  const temporaryPath = join(
    dirname(finalPath),
    `.${basename(finalPath, suffix)}.video-stitch-${randomUUID()}${suffix}`,
  );

  return {
    finalPath,
    temporaryPath,
    async commit() {
      const backup = `${finalPath}.video-stitch-backup-${randomUUID()}`;
      let backedUp = false;
      try {
        if (await exists(finalPath)) {
          if (output.overwrite !== true) {
            throw new VideoStitchError(
              'OUTPUT_EXISTS',
              `Output appeared before commit: ${finalPath}`,
            );
          }
          await rename(finalPath, backup);
          backedUp = true;
        }
        await rename(temporaryPath, finalPath);
        if (backedUp) await rm(backup, { force: true });
        return finalPath;
      } catch (error) {
        if (backedUp && !(await exists(finalPath))) await rename(backup, finalPath);
        throw error;
      }
    },
    async discard() {
      await rm(temporaryPath, { force: true });
    },
  };
}
