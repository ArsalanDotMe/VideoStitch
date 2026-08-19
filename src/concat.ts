import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VideoStitchError, asVideoStitchError } from './error.js';
import type { ConcatRequest, MediaInfo, OperationOptions } from './types.js';
import {
  audioNormalizationFilter,
  encodeArguments,
  videoNormalizationFilter,
} from './internal/ffmpeg.js';
import { mapConcurrent } from './internal/concurrency.js';
import { prepareOutput } from './internal/output.js';
import { assertSupportedExecutable, runProcess } from './internal/process.js';
import { areCopyCompatible, assertVideo, probePath } from './internal/probe.js';
import { resolveSource } from './internal/source.js';
import { assertPositive } from './internal/validation.js';
import { withWorkspace } from './internal/workspace.js';

function concatFileLine(path: string): string {
  const escaped = path.replaceAll('\\', '\\\\').replaceAll("'", "'\\''");
  return `file '${escaped}'`;
}

export function createConcatFilter(
  request: ConcatRequest,
  infos: readonly MediaInfo[],
): { readonly graph: string; readonly videoLabel: string; readonly audioLabel?: string } {
  const filters: string[] = [];
  const allHaveAudio = infos.every(
    (info) => info.streams.find((stream) => stream.type === 'audio') !== undefined,
  );
  infos.forEach((info, index) => {
    filters.push(`[${index}:v:0]${videoNormalizationFilter(info, request.output)}[v${index}]`);
    const audio = audioNormalizationFilter(info);
    if (allHaveAudio && audio !== undefined) filters.push(`[${index}:a:0]${audio}[a${index}]`);
  });

  const hasTransitions = request.inputs.some((input) => input.transitionAfter !== undefined);
  if (!hasTransitions) {
    const inputs = infos
      .map((_, index) => `[v${index}]${allHaveAudio ? `[a${index}]` : ''}`)
      .join('');
    filters.push(
      `${inputs}concat=n=${infos.length}:v=1:a=${allHaveAudio ? 1 : 0}[vout]${allHaveAudio ? '[aout]' : ''}`,
    );
    return {
      graph: filters.join(';'),
      videoLabel: 'vout',
      ...(allHaveAudio ? { audioLabel: 'aout' } : {}),
    };
  }

  let videoLabel = 'v0';
  let audioLabel = allHaveAudio ? 'a0' : undefined;
  let timelineDuration = infos[0]?.duration ?? 0;
  for (let index = 1; index < infos.length; index += 1) {
    const previousInput = request.inputs[index - 1];
    const transition = previousInput?.transitionAfter;
    const nextDuration = infos[index]?.duration ?? 0;
    const nextVideo = `v${index}`;
    const outputVideo = `vx${index}`;
    if (transition === undefined) {
      filters.push(`[${videoLabel}][${nextVideo}]concat=n=2:v=1:a=0[${outputVideo}]`);
      if (audioLabel !== undefined) {
        filters.push(`[${audioLabel}][a${index}]concat=n=2:v=0:a=1[ax${index}]`);
        audioLabel = `ax${index}`;
      }
      timelineDuration += nextDuration;
    } else {
      assertPositive(transition.duration, `inputs[${index - 1}].transitionAfter.duration`);
      if (transition.duration >= timelineDuration || transition.duration >= nextDuration) {
        throw new VideoStitchError(
          'INVALID_INPUT',
          `Transition ${index - 1} must be shorter than both adjacent clips`,
        );
      }
      const offset = timelineDuration - transition.duration;
      const ffmpegTransition = transition.type === 'crossfade' ? 'fade' : 'fadeblack';
      filters.push(
        `[${videoLabel}][${nextVideo}]xfade=transition=${ffmpegTransition}:duration=${transition.duration}:offset=${offset}[${outputVideo}]`,
      );
      if (audioLabel !== undefined) {
        filters.push(
          `[${audioLabel}][a${index}]acrossfade=d=${transition.duration}:c1=tri:c2=tri[ax${index}]`,
        );
        audioLabel = `ax${index}`;
      }
      timelineDuration += nextDuration - transition.duration;
    }
    videoLabel = outputVideo;
  }
  return {
    graph: filters.join(';'),
    videoLabel,
    ...(audioLabel === undefined ? {} : { audioLabel }),
  };
}

export async function concat(
  request: ConcatRequest,
  options: OperationOptions = {},
): Promise<string> {
  if (request.inputs.length < 2) {
    throw new VideoStitchError('INVALID_INPUT', 'concat requires at least two inputs');
  }
  if (request.inputs.at(-1)?.transitionAfter !== undefined) {
    throw new VideoStitchError('INVALID_INPUT', 'The final concat input cannot have a transition');
  }

  return withWorkspace('concat', options, async (workspace) => {
    const output = await prepareOutput(request.output);
    try {
      await assertSupportedExecutable(
        options.ffmpegPath ?? 'ffmpeg',
        'ffmpeg version check',
        options,
      );
      const paths = await mapConcurrent(request.inputs, options.concurrency ?? 4, ({ source }) =>
        resolveSource(source, workspace, options),
      );
      const infos = await mapConcurrent(paths, options.concurrency ?? 4, (path) =>
        probePath(path, path, options),
      );
      infos.forEach(assertVideo);
      const hasTransitions = request.inputs.some((input) => input.transitionAfter !== undefined);
      const strategy = request.output.strategy ?? 'auto';
      const compatible = areCopyCompatible(infos);
      const shouldCopy =
        strategy === 'copy' || (strategy === 'auto' && compatible && !hasTransitions);
      if (strategy === 'copy' && (!compatible || hasTransitions)) {
        throw new VideoStitchError(
          'INCOMPATIBLE_MEDIA',
          'Stream-copy concat requires compatible streams and no transitions',
        );
      }

      let args: string[];
      let duration: number;
      if (shouldCopy) {
        const listPath = join(workspace, 'concat.ffconcat');
        await writeFile(
          listPath,
          `ffconcat version 1.0\n${paths.map(concatFileLine).join('\n')}\n`,
          'utf8',
        );
        args = [
          '-hide_banner',
          '-nostdin',
          '-progress',
          'pipe:2',
          '-nostats',
          '-f',
          'concat',
          '-safe',
          '0',
          '-protocol_whitelist',
          'file,crypto,data',
          '-i',
          listPath,
          '-map',
          '0',
          '-c',
          'copy',
          '-y',
          output.temporaryPath,
        ];
        duration = infos.reduce((total, info) => total + info.duration, 0);
      } else {
        const filter = createConcatFilter(request, infos);
        args = ['-hide_banner', '-nostdin', '-progress', 'pipe:2', '-nostats'];
        for (const path of paths) args.push('-i', path);
        args.push('-filter_complex', filter.graph, '-map', `[${filter.videoLabel}]`);
        if (filter.audioLabel !== undefined) args.push('-map', `[${filter.audioLabel}]`);
        args.push(...encodeArguments(request.output, filter.audioLabel !== undefined));
        args.push('-y', output.temporaryPath);
        duration = infos.reduce((total, info) => total + info.duration, 0);
        for (const input of request.inputs) duration -= input.transitionAfter?.duration ?? 0;
      }
      await runProcess(options.ffmpegPath ?? 'ffmpeg', args, {
        operation: 'concat',
        execution: options,
        duration,
        parseProgress: true,
      });
      options.onProgress?.({ phase: 'finalizing', percent: 100 });
      return await output.commit();
    } catch (error) {
      await output.discard();
      throw asVideoStitchError(error, 'concat');
    }
  });
}
