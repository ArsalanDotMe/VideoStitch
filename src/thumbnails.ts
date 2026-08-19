import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { VideoStitchError, asVideoStitchError } from './error.js';
import type { OperationOptions, ThumbnailsRequest } from './types.js';
import { prepareOutput, type PreparedOutput } from './internal/output.js';
import { assertSupportedExecutable, runProcess } from './internal/process.js';
import { assertVideo, probePath } from './internal/probe.js';
import { resolveSource } from './internal/source.js';
import { assertFiniteNonNegative, assertPositive } from './internal/validation.js';
import { withWorkspace } from './internal/workspace.js';

export function thumbnailFilter(request: ThumbnailsRequest): string {
  const filters: string[] = [];
  const scale =
    request.width === undefined && request.height === undefined
      ? ''
      : `,scale=${request.width ?? -1}:${request.height ?? -1}`;
  if (request.times.length === 1) {
    filters.push(`[0:v:0]trim=start=${request.times[0]},setpts=PTS-STARTPTS${scale}[thumb0]`);
  } else {
    filters.push(
      `[0:v:0]split=${request.times.length}${request.times.map((_, index) => `[split${index}]`).join('')}`,
    );
    request.times.forEach((time, index) => {
      filters.push(`[split${index}]trim=start=${time},setpts=PTS-STARTPTS${scale}[thumb${index}]`);
    });
  }
  return filters.join(';');
}

export async function thumbnails(
  request: ThumbnailsRequest,
  options: OperationOptions = {},
): Promise<readonly string[]> {
  if (request.times.length === 0) {
    throw new VideoStitchError('INVALID_INPUT', 'thumbnails requires at least one time');
  }
  request.times.forEach((time, index) => assertFiniteNonNegative(time, `times[${index}]`));
  if (request.width !== undefined) assertPositive(request.width, 'width');
  if (request.height !== undefined) assertPositive(request.height, 'height');
  const quality = request.quality ?? 2;
  if (!Number.isInteger(quality) || quality < 1 || quality > 31) {
    throw new VideoStitchError('INVALID_INPUT', 'quality must be an integer between 1 and 31');
  }

  return withWorkspace('thumbnails', options, async (workspace) => {
    const directory = resolve(request.outputDirectory);
    await mkdir(directory, { recursive: true });
    const extension = request.format === 'png' ? 'png' : 'jpg';
    const prefix = request.prefix ?? 'thumbnail';
    const outputs: PreparedOutput[] = [];
    try {
      for (let index = 0; index < request.times.length; index += 1) {
        outputs.push(
          await prepareOutput({
            path: join(directory, `${prefix}-${String(index + 1).padStart(4, '0')}.${extension}`),
            ...(request.overwrite === undefined ? {} : { overwrite: request.overwrite }),
          }),
        );
      }
      await assertSupportedExecutable(
        options.ffmpegPath ?? 'ffmpeg',
        'ffmpeg version check',
        options,
      );
      const input = await resolveSource(request.input, workspace, options);
      const info = await probePath(input, input, options);
      assertVideo(info);
      const args = [
        '-hide_banner',
        '-nostdin',
        '-progress',
        'pipe:2',
        '-nostats',
        '-i',
        input,
        '-filter_complex',
        thumbnailFilter(request),
      ];
      outputs.forEach((output, index) => {
        args.push('-map', `[thumb${index}]`, '-frames:v', '1');
        if (request.format === 'png') args.push('-c:v', 'png');
        else args.push('-c:v', 'mjpeg', '-q:v', String(quality));
        args.push('-y', output.temporaryPath);
      });
      await runProcess(options.ffmpegPath ?? 'ffmpeg', args, {
        operation: 'thumbnails',
        execution: options,
        duration: Math.max(...request.times),
        parseProgress: true,
      });
      const committed: string[] = [];
      for (const output of outputs) committed.push(await output.commit());
      options.onProgress?.({ phase: 'finalizing', percent: 100 });
      return committed;
    } catch (error) {
      await Promise.all(outputs.map((output) => output.discard()));
      throw asVideoStitchError(error, 'thumbnails');
    }
  });
}
