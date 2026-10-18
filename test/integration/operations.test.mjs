import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { concat, edit, probe, replaceSegments, thumbnails } from '../../dist/esm/index.js';

const exec = promisify(execFile);

async function makeFixture(path, color, frequency, duration = 2, frameRate = 24) {
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=160x90:r=${frameRate}:d=${duration}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`,
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-y',
    path,
  ]);
}

test('real FFmpeg workflows produce expected output metadata', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'video-stitch-integration-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const red = join(directory, 'red clip.mp4');
  const blue = join(directory, "blue'clip.mp4");
  const overlay = join(directory, 'overlay.png');
  await makeFixture(red, 'red', 440);
  await makeFixture(blue, 'blue', 880);
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=white:s=16x16:d=0.1',
    '-frames:v',
    '1',
    '-y',
    overlay,
  ]);

  await t.test('probe exposes typed video and audio metadata', async () => {
    const info = await probe(red);
    assert.ok(Math.abs(info.duration - 2) < 0.1);
    assert.equal(info.streams.find((stream) => stream.type === 'video')?.width, 160);
    assert.equal(info.streams.find((stream) => stream.type === 'audio')?.sampleRate, 48_000);
  });

  await t.test('concat auto stream-copies compatible clips', async () => {
    const output = join(directory, 'concat-copy.mp4');
    await concat({
      inputs: [{ source: red }, { source: blue }],
      output: { path: output },
    });
    const info = await probe(output);
    assert.ok(Math.abs(info.duration - 4) < 0.2);
  });

  await t.test('concat encodes a crossfade in one operation', async () => {
    const output = join(directory, 'concat-transition.mp4');
    await concat({
      inputs: [
        { source: red, transitionAfter: { type: 'crossfade', duration: 0.25 } },
        { source: blue },
      ],
      output: { path: output },
    });
    const info = await probe(output);
    assert.ok(Math.abs(info.duration - 3.75) < 0.25);
    assert.equal(info.streams.find((stream) => stream.type === 'video')?.frameRate, 24);
  });

  await t.test(
    'transitions retain source or requested CFR across multi-clip timelines',
    async (t) => {
      for (const scenario of [
        { name: '25fps', rate: '25', count: 2 },
        { name: 'fractional-fades', rate: '30000/1001', count: 3 },
        { name: 'fractional-cut-fade', rate: '24000/1001', count: 3, cut: true },
        { name: 'requested-rate', rate: '24', count: 3, cut: true, outputRate: 30 },
      ]) {
        await t.test(scenario.name, async () => {
          const inputs = [];
          for (let index = 0; index < scenario.count; index += 1) {
            const source = join(directory, `${scenario.name}-${index}.mp4`);
            await makeFixture(
              source,
              index % 2 === 0 ? 'red' : 'blue',
              440,
              2,
              scenario.outputRate && index === 1 ? '25' : scenario.rate,
            );
            inputs.push({
              source,
              ...(index < scenario.count - 1 && !(scenario.cut && index === 0)
                ? { transitionAfter: { type: 'crossfade', duration: 0.25 } }
                : {}),
            });
          }
          const output = join(directory, `${scenario.name}-out.mp4`);
          await concat({
            inputs,
            output: {
              path: output,
              ...(scenario.outputRate ? { video: { frameRate: scenario.outputRate } } : {}),
            },
          });
          const { stdout } = await exec('ffprobe', [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-count_frames',
            '-show_entries',
            'stream=r_frame_rate,avg_frame_rate,nb_read_frames,duration',
            '-of',
            'json',
            output,
          ]);
          const [stream] = JSON.parse(stdout).streams;
          t.diagnostic(`${scenario.name}: ${JSON.stringify(stream)}`);
          const rational = scenario.outputRate
            ? `${scenario.outputRate}/1`
            : scenario.rate.includes('/')
              ? scenario.rate
              : `${scenario.rate}/1`;
          assert.equal(stream.r_frame_rate, rational);
          assert.equal(stream.avg_frame_rate, rational);
          const [numerator, denominator] = rational.split('/').map(Number);
          const fps = numerator / denominator;
          const duration =
            scenario.count * 2 -
            inputs.reduce((total, input) => total + (input.transitionAfter?.duration ?? 0), 0);
          assert.ok(Math.abs(Number(stream.duration) - duration) < 3 / fps);
          assert.ok(Math.abs(Number(stream.nb_read_frames) - duration * fps) < 3);
        });
      }
    },
  );

  await t.test('edit removes time, transforms video, mixes audio, and overlays media', async () => {
    const output = join(directory, 'edited.mp4');
    await edit({
      input: red,
      output: { path: output },
      remove: [{ start: 0.5, end: 1 }],
      resize: { width: 128, height: 72, fit: 'cover' },
      flip: 'horizontal',
      speed: 1.5,
      fadeIn: 0.1,
      fadeOut: 0.1,
      volume: 0.5,
      overlays: [{ source: overlay, start: 0.1, end: 0.5, x: 4, y: 4, width: 32 }],
      audioTracks: [{ source: blue, start: 0.1, volume: 0.1 }],
    });
    const info = await probe(output);
    const video = info.streams.find((stream) => stream.type === 'video');
    assert.equal(video?.width, 128);
    assert.equal(video?.height, 72);
    assert.ok(info.duration >= 1.9 && info.duration <= 2.2);
  });

  await t.test('replaceSegments preserves the base timeline duration', async () => {
    const output = join(directory, 'replaced.mp4');
    await replaceSegments({
      input: red,
      replacements: [{ at: 0.5, source: blue, sourceStart: 0.25, duration: 0.5 }],
      output: { path: output },
    });
    const info = await probe(output);
    assert.ok(Math.abs(info.duration - 2) < 0.2);
  });

  await t.test('thumbnails extracts multiple frames in one FFmpeg process', async () => {
    const files = await thumbnails({
      input: red,
      times: [0.1, 1],
      outputDirectory: join(directory, 'thumbs'),
      width: 80,
      format: 'png',
    });
    assert.equal(files.length, 2);
    for (const file of files) {
      const info = await probe(file);
      assert.equal(info.streams[0]?.width, 80);
    }
  });
});
