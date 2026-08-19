import { VideoStitchError } from '../error.js';
import type { MediaInfo, MediaStreamInfo, OperationOptions } from '../types.js';
import { runProcess } from './process.js';

interface FfprobeStream {
  readonly index?: number;
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly codec_long_name?: string;
  readonly profile?: string;
  readonly level?: number;
  readonly time_base?: string;
  readonly codec_tag_string?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pix_fmt?: string;
  readonly sample_fmt?: string;
  readonly avg_frame_rate?: string;
  readonly r_frame_rate?: string;
  readonly sample_rate?: string;
  readonly channels?: number;
  readonly channel_layout?: string;
  readonly duration?: string;
  readonly tags?: Readonly<Record<string, string>>;
  readonly side_data_list?: readonly { readonly rotation?: number }[];
}

interface FfprobeFormat {
  readonly format_name?: string;
  readonly format_long_name?: string;
  readonly duration?: string;
  readonly size?: string;
  readonly bit_rate?: string;
}

interface FfprobeDocument {
  readonly streams?: readonly FfprobeStream[];
  readonly format?: FfprobeFormat;
}

function finiteNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function frameRate(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const [numerator, denominator] = value.split('/').map(Number);
  if (numerator === undefined || denominator === undefined || denominator === 0) return undefined;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : undefined;
}

function rotation(stream: FfprobeStream): number | undefined {
  const sideData = stream.side_data_list?.find((item) => item.rotation !== undefined)?.rotation;
  return finiteNumber(sideData ?? stream.tags?.rotate);
}

function parseStream(stream: FfprobeStream): MediaStreamInfo {
  const codec = stream.codec_name;
  const codecLongName = stream.codec_long_name;
  const width = finiteNumber(stream.width);
  const height = finiteNumber(stream.height);
  const pixelFormat = stream.pix_fmt;
  const parsedFrameRate = frameRate(stream.avg_frame_rate ?? stream.r_frame_rate);
  const sampleRate = finiteNumber(stream.sample_rate);
  const channels = finiteNumber(stream.channels);
  const channelLayout = stream.channel_layout;
  const duration = finiteNumber(stream.duration);
  const parsedRotation = rotation(stream);
  return {
    index: stream.index ?? -1,
    type: stream.codec_type ?? 'unknown',
    ...(codec === undefined ? {} : { codec }),
    ...(codecLongName === undefined ? {} : { codecLongName }),
    ...(stream.profile === undefined ? {} : { profile: stream.profile }),
    ...(stream.level === undefined ? {} : { level: stream.level }),
    ...(stream.time_base === undefined ? {} : { timeBase: stream.time_base }),
    ...(stream.codec_tag_string === undefined ? {} : { codecTag: stream.codec_tag_string }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(pixelFormat === undefined ? {} : { pixelFormat }),
    ...(stream.sample_fmt === undefined ? {} : { sampleFormat: stream.sample_fmt }),
    ...(parsedFrameRate === undefined ? {} : { frameRate: parsedFrameRate }),
    ...(sampleRate === undefined ? {} : { sampleRate }),
    ...(channels === undefined ? {} : { channels }),
    ...(channelLayout === undefined ? {} : { channelLayout }),
    ...(duration === undefined ? {} : { duration }),
    ...(parsedRotation === undefined ? {} : { rotation: parsedRotation }),
  };
}

export async function probePath(
  path: string,
  sourceLabel: string,
  options: OperationOptions,
): Promise<MediaInfo> {
  options.onProgress?.({ phase: 'probing', source: sourceLabel });
  const result = await runProcess(
    options.ffprobePath ?? 'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
    { operation: 'probe', execution: options },
  );
  let document: FfprobeDocument;
  try {
    document = JSON.parse(result.stdout) as FfprobeDocument;
  } catch (error) {
    throw new VideoStitchError('PROCESS_FAILED', 'ffprobe returned invalid JSON', {
      cause: error,
      operation: 'probe',
    });
  }
  const duration =
    finiteNumber(document.format?.duration) ??
    Math.max(0, ...(document.streams ?? []).map((stream) => finiteNumber(stream.duration) ?? 0));
  const format = document.format?.format_name;
  const formatLongName = document.format?.format_long_name;
  const size = finiteNumber(document.format?.size);
  const bitrate = finiteNumber(document.format?.bit_rate);
  return {
    source: sourceLabel,
    duration,
    streams: (document.streams ?? []).map(parseStream),
    ...(format === undefined ? {} : { format }),
    ...(formatLongName === undefined ? {} : { formatLongName }),
    ...(size === undefined ? {} : { size }),
    ...(bitrate === undefined ? {} : { bitrate }),
  };
}

export function primaryVideo(info: MediaInfo): MediaStreamInfo | undefined {
  return info.streams.find((stream) => stream.type === 'video');
}

export function primaryAudio(info: MediaInfo): MediaStreamInfo | undefined {
  return info.streams.find((stream) => stream.type === 'audio');
}

export function assertVideo(info: MediaInfo): MediaStreamInfo {
  const stream = primaryVideo(info);
  if (stream === undefined) {
    throw new VideoStitchError('INCOMPATIBLE_MEDIA', 'Media source does not contain video');
  }
  return stream;
}

export function areCopyCompatible(infos: readonly MediaInfo[]): boolean {
  if (infos.length === 0) return false;
  const signature = (info: MediaInfo): string =>
    JSON.stringify(
      info.streams.map((stream) => ({
        type: stream.type,
        codec: stream.codec,
        profile: stream.profile,
        level: stream.level,
        timeBase: stream.timeBase,
        codecTag: stream.codecTag,
        width: stream.width,
        height: stream.height,
        pixelFormat: stream.pixelFormat,
        sampleFormat: stream.sampleFormat,
        sampleRate: stream.sampleRate,
        channels: stream.channels,
        channelLayout: stream.channelLayout,
      })),
    );
  const firstInfo = infos[0];
  if (firstInfo === undefined) return false;
  const first = signature(firstInfo);
  return infos.every((info) => signature(info) === first);
}
