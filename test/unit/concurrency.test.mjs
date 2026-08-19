import assert from 'node:assert/strict';
import test from 'node:test';
import { mapConcurrent } from '../../dist/esm/internal/concurrency.js';

test('concurrency helper preserves ordering and respects its limit', async () => {
  let active = 0;
  let maximum = 0;
  const values = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(values, [2, 4, 6, 8]);
  assert.equal(maximum, 2);
  await assert.rejects(
    mapConcurrent([1], 0, async (value) => value),
    { code: 'INVALID_INPUT' },
  );
  await assert.rejects(
    mapConcurrent([1], 33, async (value) => value),
    { code: 'INVALID_INPUT' },
  );
});
