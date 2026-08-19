import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const metadata = JSON.parse(
  await readFile(new URL('../test/baseline/v1.7.1.json', import.meta.url), 'utf8'),
);
const destination = resolve(process.argv[2] ?? basename(metadata.tarball));
const response = await fetch(metadata.tarball, { redirect: 'error' });
if (!response.ok) throw new Error(`Baseline download returned HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const sha1 = createHash('sha1').update(bytes).digest('hex');
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
if (sha1 !== metadata.sha1 || integrity !== metadata.integrity) {
  throw new Error('Published v1.7.1 baseline integrity does not match the pinned metadata');
}
await writeFile(destination, bytes, { flag: 'wx' });
process.stdout.write(`${destination}\n`);
