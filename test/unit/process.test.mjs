import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProcess, assertSupportedExecutable } from '../../dist/esm/internal/process.js';

test('process runner captures output without a shell', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("ok")'], {
    operation: 'test',
    execution: {},
  });
  assert.equal(result.stdout, 'ok');
});

test('process runner maps missing, failing, timeout, and aborted processes', async () => {
  await assert.rejects(
    runProcess('/definitely/missing/video-stitch-binary', [], {
      operation: 'missing',
      execution: {},
    }),
    { code: 'FFMPEG_NOT_FOUND' },
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'process.stderr.write("token=secret");process.exit(7)'], {
      operation: 'failure',
      execution: {},
    }),
    (error) => error.code === 'PROCESS_FAILED' && error.exitCode === 7,
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      operation: 'timeout',
      execution: { timeoutMs: 20 },
    }),
    { code: 'TIMEOUT' },
  );
  const controller = new AbortController();
  const promise = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    operation: 'abort',
    execution: { signal: controller.signal },
  });
  controller.abort();
  await assert.rejects(promise, { code: 'ABORTED' });
});

test('version checks reject old and malformed binaries', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-version-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const old = join(directory, 'old-ffmpeg');
  await writeFile(old, '#!/usr/bin/env node\nprocess.stdout.write("ffmpeg version 5.1.2")\n');
  await chmod(old, 0o755);
  await assert.rejects(assertSupportedExecutable(old, 'version', {}), {
    code: 'UNSUPPORTED_FFMPEG',
  });
});
