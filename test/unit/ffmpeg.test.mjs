import assert from 'node:assert/strict';
import test from 'node:test';
import {
  atempoFilters,
  audioNormalizationFilter,
  encodeArguments,
  normalizedEncoding,
  videoNormalizationFilter,
} from '../../dist/esm/internal/ffmpeg.js';

const info = {
  source: 'fixture.mp4',
  duration: 2,
  streams: [
    { index: 0, type: 'video', codec: 'h264', width: 320, height: 180 },
    { index: 1, type: 'audio', codec: 'aac' },
  ],
};

test('portable encoding defaults and overrides are deterministic', () => {
  assert.deepEqual(normalizedEncoding({ path: 'out.mp4' }), {
    video: { codec: 'libx264', crf: 23, preset: 'medium', pixelFormat: 'yuv420p' },
    audio: { codec: 'aac', bitrate: '192k' },
  });
  const args = encodeArguments(
    {
      path: 'out.mp4',
      video: { frameRate: 30 },
      audio: { sampleRate: 48_000, channels: 2 },
    },
    true,
  );
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.ok(args.includes('48000'));
  assert.ok(args.includes('+faststart'));
  assert.doesNotMatch(encodeArguments({ path: 'out.mp4' }, false).join(' '), /-c:a/u);
});

test('normalization and tempo filters cover output policies', () => {
  assert.match(videoNormalizationFilter(info, { path: 'out.mp4' }), /scale=320:180/u);
  assert.match(
    videoNormalizationFilter(info, { path: 'out.mp4', video: { width: 640, height: 360 } }),
    /scale=640:360/u,
  );
  assert.match(audioNormalizationFilter(info), /aformat/u);
  assert.equal(audioNormalizationFilter({ ...info, streams: info.streams.slice(0, 1) }), undefined);
  assert.deepEqual(atempoFilters(0.25), ['atempo=0.5', 'atempo=0.5']);
  assert.deepEqual(atempoFilters(4), ['atempo=2', 'atempo=2']);
});
