import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { concat, probe, replaceSegments } from '../dist/esm/index.js';

const exec = promisify(execFile);
const workspace = await mkdtemp(join(tmpdir(), 'video-stitch-benchmark-'));
const reportDirectory = resolve('.benchmark-output');
await mkdir(reportDirectory, { recursive: true });

async function fixture(path, color, duration) {
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=1280x720:r=30:d=${duration}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=48000:duration=${duration}`,
    '-shortest',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-y',
    path,
  ]);
}

async function measure(name, operation) {
  let processingInvocations = 0;
  const started = performance.now();
  const output = await operation({
    logger: {
      debug(message, details) {
        if (message === 'Starting media process' && details?.operation === name) {
          processingInvocations += 1;
        }
      },
    },
  });
  const elapsedMs = performance.now() - started;
  const info = await probe(output);
  return {
    name,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    processingInvocations,
    outputBytes: (await stat(output)).size,
    outputDuration: info.duration,
  };
}

try {
  const base = join(workspace, 'base.mp4');
  const first = join(workspace, 'first.mp4');
  const second = join(workspace, 'second.mp4');
  await Promise.all([
    fixture(base, 'black', 6),
    fixture(first, 'red', 3),
    fixture(second, 'blue', 3),
  ]);

  const results = [];
  results.push(
    await measure('concat', (options) =>
      concat(
        {
          inputs: [{ source: first }, { source: second }],
          output: { path: join(workspace, 'v2-concat.mp4') },
        },
        options,
      ),
    ),
  );
  results.push(
    await measure('replaceSegments', (options) =>
      replaceSegments(
        {
          input: base,
          replacements: [{ at: 2, source: first, duration: 1 }],
          output: { path: join(workspace, 'v2-replace.mp4') },
        },
        options,
      ),
    ),
  );

  let v1 = {
    status: 'not-run',
    reason: 'Set VIDEO_STITCH_V1_PACKAGE to the pinned v1.7.1 tarball',
  };
  if (process.env.VIDEO_STITCH_V1_PACKAGE) {
    const consumer = join(workspace, 'v1-consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), '{"private":true}\n');
    await exec(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--cache',
        join(workspace, 'npm-cache'),
        process.env.VIDEO_STITCH_V1_PACKAGE,
      ],
      { cwd: consumer },
    );
    const require = createRequire(join(consumer, 'benchmark.cjs'));
    const legacy = require('video-stitch');
    const started = performance.now();
    const output = await legacy
      .concat({ overwrite: true })
      .clips([{ fileName: first }, { fileName: second }])
      .output(join(workspace, 'v1-concat.mp4'))
      .concat();
    v1 = {
      status: 'completed',
      concat: {
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        outputBytes: (await stat(output)).size,
      },
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    ffmpeg: (await exec('ffmpeg', ['-version'])).stdout.split('\n')[0],
    v2: results,
    v1,
    structuralAcceptance: {
      concatSingleProcessingInvocation: results[0].processingInvocations === 1,
      replacementSingleProcessingInvocation: results[1].processingInvocations === 1,
    },
  };
  await writeFile(join(reportDirectory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(workspace, { force: true, recursive: true });
}
