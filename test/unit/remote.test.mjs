import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { downloadHttpsSource } from '../../dist/esm/internal/remote.js';

function response(statusCode, headers = {}, chunks = []) {
  return Object.assign(Readable.from(chunks), { statusCode, headers });
}

function dependencies(responses, seen = []) {
  return {
    resolveAddress: async () => ({ address: '203.0.113.1', family: 4 }),
    request(url, options, callback) {
      seen.push({ url: url.toString(), headers: options.headers });
      const handle = new EventEmitter();
      handle.setTimeout = () => handle;
      handle.destroy = (error) => {
        if (error) queueMicrotask(() => handle.emit('error', error));
        queueMicrotask(() => handle.emit('close'));
        return handle;
      };
      handle.end = () => {
        const next = responses.shift();
        if (next instanceof Error) {
          queueMicrotask(() => {
            handle.emit('error', next);
            handle.emit('close');
          });
        } else queueMicrotask(() => callback(next));
      };
      return handle;
    },
  };
}

test('managed HTTPS download follows safe redirects, strips secrets, and reports progress', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-remote-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const seen = [];
  const progress = [];
  const path = await downloadHttpsSource(
    {
      url: new URL('https://media.example/start.mp4?secret=value'),
      headers: { Authorization: 'Bearer secret', Accept: 'video/mp4' },
    },
    directory,
    { onProgress: (event) => progress.push(event) },
    dependencies(
      [
        response(302, { location: 'https://cdn.example/video.mp4' }),
        response(200, { 'content-length': '5' }, [Buffer.from('hello')]),
      ],
      seen,
    ),
  );
  assert.equal(await readFile(path, 'utf8'), 'hello');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].headers, { Accept: 'video/mp4' });
  assert.equal(progress.at(-1).percent, 100);
});

test('managed HTTPS download rejects unsafe and broken responses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-remote-errors-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const source = { url: new URL('https://media.example/video.mp4'), headers: {} };
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      { remote: { maxRedirects: 0 } },
      dependencies([response(302, { location: 'https://cdn.example/video.mp4' })]),
    ),
    { code: 'REMOTE_FETCH_FAILED' },
  );
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      {},
      dependencies([response(302, { location: 'http://media.example/video.mp4' })]),
    ),
    { code: 'REMOTE_SOURCE_DENIED' },
  );
  await assert.rejects(downloadHttpsSource(source, directory, {}, dependencies([response(302)])), {
    code: 'REMOTE_FETCH_FAILED',
  });
  await assert.rejects(downloadHttpsSource(source, directory, {}, dependencies([response(503)])), {
    code: 'REMOTE_FETCH_FAILED',
  });
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      { remote: { maxBytes: 2 } },
      dependencies([response(200, { 'content-length': '3' }, [Buffer.from('abc')])]),
    ),
    { code: 'REMOTE_FETCH_FAILED' },
  );
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      { remote: { maxBytes: 2 } },
      dependencies([response(200, {}, [Buffer.from('abc')])]),
    ),
    { code: 'REMOTE_FETCH_FAILED' },
  );
  await assert.rejects(
    downloadHttpsSource(source, directory, {}, dependencies([new Error('socket failed')])),
    { code: 'REMOTE_FETCH_FAILED' },
  );
});

test('managed HTTPS download validates limits and cancellation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-remote-validation-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const source = { url: new URL('https://media.example/video.mp4'), headers: {} };
  for (const remote of [
    { maxBytes: 0 },
    { maxRedirects: -1 },
    { stallTimeoutMs: 0 },
    { totalTimeoutMs: 0 },
  ]) {
    await assert.rejects(downloadHttpsSource(source, directory, { remote }, dependencies([])), {
      code: 'INVALID_INPUT',
    });
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    downloadHttpsSource(source, directory, { signal: controller.signal }, dependencies([])),
    { code: 'ABORTED' },
  );
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      { remote: { totalTimeoutMs: 1 } },
      dependencies([
        Object.assign(
          new Readable({
            read() {
              return undefined;
            },
          }),
          {
            statusCode: 200,
            headers: {},
          },
        ),
      ]),
    ),
    { code: 'TIMEOUT' },
  );

  const streamingController = new AbortController();
  await assert.rejects(
    downloadHttpsSource(
      source,
      directory,
      {
        signal: streamingController.signal,
        onProgress: () => streamingController.abort(),
      },
      dependencies([response(200, {}, [Buffer.from('chunk')])]),
    ),
    { code: 'ABORTED' },
  );
});
