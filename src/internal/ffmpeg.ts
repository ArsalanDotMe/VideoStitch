import type {
  AudioEncodingOptions,
  MediaInfo,
  OutputOptions,
  VideoEncodingOptions,
} from '../types.js';
import { extname } from 'node:path';
import { primaryAudio, primaryVideo } from './probe.js';

export interface NormalizedEncoding {
  readonly video: Required<Pick<VideoEncodingOptions, 'codec' | 'crf' | 'preset' | 'pixelFormat'>> &
    VideoEncodingOptions;
  readonly audio: Required<Pick<AudioEncodingOptions, 'codec' | 'bitrate'>> & AudioEncodingOptions;
}

export function normalizedEncoding(output: OutputOptions): NormalizedEncoding {
  return {
    video: {
      codec: output.video?.codec ?? 'libx264',
      crf: output.video?.crf ?? 23,
      preset: output.video?.preset ?? 'medium',
      pixelFormat: output.video?.pixelFormat ?? 'yuv420p',
      ...output.video,
    },
    audio: {
      codec: output.audio?.codec ?? 'aac',
      bitrate: output.audio?.bitrate ?? '192k',
      ...output.audio,
    },
  };
}

export function encodeArguments(output: OutputOptions, hasAudio: boolean): readonly string[] {
  const { video, audio } = normalizedEncoding(output);
  const args = ['-c:v', video.codec];
  if (output.video?.crf !== undefined || /^libx26[45]$/u.test(video.codec)) {
    args.push('-crf', String(video.crf));
  }
  if (output.video?.preset !== undefined || /^libx26[45]$/u.test(video.codec)) {
    args.push('-preset', video.preset);
  }
  args.push('-pix_fmt', video.pixelFormat);
  if (video.frameRate !== undefined) args.push('-r', String(video.frameRate));
  if (hasAudio) {
    args.push('-c:a', audio.codec, '-b:a', audio.bitrate);
    if (audio.sampleRate !== undefined) args.push('-ar', String(audio.sampleRate));
    if (audio.channels !== undefined) args.push('-ac', String(audio.channels));
  }
  if (['.mp4', '.m4v', '.mov'].includes(extname(output.path).toLowerCase())) {
    args.push('-movflags', '+faststart');
  }
  return args;
}

export function videoNormalizationFilter(info: MediaInfo, output: OutputOptions): string {
  const video = primaryVideo(info);
  const encoding = normalizedEncoding(output).video;
  const width = encoding.width ?? video?.width;
  const height = encoding.height ?? video?.height;
  const filters = ['settb=AVTB', 'setpts=PTS-STARTPTS'];
  if (width !== undefined && height !== undefined) {
    filters.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      'setsar=1',
    );
  }
  if (encoding.frameRate !== undefined) filters.push(`fps=${encoding.frameRate}`);
  return filters.join(',');
}

export function audioNormalizationFilter(info: MediaInfo): string | undefined {
  return primaryAudio(info) === undefined
    ? undefined
    : 'asettb=1/48000,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
}

export function atempoFilters(speed: number): readonly string[] {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  filters.push(`atempo=${remaining}`);
  return filters;
}
