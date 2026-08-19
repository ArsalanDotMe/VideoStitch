import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cache = join(tmpdir(), 'video-stitch-npm-cache');
await mkdir(cache, { recursive: true });
const { stdout } = await exec('npm', ['pack', '--dry-run', '--json', '--cache', cache]);
const [pack] = JSON.parse(stdout);
if (!pack) throw new Error('npm pack did not report a package');
const forbidden = pack.files.filter(({ path }) => /^(src|test|scripts)\//u.test(path));
if (forbidden.length > 0) {
  throw new Error(
    `Forbidden files would be published: ${forbidden.map(({ path }) => path).join(', ')}`,
  );
}
const unpackedWithoutMaps = pack.files
  .filter(({ path }) => !path.endsWith('.map'))
  .reduce((total, { size }) => total + size, 0);
if (unpackedWithoutMaps > 250 * 1024) {
  throw new Error(`Package exceeds the 250 KiB budget without maps: ${unpackedWithoutMaps} bytes`);
}
process.stdout.write(
  `Package ${pack.id}: ${pack.size} byte tarball, ${unpackedWithoutMaps} unpacked bytes excluding maps\n`,
);
