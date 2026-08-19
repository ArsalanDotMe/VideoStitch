import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareOutput } from '../../dist/esm/internal/output.js';

test('prepared output commits new files and safely replaces existing files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-output-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, 'result.mp4');
  const first = await prepareOutput({ path });
  await writeFile(first.temporaryPath, 'first');
  assert.equal(await first.commit(), path);
  assert.equal(await readFile(path, 'utf8'), 'first');
  await assert.rejects(prepareOutput({ path }), { code: 'OUTPUT_EXISTS' });
  const replacement = await prepareOutput({ path, overwrite: true });
  await writeFile(replacement.temporaryPath, 'second');
  await replacement.commit();
  assert.equal(await readFile(path, 'utf8'), 'second');
  const discarded = await prepareOutput({ path: join(directory, 'discard.mp4') });
  await writeFile(discarded.temporaryPath, 'discard');
  await discarded.discard();
  await assert.rejects(readFile(discarded.temporaryPath));

  const racedPath = join(directory, 'raced.mp4');
  const raced = await prepareOutput({ path: racedPath });
  await writeFile(raced.temporaryPath, 'generated');
  await writeFile(racedPath, 'external');
  await assert.rejects(raced.commit(), { code: 'OUTPUT_EXISTS' });
  assert.equal(await readFile(racedPath, 'utf8'), 'external');
  await raced.discard();
});
