import { readFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version) throw new Error('Usage: node scripts/release-notes.mjs <version>');
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const marker = `## [${version}]`;
const start = changelog.indexOf(marker);
if (start < 0) throw new Error(`CHANGELOG.md has no ${marker} section`);
const remaining = changelog.slice(start);
const next = remaining.indexOf('\n## ', marker.length);
process.stdout.write(`${(next < 0 ? remaining : remaining.slice(0, next)).trim()}\n`);
