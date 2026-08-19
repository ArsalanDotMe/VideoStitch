import assert from 'node:assert/strict';
import test from 'node:test';
import {
  concat,
  edit,
  replaceSegments,
  thumbnails,
  VideoStitchError,
} from '../../dist/esm/index.js';

test('public functions reject invalid requests before executing FFmpeg', async () => {
  await assert.rejects(concat({ inputs: [], output: { path: 'x.mp4' } }), {
    code: 'INVALID_INPUT',
  });
  await assert.rejects(
    concat({
      inputs: [
        { source: 'a.mp4' },
        { source: 'b.mp4', transitionAfter: { type: 'crossfade', duration: 1 } },
      ],
      output: { path: 'x.mp4' },
    }),
    { code: 'INVALID_INPUT' },
  );
  await assert.rejects(
    replaceSegments({ input: 'a.mp4', replacements: [], output: { path: 'x.mp4' } }),
    { code: 'INVALID_INPUT' },
  );
  await assert.rejects(thumbnails({ input: 'a.mp4', times: [], outputDirectory: '.' }), {
    code: 'INVALID_INPUT',
  });
  await assert.rejects(
    edit({ input: 'https://127.0.0.1/private.mp4', output: { path: 'x.mp4' } }),
    { code: 'REMOTE_SOURCE_DENIED' },
  );
  await assert.rejects(edit({ input: 'a.mp4', output: { path: 'x.mp4', strategy: 'copy' } }), {
    code: 'INCOMPATIBLE_MEDIA',
  });
  await assert.rejects(
    replaceSegments({
      input: 'a.mp4',
      replacements: [{ at: 0, source: 'b.mp4' }],
      output: { path: 'x.mp4', strategy: 'copy' },
    }),
    { code: 'INCOMPATIBLE_MEDIA' },
  );
});

test('structured errors retain stable metadata', () => {
  const cause = new Error('cause');
  const error = new VideoStitchError('PROCESS_FAILED', 'failed', {
    cause,
    operation: 'edit',
    exitCode: 1,
    diagnostics: 'safe',
  });
  assert.equal(error.name, 'VideoStitchError');
  assert.equal(error.code, 'PROCESS_FAILED');
  assert.equal(error.operation, 'edit');
  assert.equal(error.cause, cause);
});
