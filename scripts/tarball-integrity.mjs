import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/tarball-integrity.mjs <tarball>');
const bytes = await readFile(path);
process.stdout.write(`sha512-${createHash('sha512').update(bytes).digest('base64')}\n`);
