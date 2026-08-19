import assert from 'node:assert/strict';
import test from 'node:test';
import { createConcatFilter } from '../../dist/esm/concat.js';
import { createEditFilter } from '../../dist/esm/edit.js';
import { createReplacementFilter, replacementPlan } from '../../dist/esm/replace-segments.js';
import { thumbnailFilter } from '../../dist/esm/thumbnails.js';

const video = { index: 0, type: 'video', codec: 'h264', width: 320, height: 180 };
const audio = { index: 1, type: 'audio', codec: 'aac', sampleRate: 48_000, channels: 2 };
const media = (duration = 4, withAudio = true) => ({
  source: 'fixture.mp4',
  duration,
  streams: withAudio ? [video, audio] : [video],
});

test('concat planner supports encoded joins, mixed hard cuts, and both transition types', () => {
  const plain = createConcatFilter(
    {
      inputs: [{ source: 'a' }, { source: 'b' }],
      output: { path: 'out.mp4' },
    },
    [media(), media()],
  );
  assert.match(plain.graph, /concat=n=2:v=1:a=1/u);
  const silent = createConcatFilter(
    {
      inputs: [{ source: 'a' }, { source: 'b' }],
      output: { path: 'out.mp4' },
    },
    [media(4, false), media(4, false)],
  );
  assert.match(silent.graph, /concat=n=2:v=1:a=0/u);
  const transitions = createConcatFilter(
    {
      inputs: [
        { source: 'a', transitionAfter: { type: 'fade-through-black', duration: 0.5 } },
        { source: 'b' },
        { source: 'c', transitionAfter: undefined },
      ],
      output: { path: 'out.mp4' },
    },
    [media(), media(), media()],
  );
  assert.match(transitions.graph, /transition=fadeblack/u);
  assert.match(transitions.graph, /concat=n=2/u);
  assert.throws(
    () =>
      createConcatFilter(
        {
          inputs: [
            { source: 'a', transitionAfter: { type: 'crossfade', duration: 4 } },
            { source: 'b' },
          ],
          output: { path: 'out.mp4' },
        },
        [media(), media()],
      ),
    { code: 'INVALID_INPUT' },
  );
});

test('edit planner covers timeline, transform, overlay, and audio branches', () => {
  const plan = createEditFilter(
    {
      input: 'base',
      output: { path: 'out.mp4' },
      trim: { start: 0.25, end: 3.75 },
      remove: [{ start: 1, end: 1.5 }],
      crop: { width: 300, height: 160, x: 2, y: 3 },
      resize: { width: 640, height: 360, fit: 'contain' },
      rotate: 180,
      flip: 'both',
      speed: 0.25,
      fadeIn: 0.2,
      fadeOut: 0.3,
      volume: 0.5,
      overlays: [{ source: 'overlay', start: 0, x: 1, y: 2, height: 20, opacity: 0.5 }],
      audioTracks: [{ source: 'track', start: 0.2, volume: 0.3 }],
    },
    media(),
    [media(1, false)],
    [media(2)],
  );
  assert.match(plan.graph, /crop=300:160:2:3/u);
  assert.match(plan.graph, /force_original_aspect_ratio=decrease/u);
  assert.match(plan.graph, /hflip,vflip/u);
  assert.match(plan.graph, /atempo=0.5,atempo=0.5/u);
  assert.match(plan.graph, /colorchannelmixer/u);
  assert.match(plan.graph, /amix=inputs=2/u);

  const cover = createEditFilter(
    {
      input: 'base',
      output: { path: 'out.mp4' },
      resize: { width: 100, height: 100, fit: 'cover' },
      rotate: 90,
      flip: 'vertical',
      speed: 4,
      mute: true,
      audioTracks: [{ source: 'track' }],
    },
    media(),
    [],
    [media(1)],
  );
  assert.match(cover.graph, /force_original_aspect_ratio=increase/u);
  assert.match(cover.graph, /transpose=clock/u);
  assert.match(cover.graph, /setpts=PTS\/4/u);

  const fill = createEditFilter(
    {
      input: 'base',
      output: { path: 'out.mp4' },
      resize: { width: 100, height: 50, fit: 'fill' },
      rotate: 270,
      flip: 'horizontal',
    },
    media(2, false),
    [],
    [],
  );
  assert.match(fill.graph, /scale=100:50/u);
  assert.match(fill.graph, /transpose=cclock/u);
  assert.equal(fill.audioLabel, undefined);
});

test('edit planner rejects invalid operations with stable error codes', () => {
  const cases = [
    { trim: { start: 2, end: 1 } },
    { speed: 0.1 },
    { volume: -1 },
    { fadeIn: -1 },
    { fadeOut: -1 },
    { resize: { width: 0, height: 10 } },
    { crop: { width: 10, height: 0 } },
    { crop: { width: 10, height: 10, x: -1 } },
  ];
  for (const value of cases) {
    assert.throws(
      () =>
        createEditFilter({ input: 'base', output: { path: 'x.mp4' }, ...value }, media(), [], []),
      { code: 'INVALID_INPUT' },
    );
  }
  assert.throws(
    () =>
      createEditFilter(
        {
          input: 'base',
          output: { path: 'x.mp4' },
          remove: [{ start: 0, end: 4 }],
        },
        media(),
        [],
        [],
      ),
    { code: 'INVALID_INPUT' },
  );
  for (const overlay of [
    { source: 'x', start: -1 },
    { source: 'x', start: 1, end: 0 },
    { source: 'x', start: 0, opacity: 2 },
    { source: 'x', start: 0, width: 0 },
  ]) {
    assert.throws(
      () =>
        createEditFilter(
          { input: 'base', output: { path: 'x.mp4' }, overlays: [overlay] },
          media(),
          [media(1, false)],
          [],
        ),
      { code: 'INVALID_INPUT' },
    );
  }
  assert.throws(
    () =>
      createEditFilter(
        { input: 'base', output: { path: 'x.mp4' }, audioTracks: [{ source: 'silent' }] },
        media(),
        [],
        [media(1, false)],
      ),
    { code: 'INCOMPATIBLE_MEDIA' },
  );
});

test('replacement and thumbnail planners cover timeline edge cases', () => {
  const request = {
    input: 'base',
    replacements: [
      { at: 2, source: 'b', duration: 1 },
      { at: 0, source: 'a', sourceStart: 0.5, duration: 1 },
    ],
    output: { path: 'out.mp4' },
  };
  const segments = replacementPlan(request, media(4), [media(2), media(2)]);
  assert.equal(segments.length, 4);
  assert.match(
    createReplacementFilter(request, media(4), [media(2), media(2)]).graph,
    /concat=n=4/u,
  );
  assert.match(
    createReplacementFilter(
      {
        input: 'base',
        replacements: [{ at: 1, source: 'silent', duration: 1 }],
        output: { path: 'x.mp4' },
      },
      media(4),
      [media(1, false)],
    ).graph,
    /a=0/u,
  );
  for (const replacements of [
    [{ at: -1, source: 'x', duration: 1 }],
    [{ at: 0, source: 'x', sourceStart: 3, duration: 2 }],
    [{ at: 3.5, source: 'x', duration: 1 }],
    [
      { at: 0, source: 'x', duration: 2 },
      { at: 1, source: 'y', duration: 1 },
    ],
  ]) {
    assert.throws(
      () =>
        replacementPlan(
          { input: 'base', replacements, output: { path: 'x.mp4' } },
          media(4),
          replacements.map(() => media(4)),
        ),
      { code: 'INVALID_INPUT' },
    );
  }
  assert.match(
    thumbnailFilter({ input: 'x', times: [1], outputDirectory: '.', width: 100 }),
    /trim=start=1/u,
  );
  assert.match(
    thumbnailFilter({ input: 'x', times: [1, 2], outputDirectory: '.', height: 100 }),
    /split=2/u,
  );
});
