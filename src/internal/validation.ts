import { extname, resolve } from 'node:path';
import { VideoStitchError } from '../error.js';
import type { OutputOptions, TimeRange } from '../types.js';

export function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new VideoStitchError('INVALID_INPUT', `${name} must be a finite, non-negative number`);
  }
}

export function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new VideoStitchError(
      'INVALID_INPUT',
      `${name} must be a finite number greater than zero`,
    );
  }
}

export function normalizeRanges(
  ranges: readonly TimeRange[],
  duration: number,
  name = 'ranges',
): readonly TimeRange[] {
  const sorted = ranges.map((range, index) => {
    assertFiniteNonNegative(range.start, `${name}[${index}].start`);
    assertFiniteNonNegative(range.end, `${name}[${index}].end`);
    if (range.end <= range.start) {
      throw new VideoStitchError('INVALID_INPUT', `${name}[${index}].end must be after start`);
    }
    if (range.end > duration) {
      throw new VideoStitchError('INVALID_INPUT', `${name}[${index}] exceeds the media duration`);
    }
    return { start: range.start, end: range.end };
  });

  sorted.sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new VideoStitchError('INVALID_INPUT', `${name} must not overlap`);
    }
  }
  return sorted;
}

export function invertRanges(
  removed: readonly TimeRange[],
  start: number,
  end: number,
): readonly TimeRange[] {
  const kept: TimeRange[] = [];
  let cursor = start;
  for (const range of removed) {
    const rangeStart = Math.max(start, range.start);
    const rangeEnd = Math.min(end, range.end);
    if (rangeEnd <= start || rangeStart >= end) continue;
    if (rangeStart > cursor) kept.push({ start: cursor, end: rangeStart });
    cursor = Math.max(cursor, rangeEnd);
  }
  if (cursor < end) kept.push({ start: cursor, end });
  return kept;
}

export function validateOutput(output: OutputOptions): string {
  if (typeof output.path !== 'string' || output.path.trim() === '') {
    throw new VideoStitchError('INVALID_INPUT', 'output.path must not be empty');
  }
  if (extname(output.path) === '') {
    throw new VideoStitchError('INVALID_INPUT', 'output.path must include a file extension');
  }
  if (output.strategy !== undefined && !['auto', 'copy', 'encode'].includes(output.strategy)) {
    throw new VideoStitchError('INVALID_INPUT', 'output.strategy must be auto, copy, or encode');
  }
  if (output.video?.width !== undefined) assertPositive(output.video.width, 'output.video.width');
  if (output.video?.height !== undefined)
    assertPositive(output.video.height, 'output.video.height');
  if (output.video?.frameRate !== undefined) {
    assertPositive(output.video.frameRate, 'output.video.frameRate');
  }
  if (
    output.video?.crf !== undefined &&
    (!Number.isFinite(output.video.crf) || output.video.crf < 0)
  ) {
    throw new VideoStitchError('INVALID_INPUT', 'output.video.crf must be non-negative');
  }
  if (output.audio?.sampleRate !== undefined) {
    assertPositive(output.audio.sampleRate, 'output.audio.sampleRate');
  }
  if (
    output.audio?.channels !== undefined &&
    (!Number.isInteger(output.audio.channels) || output.audio.channels < 1)
  ) {
    throw new VideoStitchError('INVALID_INPUT', 'output.audio.channels must be a positive integer');
  }
  return resolve(output.path);
}

export function escapeFilterPath(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}
