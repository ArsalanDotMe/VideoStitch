import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrivateAddress } from '../../dist/esm/internal/network.js';
import { redactHeaders, redactText, safeSourceLabel } from '../../dist/esm/internal/redact.js';

test('private, loopback, link-local, mapped, and reserved addresses are rejected', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.1.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'ff02::1',
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
  assert.equal(isPrivateAddress('not-an-ip'), true);
});

test('diagnostics redact URL and header secrets', () => {
  const text = redactText(
    'https://user:pass@example.com/video.mp4?signature=secret authorization: bearer-token',
  );
  assert.doesNotMatch(text, /pass|secret|bearer-token/u);
  assert.deepEqual(redactHeaders({ Authorization: 'secret', Accept: 'video/mp4' }), {
    Authorization: '[redacted]',
    Accept: 'video/mp4',
  });
  assert.equal(
    safeSourceLabel('https://user:pass@example.com/video.mp4?signature=secret#fragment'),
    'https://example.com/video.mp4',
  );
  assert.equal(safeSourceLabel('/tmp/a video.mp4'), '/tmp/a video.mp4');
});
