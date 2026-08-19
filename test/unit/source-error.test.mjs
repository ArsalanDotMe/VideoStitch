import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { asVideoStitchError, VideoStitchError } from '../../dist/esm/error.js';
import { resolveSource } from '../../dist/esm/internal/source.js';
import { withWorkspace } from '../../dist/esm/internal/workspace.js';

test('source resolution distinguishes files, URLs, objects, and missing inputs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-source-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const file = join(directory, 'clip with spaces.mp4');
  await writeFile(file, 'fixture');
  assert.equal(await resolveSource(file, directory, {}), file);
  await assert.rejects(resolveSource('', directory, {}), { code: 'INVALID_INPUT' });
  await assert.rejects(resolveSource(join(directory, 'missing.mp4'), directory, {}), {
    code: 'SOURCE_NOT_FOUND',
  });
  await assert.rejects(resolveSource('http://example.com/a.mp4', directory, {}), {
    code: 'REMOTE_SOURCE_DENIED',
  });
  await assert.rejects(resolveSource(new URL('ftp://example.com/a.mp4'), directory, {}), {
    code: 'REMOTE_SOURCE_DENIED',
  });
  await assert.rejects(
    resolveSource(
      { url: 'https://127.0.0.1/a.mp4', headers: { Authorization: 'x' } },
      directory,
      {},
    ),
    { code: 'REMOTE_SOURCE_DENIED' },
  );
});

test('error normalization preserves known errors and maps aborts and unknown failures', () => {
  const known = new VideoStitchError('INVALID_INPUT', 'known');
  assert.equal(asVideoStitchError(known, 'test'), known);
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.equal(asVideoStitchError(abort, 'test').code, 'ABORTED');
  assert.equal(asVideoStitchError('failure', 'test').code, 'PROCESS_FAILED');
});

test('workspace uses an explicit root, reports lifecycle, and always cleans up', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-workspace-root-'));
  const events = [];
  const logs = [];
  await assert.rejects(
    withWorkspace(
      'test',
      {
        tempDirectory: directory,
        onProgress: (event) => events.push(event),
        logger: { debug: (message, details) => logs.push({ message, details }) },
      },
      async () => {
        throw new Error('expected');
      },
    ),
    /expected/u,
  );
  assert.equal(events[0].phase, 'preparing');
  assert.match(logs[0].message, /workspace/u);
  await rm(directory, { force: true, recursive: true });
});
