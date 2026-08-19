import { VideoStitchError, asVideoStitchError } from './error.js';
import type { EditRequest, MediaInfo, OperationOptions, TimeRange } from './types.js';
import { atempoFilters, encodeArguments } from './internal/ffmpeg.js';
import { mapConcurrent } from './internal/concurrency.js';
import { prepareOutput } from './internal/output.js';
import { assertSupportedExecutable, runProcess } from './internal/process.js';
import { assertVideo, primaryAudio, probePath } from './internal/probe.js';
import { resolveSource } from './internal/source.js';
import {
  assertFiniteNonNegative,
  assertPositive,
  invertRanges,
  normalizeRanges,
} from './internal/validation.js';
import { withWorkspace } from './internal/workspace.js';

interface FilterPlan {
  readonly graph: string;
  readonly videoLabel: string;
  readonly audioLabel?: string;
  readonly duration: number;
}

function validateEdit(request: EditRequest, info: MediaInfo): readonly TimeRange[] {
  const start = request.trim?.start ?? 0;
  const end = request.trim?.end ?? info.duration;
  assertFiniteNonNegative(start, 'trim.start');
  assertFiniteNonNegative(end, 'trim.end');
  if (end <= start || end > info.duration) {
    throw new VideoStitchError(
      'INVALID_INPUT',
      'trim must describe a non-empty range within the input',
    );
  }
  if (request.speed !== undefined && (request.speed < 0.25 || request.speed > 4)) {
    throw new VideoStitchError('INVALID_INPUT', 'speed must be between 0.25 and 4');
  }
  if (request.volume !== undefined) assertFiniteNonNegative(request.volume, 'volume');
  if (request.fadeIn !== undefined) assertFiniteNonNegative(request.fadeIn, 'fadeIn');
  if (request.fadeOut !== undefined) assertFiniteNonNegative(request.fadeOut, 'fadeOut');
  if (request.resize !== undefined) {
    assertPositive(request.resize.width, 'resize.width');
    assertPositive(request.resize.height, 'resize.height');
  }
  if (request.crop !== undefined) {
    assertPositive(request.crop.width, 'crop.width');
    assertPositive(request.crop.height, 'crop.height');
    if (request.crop.x !== undefined) assertFiniteNonNegative(request.crop.x, 'crop.x');
    if (request.crop.y !== undefined) assertFiniteNonNegative(request.crop.y, 'crop.y');
  }
  return invertRanges(normalizeRanges(request.remove ?? [], info.duration, 'remove'), start, end);
}

function baseTimeline(
  ranges: readonly TimeRange[],
  hasAudio: boolean,
  filters: string[],
): { video: string; audio?: string } {
  ranges.forEach((range, index) => {
    filters.push(
      `[0:v:0]trim=start=${range.start}:end=${range.end},setpts=PTS-STARTPTS[vkeep${index}]`,
    );
    if (hasAudio) {
      filters.push(
        `[0:a:0]atrim=start=${range.start}:end=${range.end},asetpts=PTS-STARTPTS[akeep${index}]`,
      );
    }
  });
  if (ranges.length === 1) {
    return { video: 'vkeep0', ...(hasAudio ? { audio: 'akeep0' } : {}) };
  }
  const inputs = ranges
    .map((_, index) => `[vkeep${index}]${hasAudio ? `[akeep${index}]` : ''}`)
    .join('');
  filters.push(
    `${inputs}concat=n=${ranges.length}:v=1:a=${hasAudio ? 1 : 0}[vbase]${hasAudio ? '[abase]' : ''}`,
  );
  return { video: 'vbase', ...(hasAudio ? { audio: 'abase' } : {}) };
}

export function createEditFilter(
  request: EditRequest,
  info: MediaInfo,
  overlayInfos: readonly MediaInfo[],
  audioInfos: readonly MediaInfo[],
): FilterPlan {
  const filters: string[] = [];
  const kept = validateEdit(request, info);
  if (kept.length === 0) {
    throw new VideoStitchError('INVALID_INPUT', 'The edit removes the entire input');
  }
  const sourceHasAudio = primaryAudio(info) !== undefined && request.mute !== true;
  let { video: videoLabel, audio: audioLabel } = baseTimeline(kept, sourceHasAudio, filters);
  const speed = request.speed ?? 1;
  let duration = kept.reduce((sum, range) => sum + range.end - range.start, 0) / speed;

  const videoFilters: string[] = [];
  if (request.crop !== undefined) {
    videoFilters.push(
      `crop=${request.crop.width}:${request.crop.height}:${request.crop.x ?? 0}:${request.crop.y ?? 0}`,
    );
  }
  if (request.resize !== undefined) {
    const { width, height, fit = 'contain' } = request.resize;
    if (fit === 'fill') videoFilters.push(`scale=${width}:${height}`);
    if (fit === 'contain') {
      videoFilters.push(
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      );
    }
    if (fit === 'cover') {
      videoFilters.push(
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
      );
    }
    videoFilters.push('setsar=1');
  }
  if (request.rotate === 90) videoFilters.push('transpose=clock');
  if (request.rotate === 180) videoFilters.push('hflip', 'vflip');
  if (request.rotate === 270) videoFilters.push('transpose=cclock');
  if (request.flip === 'horizontal' || request.flip === 'both') videoFilters.push('hflip');
  if (request.flip === 'vertical' || request.flip === 'both') videoFilters.push('vflip');
  if (speed !== 1) videoFilters.push(`setpts=PTS/${speed}`);
  if (request.fadeIn !== undefined && request.fadeIn > 0) {
    videoFilters.push(`fade=t=in:st=0:d=${request.fadeIn}`);
  }
  if (request.fadeOut !== undefined && request.fadeOut > 0) {
    const start = Math.max(0, duration - request.fadeOut);
    videoFilters.push(`fade=t=out:st=${start}:d=${request.fadeOut}`);
  }
  if (videoFilters.length > 0) {
    filters.push(`[${videoLabel}]${videoFilters.join(',')}[vedited]`);
    videoLabel = 'vedited';
  }

  if (audioLabel !== undefined) {
    const audioFilters: string[] = [];
    if (speed !== 1) audioFilters.push(...atempoFilters(speed));
    if (request.volume !== undefined) audioFilters.push(`volume=${request.volume}`);
    if (request.fadeIn !== undefined && request.fadeIn > 0) {
      audioFilters.push(`afade=t=in:st=0:d=${request.fadeIn}`);
    }
    if (request.fadeOut !== undefined && request.fadeOut > 0) {
      const start = Math.max(0, duration - request.fadeOut);
      audioFilters.push(`afade=t=out:st=${start}:d=${request.fadeOut}`);
    }
    if (audioFilters.length > 0) {
      filters.push(`[${audioLabel}]${audioFilters.join(',')}[aedited]`);
      audioLabel = 'aedited';
    }
  }

  (request.overlays ?? []).forEach((overlay, index) => {
    assertFiniteNonNegative(overlay.start, `overlays[${index}].start`);
    if (overlay.end !== undefined) {
      assertFiniteNonNegative(overlay.end, `overlays[${index}].end`);
      if (overlay.end <= overlay.start) {
        throw new VideoStitchError('INVALID_INPUT', `overlays[${index}].end must be after start`);
      }
    }
    if (overlay.opacity !== undefined && (overlay.opacity < 0 || overlay.opacity > 1)) {
      throw new VideoStitchError(
        'INVALID_INPUT',
        `overlays[${index}].opacity must be between 0 and 1`,
      );
    }
    const overlayInfo = overlayInfos[index];
    if (overlayInfo === undefined) {
      throw new VideoStitchError('PROCESS_FAILED', 'Overlay probe result is missing');
    }
    assertVideo(overlayInfo);
    const inputIndex = index + 1;
    const overlayFilters = ['setpts=PTS-STARTPTS'];
    if (overlay.width !== undefined || overlay.height !== undefined) {
      const width = overlay.width ?? -1;
      const height = overlay.height ?? -1;
      if (width !== -1) assertPositive(width, `overlays[${index}].width`);
      if (height !== -1) assertPositive(height, `overlays[${index}].height`);
      overlayFilters.push(`scale=${width}:${height}`);
    }
    if (overlay.opacity !== undefined && overlay.opacity < 1) {
      overlayFilters.push('format=rgba', `colorchannelmixer=aa=${overlay.opacity}`);
    }
    overlayFilters.push(`setpts=PTS+${overlay.start}/TB`);
    filters.push(`[${inputIndex}:v:0]${overlayFilters.join(',')}[overlay${index}]`);
    const enabled =
      overlay.end === undefined
        ? `gte(t,${overlay.start})`
        : `between(t,${overlay.start},${overlay.end})`;
    filters.push(
      `[${videoLabel}][overlay${index}]overlay=${overlay.x ?? 0}:${overlay.y ?? 0}:enable='${enabled}':eof_action=pass:shortest=0[voverlay${index}]`,
    );
    videoLabel = `voverlay${index}`;
  });

  const audioLabels: string[] = audioLabel === undefined ? [] : [audioLabel];
  (request.audioTracks ?? []).forEach((track, index) => {
    const infoForTrack = audioInfos[index];
    if (infoForTrack === undefined) {
      throw new VideoStitchError('PROCESS_FAILED', 'Audio track probe result is missing');
    }
    if (primaryAudio(infoForTrack) === undefined) {
      throw new VideoStitchError('INCOMPATIBLE_MEDIA', `audioTracks[${index}] has no audio stream`);
    }
    const start = track.start ?? 0;
    const volume = track.volume ?? 1;
    assertFiniteNonNegative(start, `audioTracks[${index}].start`);
    assertFiniteNonNegative(volume, `audioTracks[${index}].volume`);
    const inputIndex = 1 + overlayInfos.length + index;
    const delay = Math.round(start * 1000);
    filters.push(
      `[${inputIndex}:a:0]asetpts=PTS-STARTPTS,volume=${volume},adelay=${delay}|${delay}[atrack${index}]`,
    );
    audioLabels.push(`atrack${index}`);
    duration = Math.max(duration, start + infoForTrack.duration);
  });
  if (audioLabels.length > 1) {
    filters.push(
      `${audioLabels.map((label) => `[${label}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[amixed]`,
    );
    audioLabel = 'amixed';
  } else if (audioLabels.length === 1) {
    audioLabel = audioLabels[0];
  }

  return {
    graph: filters.join(';'),
    videoLabel,
    ...(audioLabel === undefined ? {} : { audioLabel }),
    duration,
  };
}

export async function edit(request: EditRequest, options: OperationOptions = {}): Promise<string> {
  if (request.output.strategy === 'copy') {
    throw new VideoStitchError(
      'INCOMPATIBLE_MEDIA',
      'edit requires encoding and cannot stream-copy',
    );
  }
  return withWorkspace('edit', options, async (workspace) => {
    const output = await prepareOutput({ ...request.output, strategy: 'encode' });
    try {
      await assertSupportedExecutable(
        options.ffmpegPath ?? 'ffmpeg',
        'ffmpeg version check',
        options,
      );
      const overlaySources = (request.overlays ?? []).map(({ source }) => source);
      const audioSources = (request.audioTracks ?? []).map(({ source }) => source);
      const paths = await mapConcurrent(
        [request.input, ...overlaySources, ...audioSources],
        options.concurrency ?? 4,
        (source) => resolveSource(source, workspace, options),
      );
      const basePath = paths[0];
      if (basePath === undefined)
        throw new VideoStitchError('PROCESS_FAILED', 'Base path is missing');
      const overlayPaths = paths.slice(1, 1 + overlaySources.length);
      const audioPaths = paths.slice(1 + overlaySources.length);
      const infos = await mapConcurrent(paths, options.concurrency ?? 4, (path) =>
        probePath(path, path, options),
      );
      const info = infos[0];
      if (info === undefined) throw new VideoStitchError('PROCESS_FAILED', 'Base probe is missing');
      const overlayInfos = infos.slice(1, 1 + overlaySources.length);
      const audioInfos = infos.slice(1 + overlaySources.length);
      assertVideo(info);
      const plan = createEditFilter(request, info, overlayInfos, audioInfos);
      const args = ['-hide_banner', '-nostdin', '-progress', 'pipe:2', '-nostats', '-i', basePath];
      overlayPaths.forEach((path, index) => {
        if (overlayInfos[index]?.duration === 0) args.push('-loop', '1');
        args.push('-i', path);
      });
      for (const path of audioPaths) args.push('-i', path);
      args.push('-filter_complex', plan.graph, '-map', `[${plan.videoLabel}]`);
      if (plan.audioLabel !== undefined) args.push('-map', `[${plan.audioLabel}]`);
      args.push(...encodeArguments(request.output, plan.audioLabel !== undefined));
      args.push('-y', output.temporaryPath);
      await runProcess(options.ffmpegPath ?? 'ffmpeg', args, {
        operation: 'edit',
        execution: options,
        duration: plan.duration,
        parseProgress: true,
      });
      options.onProgress?.({ phase: 'finalizing', percent: 100 });
      return await output.commit();
    } catch (error) {
      await output.discard();
      throw asVideoStitchError(error, 'edit');
    }
  });
}
