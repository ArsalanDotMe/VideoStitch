import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const suppliedTarball = process.argv[2] ? resolve(process.argv[2]) : undefined;
const directory = await mkdtemp(join(tmpdir(), 'video-stitch-package-test-'));
try {
  const packDirectory = join(directory, 'pack');
  const cache = join(directory, 'npm-cache');
  await mkdir(packDirectory, { recursive: true });
  await mkdir(cache, { recursive: true });
  let tarball = suppliedTarball;
  let filename;
  if (tarball) {
    filename = tarball.split(/[\\/]/u).at(-1);
  } else {
    const { stdout } = await exec(
      'npm',
      ['pack', '--json', '--pack-destination', packDirectory, '--cache', cache],
      { cwd: root },
    );
    const [pack] = JSON.parse(stdout);
    filename = pack.filename;
    tarball = join(packDirectory, filename);
  }
  const consumer = join(directory, 'consumer');
  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, 'package.json'), '{"type":"module"}\n');
  await exec(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, tarball],
    { cwd: consumer },
  );
  await writeFile(
    join(consumer, 'esm.mjs'),
    "import { probe, VideoStitchError } from 'video-stitch'; if (typeof probe !== 'function' || !VideoStitchError) process.exit(1);\n",
  );
  await writeFile(
    join(consumer, 'cjs.cjs'),
    "const api = require('video-stitch'); if (typeof api.probe !== 'function' || !api.VideoStitchError) process.exit(1);\n",
  );
  await exec(process.execPath, ['esm.mjs'], { cwd: consumer });
  await exec(process.execPath, ['cjs.cjs'], { cwd: consumer });

  await writeFile(
    join(consumer, 'types.ts'),
    "import { probe, type MediaInfo } from 'video-stitch'; const result: Promise<MediaInfo> = probe('video.mp4'); void result;\n",
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        skipLibCheck: true,
      },
      include: ['types.ts'],
    }),
  );
  await exec(join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: consumer });

  const fixture = join(consumer, 'fixture.mp4');
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=32x32:d=0.2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-y',
    fixture,
  ]);
  await writeFile(
    join(consumer, 'smoke.mjs'),
    `import { probe } from 'video-stitch'; const info = await probe(${JSON.stringify(fixture)}); if (!info.streams.some((stream) => stream.type === 'video')) process.exit(1);\n`,
  );
  await exec(process.execPath, ['smoke.mjs'], { cwd: consumer });
  if ((await readFile(tarball)).byteLength === 0) throw new Error('Packed tarball is empty');
  process.stdout.write(`Packed consumer tests passed for ${filename}\n`);
} finally {
  await rm(directory, { force: true, recursive: true });
}
