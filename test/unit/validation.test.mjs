import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFiniteNonNegative,
  assertPositive,
  invertRanges,
  normalizeRanges,
  validateOutput,
} from '../../dist/esm/internal/validation.js';

test('time validation accepts finite values and rejects ambiguous values', () => {
  assert.doesNotThrow(() => assertFiniteNonNegative(0, 'time'));
  assert.doesNotThrow(() => assertPositive(0.1, 'duration'));
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => assertFiniteNonNegative(value, 'time'), { code: 'INVALID_INPUT' });
  }
  assert.throws(() => assertPositive(0, 'duration'), { code: 'INVALID_INPUT' });
});

test('ranges are sorted, validated, and inverted', () => {
  const normalized = normalizeRanges(
    [
      { start: 5, end: 6 },
      { start: 1, end: 2 },
    ],
    10,
  );
  assert.deepEqual(normalized, [
    { start: 1, end: 2 },
    { start: 5, end: 6 },
  ]);
  assert.deepEqual(invertRanges(normalized, 0, 10), [
    { start: 0, end: 1 },
    { start: 2, end: 5 },
    { start: 6, end: 10 },
  ]);
  assert.throws(() => normalizeRanges([{ start: 2, end: 1 }], 10), { code: 'INVALID_INPUT' });
  assert.throws(() => normalizeRanges([{ start: 1, end: 11 }], 10), { code: 'INVALID_INPUT' });
  assert.throws(
    () =>
      normalizeRanges(
        [
          { start: 1, end: 3 },
          { start: 2, end: 4 },
        ],
        10,
      ),
    { code: 'INVALID_INPUT' },
  );
});

test('output requires a non-empty extension-bearing path', () => {
  assert.match(validateOutput({ path: 'movie.mp4' }), /movie\.mp4$/u);
  assert.throws(() => validateOutput({ path: '' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateOutput({ path: 'movie' }), { code: 'INVALID_INPUT' });
  for (const output of [
    { path: 'x.mp4', strategy: 'invalid' },
    { path: 'x.mp4', video: { width: 0 } },
    { path: 'x.mp4', video: { height: -1 } },
    { path: 'x.mp4', video: { frameRate: 0 } },
    { path: 'x.mp4', video: { crf: -1 } },
    { path: 'x.mp4', audio: { sampleRate: 0 } },
    { path: 'x.mp4', audio: { channels: 1.5 } },
  ]) {
    assert.throws(() => validateOutput(output), { code: 'INVALID_INPUT' });
  }
});
