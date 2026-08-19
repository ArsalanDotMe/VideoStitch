export type ErrorCode =
  | 'INVALID_INPUT'
  | 'FFMPEG_NOT_FOUND'
  | 'UNSUPPORTED_FFMPEG'
  | 'SOURCE_NOT_FOUND'
  | 'REMOTE_SOURCE_DENIED'
  | 'REMOTE_FETCH_FAILED'
  | 'OUTPUT_EXISTS'
  | 'INCOMPATIBLE_MEDIA'
  | 'PROCESS_FAILED'
  | 'TIMEOUT'
  | 'ABORTED';

export type EncodingStrategy = 'auto' | 'copy' | 'encode';

export interface HttpsMediaSource {
  readonly url: string | URL;
  readonly headers?: Readonly<Record<string, string>>;
}

export type MediaSource = string | URL | HttpsMediaSource;

export interface Logger {
  debug?(message: string, details?: Readonly<Record<string, unknown>>): void;
  info?(message: string, details?: Readonly<Record<string, unknown>>): void;
  warn?(message: string, details?: Readonly<Record<string, unknown>>): void;
  error?(message: string, details?: Readonly<Record<string, unknown>>): void;
}

export type ProgressPhase = 'preparing' | 'downloading' | 'probing' | 'processing' | 'finalizing';

export interface ProgressEvent {
  readonly phase: ProgressPhase;
  readonly percent?: number;
  readonly processedSeconds?: number;
  readonly fps?: number;
  readonly speed?: number;
  readonly source?: string;
}

export interface RemoteSourceOptions {
  readonly allowPrivateNetworks?: boolean;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly stallTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
}

export interface OperationOptions {
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly tempDirectory?: string;
  readonly concurrency?: number;
  readonly remote?: RemoteSourceOptions;
  readonly logger?: Logger;
  readonly onProgress?: (event: ProgressEvent) => void;
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export interface VideoEncodingOptions {
  readonly codec?: string;
  readonly crf?: number;
  readonly preset?: string;
  readonly pixelFormat?: string;
  readonly frameRate?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface AudioEncodingOptions {
  readonly codec?: string;
  readonly bitrate?: string;
  readonly sampleRate?: number;
  readonly channels?: number;
}

export interface OutputOptions {
  readonly path: string;
  readonly overwrite?: boolean;
  readonly strategy?: EncodingStrategy;
  readonly video?: VideoEncodingOptions;
  readonly audio?: AudioEncodingOptions;
}

export interface MediaStreamInfo {
  readonly index: number;
  readonly type: string;
  readonly codec?: string;
  readonly codecLongName?: string;
  readonly profile?: string;
  readonly level?: number;
  readonly timeBase?: string;
  readonly codecTag?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pixelFormat?: string;
  readonly sampleFormat?: string;
  readonly frameRate?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly channelLayout?: string;
  readonly duration?: number;
  readonly rotation?: number;
}

export interface MediaInfo {
  readonly source: string;
  readonly format?: string;
  readonly formatLongName?: string;
  readonly duration: number;
  readonly size?: number;
  readonly bitrate?: number;
  readonly streams: readonly MediaStreamInfo[];
}

export interface ConcatInput {
  readonly source: MediaSource;
  readonly transitionAfter?: {
    readonly type: 'crossfade' | 'fade-through-black';
    readonly duration: number;
  };
}

export interface ConcatRequest {
  readonly inputs: readonly ConcatInput[];
  readonly output: OutputOptions;
}

export interface ResizeOptions {
  readonly width: number;
  readonly height: number;
  readonly fit?: 'contain' | 'cover' | 'fill';
}

export interface CropOptions {
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

export interface OverlayOptions {
  readonly source: MediaSource;
  readonly start: number;
  readonly end?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly opacity?: number;
}

export interface AudioTrackOptions {
  readonly source: MediaSource;
  readonly start?: number;
  readonly volume?: number;
}

export interface EditRequest {
  readonly input: MediaSource;
  readonly output: OutputOptions;
  readonly trim?: Partial<TimeRange>;
  readonly remove?: readonly TimeRange[];
  readonly resize?: ResizeOptions;
  readonly crop?: CropOptions;
  readonly rotate?: 0 | 90 | 180 | 270;
  readonly flip?: 'horizontal' | 'vertical' | 'both';
  readonly speed?: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly mute?: boolean;
  readonly volume?: number;
  readonly audioTracks?: readonly AudioTrackOptions[];
  readonly overlays?: readonly OverlayOptions[];
}

export interface ReplacementSegment {
  readonly at: number;
  readonly source: MediaSource;
  readonly sourceStart?: number;
  readonly duration?: number;
}

export interface ReplaceSegmentsRequest {
  readonly input: MediaSource;
  readonly replacements: readonly ReplacementSegment[];
  readonly output: OutputOptions;
}

export interface ThumbnailsRequest {
  readonly input: MediaSource;
  readonly times: readonly number[];
  readonly outputDirectory: string;
  readonly format?: 'jpeg' | 'png';
  readonly prefix?: string;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly overwrite?: boolean;
}
