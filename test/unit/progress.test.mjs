import assert from 'node:assert/strict';
import test from 'node:test';
import { createProgressParser } from '../../dist/esm/internal/progress.js';

test('progress parser handles split chunks and emits bounded progress', () => {
  const events = [];
  const parser = createProgressParser(10, (event) => events.push(event));
  parser.push('fps=30\nout_time_us=5');
  parser.push('000000\nspeed=1.5x\nprogress=continue\n');
  parser.push('out_time_us=12000000\nprogress=end');
  parser.finish();
  assert.deepEqual(events[0], {
    phase: 'processing',
    fps: 30,
    processedSeconds: 5,
    percent: 50,
    speed: 1.5,
  });
  assert.equal(events[1].percent, 100);
});

test('progress parser tolerates malformed fields', () => {
  const events = [];
  const parser = createProgressParser(undefined, (event) => events.push(event));
  parser.push('not-progress\nfps=nope\nprogress=end\n');
  parser.finish();
  assert.deepEqual(events, [{ phase: 'processing' }]);
});
