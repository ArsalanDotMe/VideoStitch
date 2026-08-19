import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cache = join(tmpdir(), 'video-stitch-npm-cache');
await mkdir(cache, { recursive: true });
const { stdout, stderr } = await exec('npm', ['audit', '--audit-level=high', '--cache', cache], {
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(stdout);
process.stderr.write(stderr);
