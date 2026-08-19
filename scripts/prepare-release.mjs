import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const semverPattern =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const version = process.argv[2];
const requested = version ? semverPattern.exec(version) : undefined;
if (!version || !requested?.groups) {
  throw new Error('Usage: npm run release:prepare -- <semver>');
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) return Number(BigInt(left) - BigInt(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right, 'en');
}

function compareSemver(left, right) {
  const leftMatch = semverPattern.exec(left);
  const rightMatch = semverPattern.exec(right);
  if (!leftMatch?.groups || !rightMatch?.groups) throw new Error('Invalid package version');
  for (const key of ['major', 'minor', 'patch']) {
    const difference = Number(BigInt(leftMatch.groups[key]) - BigInt(rightMatch.groups[key]));
    if (difference !== 0) return difference;
  }
  const leftPrerelease = leftMatch.groups.prerelease;
  const rightPrerelease = rightMatch.groups.prerelease;
  if (!leftPrerelease || !rightPrerelease) {
    if (leftPrerelease === rightPrerelease) return 0;
    return leftPrerelease ? -1 : 1;
  }
  const leftIdentifiers = leftPrerelease.split('.');
  const rightIdentifiers = rightPrerelease.split('.');
  for (
    let index = 0;
    index < Math.max(leftIdentifiers.length, rightIdentifiers.length);
    index += 1
  ) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    const difference = compareIdentifiers(leftIdentifier, rightIdentifier);
    if (difference !== 0) return difference;
  }
  return 0;
}

const packageUrl = new URL('../package.json', import.meta.url);
const currentVersion = JSON.parse(await readFile(packageUrl, 'utf8')).version;
if (typeof currentVersion !== 'string' || compareSemver(version, currentVersion) <= 0) {
  throw new Error(
    `Release version ${version} must be greater than current version ${currentVersion}`,
  );
}
const { stdout: status } = await exec('git', ['status', '--porcelain']);
if (status.trim() !== '') throw new Error('Release preparation requires a clean worktree');
const branch = `release/v${version}`;
try {
  await exec('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  throw new Error(`Branch ${branch} already exists`);
} catch (error) {
  if (error.message?.startsWith('Branch ')) throw error;
}
await exec('git', ['switch', '-c', branch]);
await exec('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts']);
const changelogUrl = new URL('../CHANGELOG.md', import.meta.url);
const changelog = await readFile(changelogUrl, 'utf8');
if (!changelog.includes('## [Unreleased]'))
  throw new Error('CHANGELOG.md has no Unreleased section');
const date = new Date().toISOString().slice(0, 10);
await writeFile(
  changelogUrl,
  changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`),
);
process.stdout.write(`Prepared ${branch}. Review, commit, and open a PR labelled release.\n`);
