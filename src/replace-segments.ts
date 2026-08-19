import { VideoStitchError, asVideoStitchError } from './error.js';
import type { MediaInfo, OperationOptions, ReplaceSegmentsRequest } from './types.js';
import { encodeArguments } from './internal/ffmpeg.js';
import { mapConcurrent } from './internal/concurrency.js';
import { prepareOutput } from './internal/output.js';
import { assertSupportedExecutable, runProcess } from './internal/process.js';
import { assertVideo, primaryAudio, probePath } from './internal/probe.js';
import { resolveSource } from './internal/source.js';
import { assertFiniteNonNegative, assertPositive } from './internal/validation.js';
import { withWorkspace } from './internal/workspace.js';

interface Segment {
  readonly inputIndex: number;
  readonly start: number;
  readonly end: number;
  readonly normalize: boolean;
}

export function replacementPlan(
  request: ReplaceSegmentsRequest,
  base: MediaInfo,
  replacements: readonly MediaInfo[],
): readonly Segment[] {
  const ordered = request.replacements.map((replacement, index) => {
    const info = replacements[index];
    if (info === undefined) {
      throw new VideoStitchError('PROCESS_FAILED', 'Replacement probe result is missing');
    }
    return { replacement, info, index };
  });
  ordered.sort((a, b) => a.replacement.at - b.replacement.at);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const { replacement, info, index } of ordered) {
    assertFiniteNonNegative(replacement.at, `replacements[${index}].at`);
    const sourceStart = replacement.sourceStart ?? 0;
    assertFiniteNonNegative(sourceStart, `replacements[${index}].sourceStart`);
    const duration = replacement.duration ?? info.duration - sourceStart;
    assertPositive(duration, `replacements[${index}].duration`);
    if (sourceStart + duration > info.duration) {
      throw new VideoStitchError(
        'INVALID_INPUT',
        `replacements[${index}] exceeds its source duration`,
      );
    }
    if (replacement.at < cursor) {
      throw new VideoStitchError('INVALID_INPUT', 'Replacement segments must not overlap');
    }
    if (replacement.at + duration > base.duration) {
      throw new VideoStitchError(
        'INVALID_INPUT',
        `replacements[${index}] exceeds the base duration`,
      );
    }
    if (replacement.at > cursor) {
      segments.push({ inputIndex: 0, start: cursor, end: replacement.at, normalize: false });
    }
    segments.push({
      inputIndex: index + 1,
      start: sourceStart,
      end: sourceStart + duration,
      normalize: true,
    });
    cursor = replacement.at + duration;
  }
  if (cursor < base.duration) {
    segments.push({ inputIndex: 0, start: cursor, end: base.duration, normalize: false });
  }
  return segments;
}

export function createReplacementFilter(
  request: ReplaceSegmentsRequest,
  base: MediaInfo,
  replacements: readonly MediaInfo[],
): { readonly graph: string; readonly hasAudio: boolean } {
  const baseVideo = assertVideo(base);
  replacements.forEach(assertVideo);
  const segments = replacementPlan(request, base, replacements);
  const hasAudio = [base, ...replacements].every((info) => primaryAudio(info) !== undefined);
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const normalize =
      segment.normalize && baseVideo.width !== undefined && baseVideo.height !== undefined
        ? `,scale=${baseVideo.width}:${baseVideo.height}:force_original_aspect_ratio=decrease,pad=${baseVideo.width}:${baseVideo.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`
        : '';
    const frameRate = baseVideo.frameRate === undefined ? '' : `,fps=${baseVideo.frameRate}`;
    filters.push(
      `[${segment.inputIndex}:v:0]trim=start=${segment.start}:end=${segment.end},settb=AVTB,setpts=PTS-STARTPTS${normalize}${frameRate}[vsegment${index}]`,
    );
    if (hasAudio) {
      filters.push(
        `[${segment.inputIndex}:a:0]atrim=start=${segment.start}:end=${segment.end},asettb=1/48000,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[audio${index}]`,
      );
    }
  });
  const inputs = segments
    .map((_, index) => `[vsegment${index}]${hasAudio ? `[audio${index}]` : ''}`)
    .join('');
  filters.push(
    `${inputs}concat=n=${segments.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? '[aout]' : ''}`,
  );
  return { graph: filters.join(';'), hasAudio };
}

export async function replaceSegments(
  request: ReplaceSegmentsRequest,
  options: OperationOptions = {},
): Promise<string> {
  if (request.replacements.length === 0) {
    throw new VideoStitchError(
      'INVALID_INPUT',
      'replaceSegments requires at least one replacement',
    );
  }
  if (request.output.strategy === 'copy') {
    throw new VideoStitchError(
      'INCOMPATIBLE_MEDIA',
      'replaceSegments requires encoding and cannot stream-copy',
    );
  }
  return withWorkspace('replaceSegments', options, async (workspace) => {
    const output = await prepareOutput({ ...request.output, strategy: 'encode' });
    try {
      await assertSupportedExecutable(
        options.ffmpegPath ?? 'ffmpeg',
        'ffmpeg version check',
        options,
      );
      const paths = await mapConcurrent(
        [request.input, ...request.replacements.map(({ source }) => source)],
        options.concurrency ?? 4,
        (source) => resolveSource(source, workspace, options),
      );
      const basePath = paths[0];
      if (basePath === undefined)
        throw new VideoStitchError('PROCESS_FAILED', 'Base path is missing');
      const replacementPaths = paths.slice(1);
      const infos = await mapConcurrent(paths, options.concurrency ?? 4, (path) =>
        probePath(path, path, options),
      );
      const base = infos[0];
      if (base === undefined) throw new VideoStitchError('PROCESS_FAILED', 'Base probe is missing');
      const replacementInfos = infos.slice(1);
      const plan = createReplacementFilter(request, base, replacementInfos);
      const args = ['-hide_banner', '-nostdin', '-progress', 'pipe:2', '-nostats', '-i', basePath];
      for (const path of replacementPaths) args.push('-i', path);
      args.push('-filter_complex', plan.graph, '-map', '[vout]');
      if (plan.hasAudio) args.push('-map', '[aout]');
      args.push(...encodeArguments(request.output, plan.hasAudio), '-y', output.temporaryPath);
      await runProcess(options.ffmpegPath ?? 'ffmpeg', args, {
        operation: 'replaceSegments',
        execution: options,
        duration: base.duration,
        parseProgress: true,
      });
      options.onProgress?.({ phase: 'finalizing', percent: 100 });
      return await output.commit();
    } catch (error) {
      await output.discard();
      throw asVideoStitchError(error, 'replaceSegments');
    }
  });
}
