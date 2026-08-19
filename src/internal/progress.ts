import type { ProgressEvent } from '../types.js';

export interface ProgressParser {
  push(chunk: string): void;
  finish(): void;
}

export function createProgressParser(
  duration: number | undefined,
  emit: ((event: ProgressEvent) => void) | undefined,
): ProgressParser {
  let buffered = '';
  let fields: Record<string, string> = {};

  const flush = (): void => {
    const processedRaw = fields.out_time_us ?? fields.out_time_ms;
    const processedSeconds =
      processedRaw === undefined ? undefined : Number(processedRaw) / 1_000_000;
    const fps = fields.fps === undefined ? undefined : Number(fields.fps);
    const speedRaw = fields.speed?.replace(/x$/u, '');
    const speed = speedRaw === undefined ? undefined : Number(speedRaw);
    const event: ProgressEvent = {
      phase: 'processing',
      ...(processedSeconds !== undefined && Number.isFinite(processedSeconds)
        ? { processedSeconds }
        : {}),
      ...(duration !== undefined && processedSeconds !== undefined && duration > 0
        ? { percent: Math.min(100, Math.max(0, (processedSeconds / duration) * 100)) }
        : {}),
      ...(fps !== undefined && Number.isFinite(fps) ? { fps } : {}),
      ...(speed !== undefined && Number.isFinite(speed) ? { speed } : {}),
    };
    emit?.(event);
    fields = {};
  };

  const consumeLine = (line: string): void => {
    const separator = line.indexOf('=');
    if (separator <= 0) return;
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    fields[name] = value;
    if (name === 'progress') flush();
  };

  return {
    push(chunk) {
      buffered += chunk;
      let newline = buffered.indexOf('\n');
      while (newline >= 0) {
        consumeLine(buffered.slice(0, newline).trim());
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf('\n');
      }
    },
    finish() {
      if (buffered.trim() !== '') consumeLine(buffered.trim());
      if (Object.keys(fields).length > 0) flush();
    },
  };
}
